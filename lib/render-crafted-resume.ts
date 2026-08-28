import type { CraftedProject, CraftedResumeDoc } from "./crafted-schema";
import { craftedResumeSchema } from "./crafted-schema";
import { resumeDateValue } from "./resume-factory";
import type { MasterResume } from "./schema";

const LABELS = {
  en: {
    summary: "Summary",
    skills: "Skills",
    experience: "Experience",
    projects: "Projects",
    education: "Education",
  },
  zh: {
    summary: "简介",
    skills: "技能",
    experience: "经历",
    projects: "项目",
    education: "教育",
  },
} as const;

function byTimeDesc<T extends { startDate?: string; endDate?: string }>(a: T, b: T) {
  const end = resumeDateValue(b.endDate) - resumeDateValue(a.endDate);
  if (end !== 0) return end;
  return resumeDateValue(b.startDate) - resumeDateValue(a.startDate);
}

/** Sort experiences / projects / education reverse-chronologically. */
export function sortCraftedResumeDoc(doc: CraftedResumeDoc): CraftedResumeDoc {
  return {
    ...doc,
    experiences: [...doc.experiences].sort(byTimeDesc),
    projects: [...doc.projects].sort(byTimeDesc),
    education: [...doc.education].sort(byTimeDesc),
  };
}

function formatRange(start?: string, end?: string) {
  const s = (start ?? "").trim();
  const e = (end ?? "").trim();
  if (s && e) return `${s} – ${e}`;
  return s || e || "";
}

/** Turn bare http(s) URLs into Markdown links; skip segments already linked. */
export function linkifyUrls(text: string): string {
  return text.replace(/(?<!\]\()https?:\/\/[^\s<>)]+[^\s<>.),;:!?]/gi, (url) => {
    try {
      const host = new URL(url).host.replace(/^www\./, "");
      return `[${host}](${url})`;
    } catch {
      return `[${url}](${url})`;
    }
  });
}

/** Turn bare email addresses into mailto Markdown links. */
export function linkifyEmails(text: string): string {
  return text.replace(
    /(?<![(\[])(?<!\]\()[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    (email) => `[${email}](mailto:${email})`,
  );
}

function linkMarkdown(label: string, url: string) {
  const display = label.trim() || url;
  return `[${display}](${url})`;
}

function mailtoLink(email: string) {
  const trimmed = email.trim();
  if (!trimmed) return "";
  return `[${trimmed}](mailto:${trimmed})`;
}

function contactLine(identity: CraftedResumeDoc["identity"]) {
  const links = identity.links
    .map((link) => {
      const label = (link.label ?? "").trim();
      const url = (link.url ?? "").trim();
      if (!url) return "";
      return linkMarkdown(label, url);
    })
    .filter(Boolean);
  const parts = [
    identity.headline,
    identity.location,
    mailtoLink(identity.email),
    identity.phone,
    ...links,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return parts.join("  ·  ");
}

function linkedText(text: string) {
  return linkifyEmails(linkifyUrls(text.trim()));
}

/** Assemble Markdown from structured Star Platinum JSON. */
export function renderCraftedResumeMarkdown(input: CraftedResumeDoc): string {
  const doc = sortCraftedResumeDoc(craftedResumeSchema.parse(input));
  const labels = LABELS[doc.language] ?? LABELS.en;
  const lines: string[] = [];

  lines.push(`# ${doc.identity.name || "Candidate"}`);
  const contact = contactLine(doc.identity);
  if (contact) lines.push(contact);
  lines.push("");

  if (doc.summary.trim()) {
    lines.push(`## ${labels.summary}`);
    lines.push(linkedText(doc.summary));
    lines.push("");
  }

  if (doc.skills.length > 0) {
    lines.push(`## ${labels.skills}`);
    for (const group of doc.skills) {
      const items = group.items.filter(Boolean).join(", ");
      if (!items) continue;
      lines.push(
        group.category ? `- ${linkedText(`${group.category}: ${items}`)}` : `- ${linkedText(items)}`,
      );
    }
    lines.push("");
  }

  if (doc.experiences.length > 0) {
    lines.push(`## ${labels.experience}`);
    for (const exp of doc.experiences) {
      const time = formatRange(exp.startDate, exp.endDate);
      const heading = [exp.title, exp.company].filter(Boolean).join(" — ");
      lines.push(`### ${heading || "Role"}`);
      const meta = [time, exp.location].filter(Boolean).join(" · ");
      if (meta) lines.push(`*${meta}*`);
      for (const bullet of exp.bullets.filter(Boolean)) {
        lines.push(`- ${linkedText(bullet)}`);
      }
      lines.push("");
    }
  }

  if (doc.projects.length > 0) {
    lines.push(`## ${labels.projects}`);
    for (const project of doc.projects) {
      const time = formatRange(project.startDate, project.endDate);
      const heading = [project.name, project.role].filter(Boolean).join(" — ");
      lines.push(`### ${heading || "Project"}`);
      if (time) lines.push(`*${time}*`);
      for (const bullet of project.bullets.filter(Boolean)) {
        lines.push(`- ${linkedText(bullet)}`);
      }
      lines.push("");
    }
  }

  if (doc.education.length > 0) {
    lines.push(`## ${labels.education}`);
    for (const edu of doc.education) {
      const time = formatRange(edu.startDate, edu.endDate);
      const degreeField = [edu.degree, edu.field].filter(Boolean).join(", ");
      const heading = [edu.school, degreeField].filter(Boolean).join(" — ");
      lines.push(`### ${heading || "Education"}`);
      if (time) lines.push(`*${time}*`);
      for (const highlight of (edu.highlights ?? []).filter(Boolean)) {
        lines.push(`- ${linkedText(highlight)}`);
      }
      lines.push("");
    }
  }

  for (const extra of doc.extras) {
    if (!extra.items.length) continue;
    lines.push(`## ${extra.label}`);
    for (const item of extra.items.filter(Boolean)) {
      lines.push(`- ${linkedText(item)}`);
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeProjectKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function masterProjectToCrafted(project: MasterResume["projects"][number]): CraftedProject {
  const bullets = project.bullets
    .map((bullet) => bullet.raw?.trim() || [bullet.action, bullet.result].filter(Boolean).join(" ").trim())
    .filter(Boolean);
  if (bullets.length === 0 && project.summary.trim()) {
    bullets.push(project.summary.trim());
  }
  return {
    name: project.name,
    role: project.role ?? "",
    startDate: project.startDate ?? "",
    endDate: project.endDate ?? "",
    bullets,
  };
}

/** Re-insert any Master Resume projects the model dropped. */
export function ensureMasterProjects(crafted: CraftedResumeDoc, masterResume: MasterResume): CraftedResumeDoc {
  const seen = new Set(crafted.projects.map((project) => normalizeProjectKey(project.name)).filter(Boolean));
  const projects = [...crafted.projects];

  for (const project of masterResume.projects) {
    const key = normalizeProjectKey(project.name);
    if (!key || seen.has(key)) continue;
    projects.push(masterProjectToCrafted(project));
    seen.add(key);
  }

  return sortCraftedResumeDoc({ ...crafted, projects });
}

export function parseAndNormalizeCrafted(raw: unknown, masterResume?: MasterResume): CraftedResumeDoc {
  const crafted = sortCraftedResumeDoc(craftedResumeSchema.parse(raw));
  return masterResume ? ensureMasterProjects(crafted, masterResume) : crafted;
}
