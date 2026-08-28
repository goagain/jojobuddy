export type JobInsights = {
  requirements: string[];
  keywords: string[];
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
  "splunk",
  "elasticsearch",
  "kafka",
  "redis",
  "postgresql",
  "mysql",
  "mongodb",
  "typescript",
  "javascript",
  "python",
  "go",
  "golang",
  "rust",
  "java",
  "c++",
  "c#",
  ".net",
  "react",
  "next.js",
  "node.js",
  "grpc",
  "rest",
  "graphql",
  "ci/cd",
  "gitlab ci",
  "github actions",
  "jenkins",
  "gitops",
  "microservices",
  "distributed systems",
  "high concurrency",
  "observability",
  "monitoring",
  "alerting",
  "sre",
  "devops",
  "control plane",
  "operator",
  "time-series",
  "tsdb",
  "metrics",
  "tracing",
  "logging",
  "llm",
  "machine learning",
  "ai",
  "linux",
  "bash",
  "agile",
  "scrum",
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

function displayTerm(text: string, term: string) {
  const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const match = text.match(pattern);
  return match?.[0] ?? term;
}

function extractKeywords(text: string): string[] {
  const found: string[] = [];
  for (const term of KEYWORD_TERMS) {
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (pattern.test(text)) {
      found.push(displayTerm(text, term));
    }
  }

  for (const raw of text.split("\n")) {
    const line = normalizeLine(raw);
    if (!/[:：]/.test(line)) continue;
    const [, value = ""] = line.split(/[:：]/, 2);
    if (!value.includes(",")) continue;
    for (const part of value.split(",")) {
      const token = normalizeLine(part);
      if (token.length >= 2 && token.length <= 40 && /[a-zA-Z]/.test(token)) {
        found.push(token);
      }
    }
  }

  return dedupe(found).slice(0, 32);
}

/** Pull requirement bullets and JD keywords from parsed job text. */
export function extractJobInsights(text: string): JobInsights {
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

  return {
    requirements: dedupe(requirements).slice(0, 24),
    keywords: extractKeywords(trimmed),
  };
}
