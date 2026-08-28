import { describe, expect, it } from "vitest";
import { renderMasterResumeMarkdown, serializeMasterResumeJson } from "@/lib/render-master-resume";
import { SAMPLE_MASTER_RESUME } from "@/lib/sample-resume";

describe("renderMasterResumeMarkdown", () => {
  it("renders identity, skills, and experience sections", () => {
    const md = renderMasterResumeMarkdown(SAMPLE_MASTER_RESUME, "zh");
    expect(md).toContain("# 示例候选人");
    expect(md).toContain("## 技能");
    expect(md).toContain("## 经历");
    expect(md).toContain("北极星科技");
    expect(md).toContain("**业务背景:**");
  });

  it("uses bullet raw text and linkifies urls", () => {
    const md = renderMasterResumeMarkdown(
      {
        ...SAMPLE_MASTER_RESUME,
        experiences: [
          {
            id: "exp-1",
            company: "Acme",
            title: "Engineer",
            startDate: "2024-01",
            endDate: "present",
            businessContext: "",
            techStack: [],
            bullets: [{ id: "b1", raw: "See https://example.com/docs for details." }],
          },
        ],
        projects: [],
        education: [],
        certifications: [],
        languages: [],
        softSkills: [],
      },
      "en",
    );
    expect(md).toContain("[example.com](https://example.com/docs)");
  });
});

describe("serializeMasterResumeJson", () => {
  it("returns valid JSON with sorted experiences", () => {
    const json = serializeMasterResumeJson(SAMPLE_MASTER_RESUME);
    const parsed = JSON.parse(json);
    expect(parsed.identity.name).toBe("示例候选人");
    expect(Array.isArray(parsed.experiences)).toBe(true);
  });
});
