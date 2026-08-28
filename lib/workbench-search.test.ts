import { describe, expect, it } from "vitest";
import {
  buildWorkbenchSearch,
  parseWorkbenchSearch,
  workbenchHref,
} from "@/lib/workbench-search";

describe("workbench search params", () => {
  it("round-trips profile and job ids", () => {
    const params = buildWorkbenchSearch({
      profileId: "p1",
      jobId: "j1",
    });
    expect(parseWorkbenchSearch(params)).toEqual({
      profileId: "p1",
      jobId: "j1",
      generatorModelId: undefined,
      judgeModelId: undefined,
      autoRefine: undefined,
      threshold: undefined,
    });
    expect(workbenchHref({ profileId: "p1", jobId: "j1" })).toBe("/?profileId=p1&jobId=j1");
  });

  it("stores non-default craft options", () => {
    const params = buildWorkbenchSearch({
      profileId: "p1",
      jobId: "j1",
      generatorModelId: "g1",
      judgeModelId: "judge1",
      autoRefine: false,
      threshold: 90,
    });
    expect(parseWorkbenchSearch(params)).toEqual({
      profileId: "p1",
      jobId: "j1",
      generatorModelId: "g1",
      judgeModelId: "judge1",
      autoRefine: false,
      threshold: 90,
    });
  });

  it("omits default autoRefine and threshold from the URL", () => {
    const params = buildWorkbenchSearch({
      profileId: "p1",
      autoRefine: true,
      threshold: 85,
    });
    expect(params.toString()).toBe("profileId=p1");
  });
});
