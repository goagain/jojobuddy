import type { Locale } from "./i18n/config";
import { linkifyEmails, linkifyUrls } from "./render-crafted-resume";
import { sortResumeByTime } from "./resume-factory";
import { masterResumeSchema, type MasterResume, type StarBullet } from "./schema";

const LABELS = {
  en: {
    summary: "Summary",
    skills: "Skills",
    softSkills: "Soft skills",
    experience: "Experience",
    projects: "Projects",
    education: "Education",
    certifications: "Certifications",
    languages: "Languages",
    businessContext: "Context",
    techStack: "Tech stack",
  },
  zh: {
    summary: "简介",
    skills: "技能",
    softSkills: "软技能",
    experience: "经历",
    projects: "项目",
    education: "教育",
    certifications: "证书",
    languages: "语言",
    businessContext: "业务背景",
    techStack: "技术栈",
  },
} as const;

function formatRange(start?: string, end?: string) {
  const s = (start ?? "").trim();
  const e = (end ?? "").trim();
  if (s && e) return `${s} – ${e}`;
  return s || e || "";
}

function linkedText(text: string) {
  return linkifyEmails(linkifyUrls(text.trim()));
}

function mailtoLink(email: string) {
  const trimmed = email.trim();
  if (!trimmed) return "";
  return `[${trimmed}](mailto:${trimmed})`;
}

function linkMarkdown(label: string, url: string) {
  const display = label.trim() || url;
  return `[${display}](${url})`;
}

function contactLine(identity: MasterResume["identity"]) {
  const links = (identity.links ?? [])
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

function bulletText(bullet: StarBullet) {
  const raw = bullet.raw?.trim();
  if (raw) return raw;
  return [bullet.situation, bullet.task, bullet.action, bullet.result].filter(Boolean).join(" ").trim();
}

/** Serialize a master resume to pretty-printed JSON (sorted by time). */
export function serializeMasterResumeJson(resume: MasterResume): string {
  return JSON.stringify(sortResumeByTime(masterResumeSchema.parse(resume)), null, 2);
}

/** Assemble Markdown from a structured master resume. */
export function renderMasterResumeMarkdown(resume: MasterResume, locale: Locale = "en"): string {
  const doc = sortResumeByTime(masterResumeSchema.parse(resume));
  const labels = LABELS[locale] ?? LABELS.en;
  const lines: string[] = [];

  lines.push(`# ${doc.identity.name || "Candidate"}`);
  const contact = contactLine(doc.identity);
  if (contact) lines.push(contact);
  lines.push("");

  if (doc.identity.summary?.trim()) {
    lines.push(`## ${labels.summary}`);
    lines.push(linkedText(doc.identity.summary));
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

  if (doc.softSkills.length > 0) {
    lines.push(`## ${labels.softSkills}`);
    lines.push(`- ${linkedText(doc.softSkills.filter(Boolean).join(", "))}`);
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
      if (exp.businessContext.trim()) {
        lines.push(`**${labels.businessContext}:** ${linkedText(exp.businessContext)}`);
      }
      if (exp.techStack.length > 0) {
        lines.push(`**${labels.techStack}:** ${exp.techStack.filter(Boolean).join(", ")}`);
      }
      for (const bullet of exp.bullets) {
        const text = bulletText(bullet);
        if (text) lines.push(`- ${linkedText(text)}`);
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
      if (project.summary.trim()) lines.push(linkedText(project.summary));
      if (project.techStack.length > 0) {
        lines.push(`**${labels.techStack}:** ${project.techStack.filter(Boolean).join(", ")}`);
      }
      for (const bullet of project.bullets) {
        const text = bulletText(bullet);
        if (text) lines.push(`- ${linkedText(text)}`);
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

  if (doc.certifications.length > 0) {
    lines.push(`## ${labels.certifications}`);
    for (const cert of doc.certifications) {
      const meta = [cert.issuer, cert.date].filter(Boolean).join(", ");
      lines.push(meta ? `- ${cert.name} (${meta})` : `- ${cert.name}`);
    }
    lines.push("");
  }

  if (doc.languages.length > 0) {
    lines.push(`## ${labels.languages}`);
    for (const lang of doc.languages) {
      lines.push(`- ${lang.name}${lang.level ? ` (${lang.level})` : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
