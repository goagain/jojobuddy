import { describe, expect, it } from "vitest";
import {
  ensureMasterExperiences,
  ensureMasterProjects,
  linkifyEmails,
  linkifyUrls,
  renderCraftedResumeMarkdown,
} from "@/lib/render-crafted-resume";
import type { CraftedResumeDoc } from "@/lib/crafted-schema";
import type { MasterResume } from "@/lib/schema";

function masterResume(overrides: Partial<MasterResume> = {}): MasterResume {
  return {
    identity: { name: "Rui Tang", email: "", links: [] },
    skills: [],
    experiences: [],
    projects: [],
    education: [],
    certifications: [],
    languages: [],
    softSkills: [],
    ...overrides,
  };
}

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

describe("ensureMasterExperiences", () => {
  it("restores work experiences dropped by the model", () => {
    const restored = ensureMasterExperiences({ ...base, experiences: [] }, masterResume({
      experiences: [
        {
          id: "exp-1",
          company: "Highspot",
          title: "Senior Software Engineer",
          startDate: "2024-04",
          endDate: "present",
          businessContext: "",
          techStack: [],
          bullets: [{ id: "b1", raw: "Built observability pipelines." }],
        },
        {
          id: "exp-2",
          company: "Microsoft",
          title: "Software Engineer",
          startDate: "2022-03",
          endDate: "2024-01",
          businessContext: "",
          techStack: [],
          bullets: [{ id: "b2", raw: "Shipped Office tooling." }],
        },
      ],
    }));

    expect(restored.experiences.map((item) => item.company)).toEqual(["Highspot", "Microsoft"]);
  });
});

describe("ensureMasterProjects", () => {
  it("restores projects dropped by the model", () => {
    const restored = ensureMasterProjects(base, masterResume({
      projects: [
        {
          id: "p1",
          name: "Side App",
          role: "owner",
          summary: "",
          techStack: [],
          bullets: [{ id: "b1", raw: "Built a demo." }],
        },
        {
          id: "p2",
          name: "Jojobuddy",
          role: "owner",
          summary: "",
          techStack: [],
          bullets: [{ id: "b2", raw: "Shipped resume tooling." }],
        },
      ],
    }));

    expect(restored.projects.map((project) => project.name)).toEqual(["Side App", "Jojobuddy"]);
    expect(restored.projects[0]?.bullets[0]).toBe("Built a demo.");
  });

  it("does not duplicate projects already present", () => {
    const withProject = {
      ...base,
      projects: [
        {
          name: "Jojobuddy",
          role: "owner",
          startDate: "",
          endDate: "",
          bullets: ["Tailored bullets."],
        },
      ],
    };
    const restored = ensureMasterProjects(withProject, masterResume({
      projects: [
        {
          id: "p1",
          name: "Jojobuddy",
          summary: "",
          techStack: [],
          bullets: [{ id: "b1", raw: "Original." }],
        },
      ],
    }));

    expect(restored.projects).toHaveLength(1);
    expect(restored.projects[0]?.bullets[0]).toBe("Tailored bullets.");
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
