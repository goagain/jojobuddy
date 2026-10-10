import { z } from "zod";
import type { QuestionMention } from "./aggregate";
import { chat, extractJsonObject } from "../llm";
import type { LlmRuntime } from "../llm-types";
import type { FrequencyQuestion } from "./aggregate";
import { isQuestionKind, type ReadablePost } from "./crawl";
import { slangGlossary } from "./slang";

const extractedSchema = z.object({
  questions: z
    .array(
      z.object({
        tid: z.coerce.number().optional(),
        text: z.string().default(""),
        kind: z.string().default("other"),
        leetcode: z.union([z.string(), z.number(), z.null()]).optional(),
      }),
    )
    .default([]),
});

const BATCH_SIZE = 6;

export async function extractQuestions(runtime: LlmRuntime, posts: ReadablePost[]): Promise<QuestionMention[]> {
  const mentions: QuestionMention[] = [];
  for (let index = 0; index < posts.length; index += BATCH_SIZE) {
    const batch = posts.slice(index, index + BATCH_SIZE);
    try {
      mentions.push(...(await extractBatch(runtime, batch)));
    } catch {
      // Keep structured LeetCode counts even when a batch cannot be parsed.
    }
  }
  return mentions;
}

export async function narrativeSummary(
  runtime: LlmRuntime,
  company: string,
  questions: FrequencyQuestion[],
): Promise<string> {
  const list = questions
    .slice(0, 12)
    .map((question) => `- ${question.count} posts: ${question.text}`)
    .join("\n");
  const raw = await chat({
    runtime,
    messages: [
      {
        role: "system",
        content: `你在总结一亩三分地面经。只用给定的频次列表写 4 到 6 句中文，点出最高频的题目和题型。不要补充列表里没有的题，不要写客套话。谐音和黑话用通用说法：昂赛、现场表演都写成 Onsite，店面、电面都写成电面。

${slangGlossary()}`,
      },
      {
        role: "user",
        content: `公司：${company}\n\n${list}`,
      },
    ],
  });
  const text = raw.trim();
  if (!text || text.startsWith("{") || text.startsWith("<")) {
    throw new Error("Model did not return a summary");
  }
  return text.slice(0, 1200);
}

async function extractBatch(runtime: LlmRuntime, posts: ReadablePost[]): Promise<QuestionMention[]> {
  const body = posts
    .map(
      (post) =>
        `tid: ${post.tid}\ntitle: ${post.title}\nmeta: ${post.meta || "none"}\nbody:\n${post.text}`,
    )
    .join("\n\n---\n\n");
  const raw = await chat({
    runtime,
    json: true,
    messages: [
      {
        role: "system",
        content: `You extract interview questions from 1point3acres posts. Output JSON only.

The forum writes the same thing many ways. Treat every alias below as its meaning. Do not emit the slang itself as a question. In question text, say Onsite / Phone screen / System design instead of 昂赛, 现场表演, or 店面.

${slangGlossary()}

Rules:
- Include a question only when the post explicitly says it was asked, or names a coding problem (description or LeetCode id).
- Do not invent questions from a company name, a round name, or 求米.
- 挂经 only means the candidate did not pass. Extract every question that post says was asked.
- 系统设计 or SD → kind system_design. 行为面 or BQ → kind behavioral. A named coding problem → kind coding.
- Echo the post tid.
- kind is coding, system_design, behavioral, or other.
- leetcode is digits only when a LeetCode number is stated, otherwise null.
- text is one concise line. Use the standard round name, not the homophone.

{"questions":[{"tid":1192472,"text":"LRU Cache","kind":"coding","leetcode":"146"}]}`,
      },
      { role: "user", content: body },
    ],
  });
  const parsed = extractedSchema.parse(extractJsonObject(raw));
  const known = new Map(posts.map((post) => [post.tid, post]));
  return parsed.questions.flatMap((question) => {
    const tid = question.tid ?? (posts.length === 1 ? posts[0]?.tid : undefined);
    const post = tid ? known.get(tid) : undefined;
    const text = question.text.trim();
    if (!post || !text) return [];
    const leetcode = normalizeExtractedLeetcode(question.leetcode);
    return [
      {
        tid: post.tid,
        title: post.title,
        text,
        kind: isQuestionKind(question.kind) ? question.kind : "other",
        leetcode,
      },
    ];
  });
}

function normalizeExtractedLeetcode(value: string | number | null | undefined): string | undefined {
  if (value == null) return undefined;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return undefined;
  const number = Number(digits);
  if (!Number.isInteger(number) || number <= 0 || number > 9999) return undefined;
  return String(number);
}
