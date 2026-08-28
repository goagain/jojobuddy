import { describe, expect, it } from "vitest";
import { localDatePart, matchesDateRange } from "@/lib/format-date";
import { normalizePostedAt } from "@/lib/parse-posted-at";

describe("normalizePostedAt", () => {
  it("accepts ISO strings and unix seconds", () => {
    expect(normalizePostedAt("2024-03-15T08:00:00.000Z")).toBe("2024-03-15T08:00:00.000Z");
    expect(normalizePostedAt(1_710_489_600)).toBe("2024-03-15T08:00:00.000Z");
  });

  it("returns undefined for invalid values", () => {
    expect(normalizePostedAt("")).toBeUndefined();
    expect(normalizePostedAt("not-a-date")).toBeUndefined();
  });
});

describe("matchesDateRange", () => {
  it("matches local date parts within from/to", () => {
    const iso = "2024-03-15T23:30:00.000Z";
    expect(localDatePart(iso)).toBeTruthy();
    expect(matchesDateRange(iso, "2024-03-15", "2024-03-15")).toBe(true);
    expect(matchesDateRange(iso, "2024-03-16", "")).toBe(false);
    expect(matchesDateRange(undefined, "2024-03-01", "")).toBe(false);
    expect(matchesDateRange(iso, "", "")).toBe(true);
  });
});
