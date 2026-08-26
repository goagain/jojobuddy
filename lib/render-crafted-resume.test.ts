import { describe, expect, it } from "vitest";
import { linkifyEmails, linkifyUrls, renderCraftedResumeMarkdown } from "@/lib/render-crafted-resume";
import type { CraftedResumeDoc } from "@/lib/crafted-schema";

const base: CraftedResumeDoc = {
  language: "en",
  identity: {
    name: "Rui Tang",
    headline: "Senior Backend Engineer",
    location: "",
    email: "a@b.com",
    phone: "",
    links: [
      { label: "GitHub", url: "" },
      { label: "LinkedIn", url: "https://linkedin.com/in/x" },
    ],
  },
  summary: "Short summary.",
  skills: [],
  experiences: [
    {
      title: "SWE",
      company: "Acme",
      location: "Toronto",
      startDate: "2024-01",
      endDate: "present",
      bullets: ["Shipped X."],
    },
  ],
  projects: [],
  education: [],
  extras: [],
};

describe("renderCraftedResumeMarkdown", () => {
  it("omits links that have a label but no url", () => {
    const md = renderCraftedResumeMarkdown(base);
    expect(md).toContain("[LinkedIn](https://linkedin.com/in/x)");
    expect(md).toContain("[a@b.com](mailto:a@b.com)");
    expect(md).not.toMatch(/GitHub:\s*·/);
    expect(md).not.toContain("GitHub:");
  });

  it("linkifies bare urls in bullets", () => {
    const md = renderCraftedResumeMarkdown({
      ...base,
      experiences: [
        {
          title: "SWE",
          company: "Acme",
          location: "",
          startDate: "2024-01",
          endDate: "present",
          bullets: ["Live at https://jojobuddy.goagain.me for demo."],
        },
      ],
    });
    expect(md).toContain("[jojobuddy.goagain.me](https://jojobuddy.goagain.me)");
  });

  it("puts role title and company on h3 with italic meta line", () => {
    const md = renderCraftedResumeMarkdown(base);
    expect(md).toContain("### SWE — Acme");
    expect(md).toContain("*2024-01 – present · Toronto*");
  });
});

describe("linkifyEmails", () => {
  it("wraps bare emails as mailto links", () => {
    expect(linkifyEmails("Reach me at foo@bar.com today.")).toBe(
      "Reach me at [foo@bar.com](mailto:foo@bar.com) today.",
    );
  });
});

describe("linkifyUrls", () => {
  it("does not double-wrap existing markdown links", () => {
    const input = "See [site](https://example.com) and https://other.com/path";
    expect(linkifyUrls(input)).toBe(
      "See [site](https://example.com) and [other.com](https://other.com/path)",
    );
  });
});
