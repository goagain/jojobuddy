import { describe, expect, it } from "vitest";
import { mergeBoardListings } from "@/lib/job-boards/merge";
import type { StoredBoardListing } from "@/lib/job-boards/types";
import { isDailyCrawlDue, zonedDateKey } from "@/lib/board-schedule";

function listing(id: string, fitScore?: number): StoredBoardListing {
  return {
    id,
    title: id,
    url: `https://jobs.ashbyhq.com/openai/${id}`,
    level: "senior",
    roleFamily: "engineer",
    facets: {},
    fitScore,
    fitReason: fitScore != null ? "kept" : undefined,
  };
}

describe("mergeBoardListings", () => {
  it("keeps a job that was already pulled and only appends new ids", () => {
    const existing = [listing("known", 94)];
    const incoming = [listing("known", 10), listing("new-job")];
    const { merged, added } = mergeBoardListings(existing, incoming);
    expect(added.map((item) => item.id)).toEqual(["new-job"]);
    expect(merged.map((item) => item.id)).toEqual(["known", "new-job"]);
    expect(merged[0]?.fitScore).toBe(94);
    expect(merged[0]?.fitReason).toBe("kept");
  });
});

describe("daily board clock", () => {
  it("flips the China date at 00:00 Beijing time", () => {
    expect(zonedDateKey("Asia/Shanghai", new Date("2026-09-29T15:59:00.000Z"))).toBe("2026-09-29");
    expect(zonedDateKey("Asia/Shanghai", new Date("2026-09-29T16:00:00.000Z"))).toBe("2026-09-30");
  });

  it("is due once per calendar day", () => {
    expect(isDailyCrawlDue(undefined, "2026-09-30")).toBe(true);
    expect(isDailyCrawlDue("2026-09-29", "2026-09-30")).toBe(true);
    expect(isDailyCrawlDue("2026-09-30", "2026-09-30")).toBe(false);
  });
});
