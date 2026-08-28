import { describe, expect, it } from "vitest";
import {
  extractJobTextFromInnerText,
  pickJobTitle,
  playwrightEnabled,
  snapshotFromDomText,
} from "@/lib/playwright-page";

describe("playwrightEnabled", () => {
  it("is on by default", () => {
    const previous = process.env.JOJOBUDDY_PLAYWRIGHT;
    delete process.env.JOJOBUDDY_PLAYWRIGHT;
    expect(playwrightEnabled()).toBe(true);
    process.env.JOJOBUDDY_PLAYWRIGHT = previous;
  });

  it("can be disabled with JOJOBUDDY_PLAYWRIGHT=0", () => {
    const previous = process.env.JOJOBUDDY_PLAYWRIGHT;
    process.env.JOJOBUDDY_PLAYWRIGHT = "0";
    expect(playwrightEnabled()).toBe(false);
    process.env.JOJOBUDDY_PLAYWRIGHT = previous;
  });
});

describe("snapshotFromDomText", () => {
  it("extracts title, company, and long body text", () => {
    const bodyText = [
      "Software Engineer",
      "",
      "Company: TikTok",
      "",
      "Description",
      "A".repeat(120),
    ].join("\n");
    const snapshot = snapshotFromDomText({
      title: "Software Engineer, TikTok AIGC",
      documentTitle: "Careers | TikTok",
      company: "TikTok",
      bodyText,
    });
    expect(snapshot.title).toBe("Software Engineer, TikTok AIGC");
    expect(snapshot.company).toBe("TikTok");
    expect(snapshot.text.length).toBeGreaterThan(40);
    expect(extractJobTextFromInnerText(bodyText)).toContain("Description");
  });

  it("falls back to document title", () => {
    expect(pickJobTitle("", "Senior Backend Engineer | TikTok Careers")).toBe("Senior Backend Engineer");
  });
});
