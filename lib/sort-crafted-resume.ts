import { resumeDateValue } from "./resume-factory";

const TIME_SECTION = /^##\s*(经历|项目|教育|experience|projects|project|education)\s*$/i;

/** Parse a date range from free text (heading or pipe segment). */
export function parseResumeTimeRange(text: string): { start: number; end: number } {
  const raw = text.trim();
  if (!raw) return { start: 0, end: 0 };

  const candidate = raw.includes("|") ? raw.split("|").pop()?.trim() ?? raw : raw;
  const parts = candidate.split(/\s+[-–—~至到]+\s+/).map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return {
      start: resumeDateValue(parts[0]),
      end: resumeDateValue(parts[parts.length - 1]),
    };
  }

  const value = resumeDateValue(candidate);
  return { start: value, end: value };
}

type H3Block = { heading: string; body: string };

function splitH3Blocks(content: string): { prefix: string; blocks: H3Block[] } {
  const lines = content.split("\n");
  const prefixLines: string[] = [];
  const blocks: H3Block[] = [];
  let current: H3Block | null = null;

  for (const line of lines) {
    if (/^###\s/.test(line)) {
      if (current) blocks.push(current);
      current = { heading: line, body: "" };
      continue;
    }
    if (current) {
      current.body = current.body ? `${current.body}\n${line}` : line;
    } else {
      prefixLines.push(line);
    }
  }
  if (current) blocks.push(current);

  return {
    prefix: prefixLines.join("\n").replace(/\n+$/, ""),
    blocks,
  };
}

function compareBlocks(a: H3Block, b: H3Block) {
  const da = parseResumeTimeRange(a.heading);
  const db = parseResumeTimeRange(b.heading);
  const end = db.end - da.end;
  if (end !== 0) return end;
  return db.start - da.start;
}

function sortSectionContent(content: string): string {
  const { prefix, blocks } = splitH3Blocks(content);
  if (blocks.length < 2) return content;

  const sorted = [...blocks].sort(compareBlocks);
  const parts: string[] = [];
  if (prefix.trim()) parts.push(prefix);
  for (const block of sorted) {
    parts.push(block.heading);
    if (block.body.trim()) parts.push(block.body);
  }
  return parts.join("\n");
}

function sortTimeSections(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let sectionTitle: string | null = null;
  let sectionLines: string[] = [];

  function flushSection() {
    if (sectionTitle === null) return;
    const joined = sectionLines.join("\n");
    out.push(sectionTitle);
    out.push(sortSectionContent(joined));
    sectionTitle = null;
    sectionLines = [];
  }

  for (const line of lines) {
    if (/^##\s/.test(line)) {
      flushSection();
      if (TIME_SECTION.test(line)) {
        sectionTitle = line;
        sectionLines = [];
      } else {
        out.push(line);
      }
      continue;
    }

    if (sectionTitle !== null) {
      sectionLines.push(line);
    } else {
      out.push(line);
    }
  }
  flushSection();

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Enforce reverse-chronological order in crafted resume Markdown sections. */
export function sortCraftedResumeMarkdown(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) return trimmed;
  return sortTimeSections(trimmed);
}
