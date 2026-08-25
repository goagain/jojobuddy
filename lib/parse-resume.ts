import { buildParseResumeMessages } from "./prompts";
import { chat, extractJsonObject } from "./llm";
import type { LlmRuntime } from "./llm-types";
import { uid, sortResumeByTime } from "./resume-factory";
import { masterResumeSchema, type MasterResume } from "./schema";

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,，、|/]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function hydrateResume(raw: unknown): MasterResume {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const identity = (data.identity && typeof data.identity === "object" ? data.identity : {}) as Record<
    string,
    unknown
  >;
  const normalized = {
    ...data,
    identity: {
      name: String(identity.name ?? ""),
      email: String(identity.email ?? ""),
      phone: identity.phone ? String(identity.phone) : "",
      location: identity.location ? String(identity.location) : "",
      headline: identity.headline ? String(identity.headline) : "",
      summary: identity.summary ? String(identity.summary) : "",
      links: Array.isArray(identity.links) ? identity.links : [],
    },
    experiences: Array.isArray(data.experiences)
      ? data.experiences.map((item) => {
          const exp = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          return {
            ...exp,
            id: String(exp.id || uid()),
            techStack: asStringArray(exp.techStack),
            bullets: Array.isArray(exp.bullets)
              ? exp.bullets.map((bullet) => {
                  const row = (bullet && typeof bullet === "object" ? bullet : { raw: bullet }) as Record<
                    string,
                    unknown
                  >;
                  return { ...row, id: String(row.id || uid()), raw: String(row.raw ?? "") };
                })
              : [],
          };
        })
      : [],
    skills: Array.isArray(data.skills)
      ? data.skills.map((item) => {
          const skill = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          return { category: String(skill.category ?? "Skills"), items: asStringArray(skill.items) };
        })
      : [],
  };
  return sortResumeByTime(masterResumeSchema.parse(normalized));
}

function heuristicParse(text: string): MasterResume {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  const phone = text.match(/(?:\+?\d[\d\s-]{8,}\d)/)?.[0] ?? "";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const name = lines[0]?.slice(0, 40) ?? "";
  return hydrateResume({
    identity: {
      name,
      email,
      phone,
      summary: lines.slice(0, 8).join(" "),
    },
    experiences: [
      {
        id: uid(),
        company: "",
        title: "",
        businessContext: "Raw text not yet structured — fill sections manually.",
        bullets: lines.slice(0, 12).map((line) => ({ id: uid(), raw: line })),
      },
    ],
  });
}

export async function structureResume(text: string, runtime: LlmRuntime): Promise<MasterResume> {
  if (runtime.kind === "mock") {
    return heuristicParse(text);
  }

  const content = await chat({
    runtime,
    json: true,
    messages: buildParseResumeMessages(text.slice(0, 24000)),
  });

  return hydrateResume(extractJsonObject(content));
}
