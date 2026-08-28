import { z } from "zod";
import { buildAnalyzeJobMessages } from "./prompts";
import { chat, extractJsonObject } from "./llm";
import type { LlmRuntime } from "./llm-types";

export const jobInsightsSchema = z.object({
  requirements: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
});

export type JobInsights = z.infer<typeof jobInsightsSchema>;

const REQUIREMENT_SECTIONS = [
  /^minimum qualifications?/i,
  /^preferred qualifications?/i,
  /^required qualifications?/i,
  /^basic qualifications?/i,
  /^qualifications?$/i,
  /^requirements?$/i,
  /^what you(?:'|’)?ll need/i,
  /^what we(?:'|’)?re looking for/i,
  /^must[- ]have/i,
  /^nice[- ]to[- ]have/i,
  /^key qualifications?/i,
  /^you (?:will|should) have/i,
  /^about you$/i,
  /^skills?(?: &| and)? requirements?/i,
  /^最低要求/i,
  /^优先要求/i,
  /^任职要求/i,
  /^岗位要求/i,
  /^职位要求/i,
  /^必备/i,
  /^优先/i,
];

const RESPONSIBILITY_SECTIONS = [
  /^description$/i,
  /^responsibilities$/i,
  /^what you(?:'|’)?ll do/i,
  /^key responsibilities/i,
  /^role overview$/i,
  /^summary$/i,
  /^工作职责/i,
  /^岗位职责/i,
  /^职位描述/i,
];

const KEYWORD_TERMS = [
  "kubernetes",
  "terraform",
  "helm",
  "docker",
  "aws",
  "azure",
  "gcp",
  "prometheus",
  "grafana",
  "opentelemetry",
  "new relic",
  "datadog",
  "kafka",
  "redis",
  "postgresql",
  "typescript",
  "python",
  "go",
  "golang",
  "rust",
  "java",
  "grpc",
  "ci/cd",
  "gitops",
  "microservices",
  "distributed systems",
  "observability",
  "control plane",
  "sre",
  "devops",
];

function normalizeLine(line: string) {
  return line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function isSectionHeader(line: string) {
  const trimmed = normalizeLine(line);
  if (!trimmed || trimmed.length > 100) return false;
  if (/[:：]/.test(trimmed)) return false;
  return (
    REQUIREMENT_SECTIONS.some((pattern) => pattern.test(trimmed)) ||
    RESPONSIBILITY_SECTIONS.some((pattern) => pattern.test(trimmed))
  );
}

function isRequirementSection(header: string) {
  return REQUIREMENT_SECTIONS.some((pattern) => pattern.test(normalizeLine(header)));
}

function linesToItems(body: string): string[] {
  const items: string[] = [];
  for (const raw of body.split("\n")) {
    const line = normalizeLine(raw);
    if (!line) continue;
    const bullet = line.replace(/^[-•*●▪]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
    if (bullet.length >= 8) items.push(bullet);
  }
  if (items.length === 0) {
    const paragraph = normalizeLine(body.replace(/\n+/g, " "));
    if (paragraph.length >= 20) items.push(paragraph);
  }
  return items;
}

function splitSections(text: string): { header: string; body: string }[] {
  const sections: { header: string; body: string }[] = [];
  const blocks = text.split(/\n{2,}/);
  let current: { header: string; body: string } | null = null;

  for (const block of blocks) {
    const lines = block.split("\n");
    const first = normalizeLine(lines[0] ?? "");
    const rest = lines.slice(1).join("\n").trim();

    if (isSectionHeader(first)) {
      if (current) sections.push(current);
      current = { header: first, body: rest };
      continue;
    }

    if (!current) {
      current = { header: "", body: block.trim() };
    } else {
      current.body = [current.body, block.trim()].filter(Boolean).join("\n");
    }
  }

  if (current) sections.push(current);
  return sections;
}

function dedupe(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function normalizeJobInsights(raw: unknown): JobInsights {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return jobInsightsSchema.parse({
    requirements: dedupe(asStringList(data.requirements)).slice(0, 24),
    keywords: dedupe(asStringList(data.keywords)).slice(0, 32),
  });
}

/** Rule-based fallback when mock provider is used or the model fails. */
export function extractJobInsightsHeuristic(text: string): JobInsights {
  const trimmed = text.trim();
  if (trimmed.length < 40) {
    return { requirements: [], keywords: [] };
  }

  const requirements: string[] = [];
  for (const section of splitSections(trimmed)) {
    if (!isRequirementSection(section.header)) continue;
    requirements.push(...linesToItems(section.body));
  }

  if (requirements.length === 0) {
    for (const section of splitSections(trimmed)) {
      if (!RESPONSIBILITY_SECTIONS.some((pattern) => pattern.test(normalizeLine(section.header)))) {
        continue;
      }
      requirements.push(...linesToItems(section.body).slice(0, 6));
    }
  }

  const keywords: string[] = [];
  for (const term of KEYWORD_TERMS) {
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (pattern.test(trimmed)) {
      const match = trimmed.match(pattern);
      keywords.push(match?.[0] ?? term);
    }
  }

  return {
    requirements: dedupe(requirements).slice(0, 24),
    keywords: dedupe(keywords).slice(0, 32),
  };
}

/** @deprecated Use analyzeJobDescription; kept for tests. */
export const extractJobInsights = extractJobInsightsHeuristic;

export async function analyzeJobDescription(text: string, runtime: LlmRuntime): Promise<JobInsights> {
  const trimmed = text.trim();
  if (trimmed.length < 40) {
    return { requirements: [], keywords: [] };
  }
  if (runtime.kind === "mock") {
    return extractJobInsightsHeuristic(trimmed);
  }

  const content = await chat({
    runtime,
    json: true,
    messages: buildAnalyzeJobMessages(trimmed.slice(0, 24000)),
  });

  return normalizeJobInsights(extractJsonObject(content));
}
