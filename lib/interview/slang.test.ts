import { describe, expect, it } from "vitest";
import { roundFromSlang, slangGloss, slangGlossary } from "@/lib/interview/slang";

describe("1point3acres slang", () => {
  it("treats onsite homophones as the same round", () => {
    expect(roundFromSlang("Harvey 昂赛")).toBe("Onsite");
    expect(roundFromSlang("现场表演问了 LRU")).toBe("Onsite");
    expect(slangGloss("昂赛，也就是现场表演")).toBe("黑话：昂赛、现场表演 = Onsite");
  });

  it("keeps a phone screen and an onsite when a post mentions both", () => {
    expect(roundFromSlang("店面过了，昂赛挂了")).toBe("Onsite, Phone screen");
  });

  it("does not treat short codes as part of a longer word", () => {
    expect(roundFromSlang("leetcode 146")).toBeUndefined();
    expect(slangGloss("OAI 电面")).toContain("OAI = OpenAI");
    expect(slangGloss("OAI 电面")).toContain("电面 = Phone screen");
  });

  it("marks points slang as not a question", () => {
    expect(slangGlossary()).toContain("求米、加米、给米 = 论坛积分，不是面试题");
    expect(slangGloss("求米")).toContain("不是面试题");
  });

  it("treats 挂经 as a failed outcome that still contains questions", () => {
    expect(slangGlossary()).toContain("挂经 = 没通过。这只是结果，不是题目；正文里被问到的题仍然要提取");
    expect(slangGloss("挂经")).not.toContain("不是面试题");
  });
});
