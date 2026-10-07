const HEADING = /^#{1,6}\s/;
const FENCE = /^\s*(```|~~~)/;

/** Split Markdown into blocks that render independently: each heading starts a block, blank lines end one. */
export function splitMarkdownSegments(markdown: string): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = () => {
    if (current.length > 0) segments.push(current.join("\n"));
    current = [];
  };

  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (FENCE.test(line)) {
      if (!inFence) flush();
      inFence = !inFence;
      current.push(line);
      continue;
    }
    if (inFence) {
      current.push(line);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (HEADING.test(line)) flush();
    current.push(line);
  }
  flush();
  return segments;
}

export function joinMarkdownSegments(segments: string[]): string {
  return segments
    .map((segment) => segment.replace(/^\n+|\s+$/g, ""))
    .filter(Boolean)
    .join("\n\n");
}
