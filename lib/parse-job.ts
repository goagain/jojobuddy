import { z } from "zod";
import { normalizeCompanyName } from "./job-company";
import { normalizeJobLocations } from "./job-location";
import { normalizePostedAt } from "./parse-posted-at";
import { buildAnalyzeJobMessages } from "./prompts";
import { chat, extractJsonObject } from "./llm";
import type { LlmRuntime } from "./llm-types";

export const jobInsightsSchema = z.object({
  title: z.string().default(""),
  company: z.string().default(""),
  jobNumber: z.string().default(""),
  postedAt: z.string().default(""),
  requirements: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
});

export type JobInsights = z.infer<typeof jobInsightsSchema>;

export type AnalyzeJobContext = {
  sourceUrl?: string;
};

const EMPTY_INSIGHTS: JobInsights = {
  title: "",
  company: "",
  jobNumber: "",
  postedAt: "",
  requirements: [],
  keywords: [],
  locations: [],
};

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

const COMPANY_LINE_PATTERNS = [
  /^Company\s*[:：]\s*(.+)$/im,
  /^Employer\s*[:：]\s*(.+)$/im,
  /^公司\s*[:：]\s*(.+)$/im,
];

const JOB_NUMBER_LINE_PATTERNS = [
  /^Role Number\s*[:：]\s*(.+)$/im,
  /^Requisition\s*(?:ID|Number)?\s*[:：]\s*(.+)$/im,
  /^Job\s*(?:ID|Number)\s*[:：]\s*(.+)$/im,
  /^Posting\s*(?:ID|Number)\s*[:：]\s*(.+)$/im,
  /^职位编号\s*[:：]\s*(.+)$/im,
];

const POSTED_AT_LINE_PATTERNS = [
  /^Posted\s*[:：]\s*(.+)$/im,
  /^Posted on\s*(.+)$/im,
  /^Date posted\s*[:：]\s*(.+)$/im,
  /^Posting date\s*[:：]\s*(.+)$/im,
  /^发布于\s*(.+)$/im,
  /^发布时间\s*[:：]\s*(.+)$/im,
  /^网站发布于\s*(.+)$/im,
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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function extractTitleHeuristic(text: string): string {
  const first = text.split("\n").map(normalizeLine).find(Boolean);
  return first?.slice(0, 160) ?? "";
}

function extractCompanyHeuristic(text: string): string {
  return normalizeCompanyName(firstMatch(text, COMPANY_LINE_PATTERNS));
}

function extractJobNumberHeuristic(text: string): string {
  return firstMatch(text, JOB_NUMBER_LINE_PATTERNS).slice(0, 64);
}

function extractPostedAtHeuristic(text: string): string {
  const raw = firstMatch(text, POSTED_AT_LINE_PATTERNS);
  return normalizePostedAt(raw) ?? "";
}

export function normalizeJobInsights(raw: unknown): JobInsights {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return jobInsightsSchema.parse({
    title: asString(data.title).slice(0, 160),
    company: normalizeCompanyName(asString(data.company)),
    jobNumber: asString(data.jobNumber).slice(0, 64),
    postedAt: normalizePostedAt(asString(data.postedAt)) ?? "",
    requirements: dedupe(asStringList(data.requirements)).slice(0, 24),
    keywords: dedupe(asStringList(data.keywords)).slice(0, 32),
    locations: normalizeJobLocations(dedupe(asStringList(data.locations))).slice(0, 12),
  });
}

const LOCATION_LINE_PATTERNS = [
  /^Location[s]?\s*[:：]\s*(.+)$/im,
  /^Work location[s]?\s*[:：]\s*(.+)$/im,
  /^Office location[s]?\s*[:：]\s*(.+)$/im,
  /^工作地点\s*[:：]\s*(.+)$/im,
  /^地点\s*[:：]\s*(.+)$/im,
  /^工作地\s*[:：]\s*(.+)$/im,
];

function extractLocationsHeuristic(text: string): string[] {
  const cities = new Set<string>();
  for (const pattern of LOCATION_LINE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    for (const segment of match[1].split(/\s*\/\s*|\s+or\s+|\s+和\s+/i)) {
      const city = normalizeJobLocations([segment])[0];
      if (city && city.length >= 2) cities.add(city);
    }
  }
  return [...cities];
}

/** Rule-based fallback when mock provider is used or the model fails. */
export function extractJobInsightsHeuristic(text: string): JobInsights {
  const trimmed = text.trim();
  if (trimmed.length < 40) {
    return { ...EMPTY_INSIGHTS };
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
    title: extractTitleHeuristic(trimmed),
    company: extractCompanyHeuristic(trimmed),
    jobNumber: extractJobNumberHeuristic(trimmed),
    postedAt: extractPostedAtHeuristic(trimmed),
    requirements: dedupe(requirements).slice(0, 24),
    keywords: dedupe(keywords).slice(0, 32),
    locations: extractLocationsHeuristic(trimmed),
  };
}

/** @deprecated Use analyzeJobDescription; kept for tests. */
export const extractJobInsights = extractJobInsightsHeuristic;

export async function analyzeJobDescription(
  text: string,
  runtime: LlmRuntime,
  context?: AnalyzeJobContext,
): Promise<JobInsights> {
  const trimmed = text.trim();
  if (trimmed.length < 40) {
    return { ...EMPTY_INSIGHTS };
  }
  if (runtime.kind === "mock") {
    return extractJobInsightsHeuristic(trimmed);
  }

  const content = await chat({
    runtime,
    json: true,
    messages: buildAnalyzeJobMessages(trimmed.slice(0, 24000), context),
  });

  return normalizeJobInsights(extractJsonObject(content));
}
