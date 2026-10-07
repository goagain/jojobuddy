import { describe, expect, it } from "vitest";
import { joinMarkdownSegments, splitMarkdownSegments } from "./markdown-segments";

const RESUME = `# Ada Lovelace
Engineer  ·  London

## Summary
Builds analytical engines.

## Experience
### Engineer — Babbage Co
*1842 – 1843*
- Wrote the first program.
- Annotated the Analytical Engine.

### Analyst — Royal Society
- Published notes.`;

describe("splitMarkdownSegments", () => {
  it("starts a segment at every heading and at blank lines", () => {
    expect(splitMarkdownSegments(RESUME)).toEqual([
      "# Ada Lovelace\nEngineer  ·  London",
      "## Summary\nBuilds analytical engines.",
      "## Experience",
      "### Engineer — Babbage Co\n*1842 – 1843*\n- Wrote the first program.\n- Annotated the Analytical Engine.",
      "### Analyst — Royal Society\n- Published notes.",
    ]);
  });

  it("keeps fenced code blocks intact", () => {
    expect(splitMarkdownSegments("intro\n\n```\n# not a heading\n\nstill code\n```\nafter")).toEqual([
      "intro",
      "```\n# not a heading\n\nstill code\n```\nafter",
    ]);
  });

  it("normalizes CRLF and returns nothing for blank input", () => {
    expect(splitMarkdownSegments("a\r\n\r\nb")).toEqual(["a", "b"]);
    expect(splitMarkdownSegments("  \n\n")).toEqual([]);
  });
});

describe("joinMarkdownSegments", () => {
  it("joins with blank lines and drops empty segments", () => {
    expect(joinMarkdownSegments(["# A", "  ", "- b\n"])).toBe("# A\n\n- b");
  });

  it("round-trips generated resume Markdown to equivalent blocks", () => {
    const joined = joinMarkdownSegments(splitMarkdownSegments(RESUME));
    expect(splitMarkdownSegments(joined)).toEqual(splitMarkdownSegments(RESUME));
  });
});
