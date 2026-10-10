import { describe, expect, it } from "vitest";
import { aggregateQuestions, localSummary } from "@/lib/interview/aggregate";
import { crawlInterviewPosts } from "@/lib/interview/crawl";
import {
  bbcodeToText,
  decodeOptionValue,
  interviewSortId,
  isHiddenPost,
  leetcodeFromFields,
  parseForumTarget,
  parseThreadDetail,
  sanitizeCookie,
  type SortOption,
} from "@/lib/interview/onepoint";

const difficulty: SortOption = {
  optionid: 3299,
  identifier: "difficulty",
  title: "难度",
  type: "select",
  choices: [{ k: "2", v: "&#128547; Hard" }],
};

describe("1point3acres forum parsing", () => {
  it("reads the forum id from the new and classic links", () => {
    expect(parseForumTarget("https://www.1point3acres.com/home/forum/145")).toMatchObject({ fid: 145 });
    expect(parseForumTarget("https://www.1point3acres.com/bbs/forum-145-1.html")).toMatchObject({ fid: 145 });
  });

  it("rejects links outside the forum", () => {
    expect(() => parseForumTarget("https://example.com/home/forum/145")).toThrow(/1point3acres/);
    expect(() => parseForumTarget("https://www.1point3acres.com/home")).toThrow(/forum id/);
  });

  it("prefers the interview sort and keeps a cookie on one line", () => {
    expect(interviewSortId({ "28": "灌水", "311": "面试经验" })).toBe(311);
    expect(sanitizeCookie("Cookie: a=b")).toBe("a=b");
    expect(() => sanitizeCookie("a=b\nevil: 1")).toThrow(/single line/);
  });

  it("treats points-gated posts as hidden and keeps public bbcode", () => {
    const hidden = "[hide=200]本帖内容需要积分高于 200 才可浏览[/hide]";
    expect(isHiddenPost(hidden)).toBe(true);
    expect(bbcodeToText(hidden)).toBe("");
    expect(bbcodeToText("[b]LRU[/b] [url=https://leetcode.com/problems/lru-cache/]146[/url]")).toBe("LRU 146");
    expect(decodeOptionValue(difficulty, "2")).toBe("😣 Hard");
  });

  it("reads leetcode numbers from sort fields", () => {
    expect(leetcodeFromFields({ leet1: "146", leet2: "", leet3: "0" })).toEqual(["146"]);
  });

  it("reads the thread body from the v3 payload", () => {
    const detail = parseThreadDetail({
      errno: 0,
      thread: { tid: 9, subject: "Harvey phone", dateline: 10, message_bbcode: "问了 two sum" },
    });
    expect(detail).toMatchObject({ tid: 9, message: "问了 two sum" });
  });
});

describe("interview question frequency", () => {
  it("counts a leetcode problem once per thread", () => {
    const questions = aggregateQuestions([
      { tid: 1, title: "A", text: "LC", kind: "coding", leetcode: "146" },
      { tid: 1, title: "A", text: "LRU Cache", kind: "coding", leetcode: "146" },
      { tid: 2, title: "B", text: "LRU", kind: "coding", leetcode: "146" },
      { tid: 3, title: "C", text: "设计一个 rate limiter", kind: "system_design" },
    ]);
    expect(questions[0]).toMatchObject({ leetcode: "146", count: 2, text: "LRU Cache (LeetCode 146)" });
    expect(questions[1]).toMatchObject({ count: 1, kind: "system_design" });
  });

  it("explains when every post is locked", () => {
    expect(localSummary("Harvey", [], { collected: 4, readable: 0, locked: 4 })).toContain("积分隐藏");
  });
});

describe("crawlInterviewPosts", () => {
  it("collects public leetcode numbers and skips hidden bodies", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      const payload = fixture(url);
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await crawlInterviewPosts({
      company: "Harvey",
      fid: 145,
      limit: 10,
      fetchImpl,
      pause: async () => undefined,
    });

    expect(result.totalOnSite).toBe(2);
    expect(result.lockedCount).toBe(1);
    expect(result.readableCount).toBe(1);
    expect(result.threads[0]?.locked).toBe(true);
    expect(result.threads[0]?.leetcode).toEqual(["146"]);
    expect(result.threads[0]?.interviewType).toBe("Onsite");
    expect(result.threads[1]?.excerpt).toContain("merge k");
    expect(result.questions.map((question) => question.leetcode).sort()).toEqual(["146", "23"]);
    expect(calls.some((call) => call.startsWith("POST") && call.includes("/types/311/threads"))).toBe(true);
    expect(result.summary).toContain("Harvey");
  });
});

function fixture(url: string): unknown {
  if (url.includes("forum.get")) {
    return { result: { data: { json: { forum: { forum_field: { thread_sorts: { "311": "面试经验" } } } } } } };
  }
  if (url.includes("type.options")) {
    return {
      result: {
        data: {
          json: {
            options: [
              difficulty,
              {
                optionid: 3089,
                identifier: "interviewtype",
                title: "面试类别",
                type: "checkbox",
                choices: [{ k: "3", v: "Onsite" }],
              },
              { optionid: 3283, identifier: "leet1", title: "第一题", type: "number", choices: [] },
            ],
          },
        },
      },
    };
  }
  if (url.includes("/types/311/threads")) {
    return {
      errno: 0,
      total: 2,
      threads: [
        { tid: 11, subject: "Harvey onsite", dateline: 1700000000 },
        { tid: 12, subject: "Harvey phone", dateline: 1700001000 },
      ],
    };
  }
  if (url.endsWith("/threads/11")) {
    return {
      errno: 0,
      thread: {
        tid: 11,
        subject: "Harvey onsite",
        dateline: 1700000000,
        message_bbcode: "[hide=200]本帖内容需要积分高于 200 才可浏览[/hide]",
      },
    };
  }
  if (url.endsWith("/threads/11/options")) {
    return { errno: 0, options: [{ optionid: 3283, value: "146" }, { optionid: 3089, value: "3" }, { optionid: 3299, value: "2" }] };
  }
  if (url.endsWith("/threads/12")) {
    return {
      errno: 0,
      thread: {
        tid: 12,
        subject: "Harvey phone",
        dateline: 1700001000,
        message_bbcode: "电话面问了 LeetCode 23 merge k lists",
      },
    };
  }
  if (url.endsWith("/threads/12/options")) {
    return { errno: 0, options: [] };
  }
  throw new Error(`Unexpected URL ${url}`);
}
