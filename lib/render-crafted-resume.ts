import { resumeDateValue } from "./resume-factory";
import type { CraftedResumeDoc } from "./crafted-schema";
import { craftedResumeSchema } from "./crafted-schema";

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

function contactLine(identity: CraftedResumeDoc["identity"]) {
  const parts = [
    identity.headline,
    identity.location,
    identity.email,
    identity.phone,
    ...identity.links.map((link) => (link.label ? `${link.label}: ${link.url}` : link.url)),
  ].filter(Boolean);
  return parts.join("  ·  ");
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
    lines.push(doc.summary.trim());
    lines.push("");
  }

  if (doc.skills.length > 0) {
    lines.push(`## ${labels.skills}`);
    for (const group of doc.skills) {
      const items = group.items.filter(Boolean).join(", ");
      if (!items) continue;
      lines.push(group.category ? `- ${group.category}: ${items}` : `- ${items}`);
    }
    lines.push("");
  }

  if (doc.experiences.length > 0) {
    lines.push(`## ${labels.experience}`);
    for (const exp of doc.experiences) {
      const time = formatRange(exp.startDate, exp.endDate);
      const heading = [exp.title, exp.company, time].filter(Boolean).join("  |  ");
      lines.push(`### ${heading}`);
      for (const bullet of exp.bullets.filter(Boolean)) {
        lines.push(`- ${bullet}`);
      }
      lines.push("");
    }
  }

  if (doc.projects.length > 0) {
    lines.push(`## ${labels.projects}`);
    for (const project of doc.projects) {
      const time = formatRange(project.startDate, project.endDate);
      const heading = [project.name, project.role, time].filter(Boolean).join("  |  ");
      lines.push(`### ${heading}`);
      for (const bullet of project.bullets.filter(Boolean)) {
        lines.push(`- ${bullet}`);
      }
      lines.push("");
    }
  }

  if (doc.education.length > 0) {
    lines.push(`## ${labels.education}`);
    for (const edu of doc.education) {
      const time = formatRange(edu.startDate, edu.endDate);
      const degreeField = [edu.degree, edu.field].filter(Boolean).join(", ");
      const heading = [edu.school, degreeField, time].filter(Boolean).join("  ·  ");
      lines.push(`### ${heading}`);
      for (const highlight of (edu.highlights ?? []).filter(Boolean)) {
        lines.push(`- ${highlight}`);
      }
      lines.push("");
    }
  }

  for (const extra of doc.extras) {
    if (!extra.items.length) continue;
    lines.push(`## ${extra.label}`);
    for (const item of extra.items.filter(Boolean)) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseAndNormalizeCrafted(raw: unknown): CraftedResumeDoc {
  return sortCraftedResumeDoc(craftedResumeSchema.parse(raw));
}
