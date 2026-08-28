import { describe, expect, it } from "vitest";
import { matchesRecentWindow } from "@/lib/format-date";
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

describe("matchesRecentWindow", () => {
  it("matches recent days and unknown post dates", () => {
    const iso = new Date().toISOString();
    expect(matchesRecentWindow(iso, "")).toBe(true);
    expect(matchesRecentWindow(iso, "7")).toBe(true);
    expect(matchesRecentWindow(undefined, "unknown")).toBe(true);
    expect(matchesRecentWindow(undefined, "7")).toBe(false);
    const old = new Date();
    old.setDate(old.getDate() - 40);
    expect(matchesRecentWindow(old.toISOString(), "30")).toBe(false);
    const stale = new Date();
    stale.setDate(stale.getDate() - 100);
    expect(matchesRecentWindow(stale.toISOString(), "older90")).toBe(true);
    expect(matchesRecentWindow(iso, "older90")).toBe(false);
  });
});
