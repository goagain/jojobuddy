import { describe, expect, it } from "vitest";
import { superhumanAshbyEmbedFixture } from "@/lib/fixtures/superhuman-ashby-embed";
import {
  extractJobTextFromInnerText,
  pickBestJobSnapshot,
  pickJobTitle,
  playwrightEnabled,
  scoreJobSnapshot,
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

describe("pickBestJobSnapshot", () => {
  it("prefers iframe job text over parent page chrome", () => {
    const parent = snapshotFromDomText({
      title: "Careers",
      documentTitle: "Explore open roles at Superhuman",
      company: "Superhuman",
      bodyText: ["Products", "Solutions", "Pricing", "Contact sales", "Sign in", "A".repeat(120)].join("\n"),
    });
    const embed = snapshotFromDomText({
      title: "Software Engineer, Back-End - Mail (Canada)",
      documentTitle: "Software Engineer, Back-End - Mail (Canada)",
      company: "",
      bodyText: [
        "Software Engineer, Back-End - Mail (Canada)",
        "Responsibilities",
        "Build reliable backend systems for millions of users.",
        "Qualifications",
        "5+ years of experience with distributed systems.",
        "A".repeat(120),
      ].join("\n"),
    });

    expect(scoreJobSnapshot(embed)).toBeGreaterThan(scoreJobSnapshot(parent));
    expect(pickBestJobSnapshot([parent, embed])?.title).toBe("Software Engineer, Back-End - Mail (Canada)");
  });

  it("selects Ashby iframe content on Superhuman embed career pages", () => {
    const parent = snapshotFromDomText(superhumanAshbyEmbedFixture.parentFrame);
    const ashby = snapshotFromDomText(superhumanAshbyEmbedFixture.ashbyFrame);

    expect(parent.text.length).toBeGreaterThan(100);
    expect(parent.text).not.toMatch(/Qualifications/i);

    const picked = pickBestJobSnapshot([parent, ashby]);
    expect(picked?.title).toBe("Software Engineer, Back-End - Mail (Canada)");
    expect(picked?.text).toContain("remote-flexible working model");
    expect(picked?.text).toContain("Qualifications");
    expect(picked?.text).not.toContain("Privacy Policy");
  });
});