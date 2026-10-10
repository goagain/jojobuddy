import { describe, expect, it } from "vitest";
import { workPriority } from "@/lib/work-types";

describe("work priority", () => {
  it("keeps manual job import and resume craft ahead of board work", () => {
    expect(workPriority("parse_url")).toBeGreaterThan(workPriority("crawl_board"));
    expect(workPriority("parse_url")).toBeGreaterThan(workPriority("score_board"));
    expect(workPriority("parse_url")).toBeGreaterThan(workPriority("discover_board"));
    expect(workPriority("craft")).toBeGreaterThan(workPriority("crawl_board"));
    expect(workPriority("craft")).toBeGreaterThan(workPriority("refresh_jobs"));
    expect(workPriority("parse_resume")).toBeGreaterThan(workPriority("score_board"));
    expect(workPriority("analyze_job")).toBeGreaterThan(workPriority("score_board"));
  });

  it("does not let board work outrank an import or a craft", () => {
    const interactive = ["parse_url", "craft", "parse_resume", "analyze_job"] as const;
    const background = ["discover_board", "crawl_board", "score_board", "refresh_jobs", "crawl_interview"] as const;
    for (const foreground of interactive) {
      for (const backgroundJob of background) {
        expect(workPriority(foreground)).toBeGreaterThan(workPriority(backgroundJob));
      }
    }
  });
});
