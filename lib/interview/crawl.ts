import type { QuestionKind, QuestionMention } from "./aggregate";
import { aggregateQuestions, localSummary } from "./aggregate";
import { clusterMentions } from "./cluster";
import { roundFromSlang, slangGloss } from "./slang";
import {
  bbcodeToText,
  fieldsFromOptions,
  forumSortRequest,
  interviewSortId,
  isHiddenPost,
  leetcodeFromFields,
  leetcodeFromText,
  onePointFetch,
  parseForumSorts,
  parseSortOptions,
  parseThreadDetail,
  parseThreadOptions,
  parseThreadPage,
  sortOptionsRequest,
  threadListRequest,
  threadUrl,
  type FetchLike,
  type SortOption,
} from "./onepoint";

export type CollectedThread = {
  tid: number;
  title: string;
  url: string;
  postedAt?: string;
  locked: boolean;
  interviewType?: string;
  difficulty?: string;
  category?: string;
  leetcode: string[];
  excerpt?: string;
};

export type ReadablePost = {
  tid: number;
  title: string;
  text: string;
  meta: string;
};

export type InterviewCrawlResult = {
  totalOnSite: number;
  threads: CollectedThread[];
  questions: ReturnType<typeof aggregateQuestions>;
  summary: string;
  readableCount: number;
  lockedCount: number;
};

const PAGE_SIZE = 20;

export async function crawlInterviewPosts(input: {
  company: string;
  companySlug?: string;
  fid: number;
  limit: number;
  cookie?: string;
  fetchImpl?: FetchLike;
  pause?: () => Promise<void>;
  extract?: (posts: ReadablePost[]) => Promise<QuestionMention[]>;
  onProgress?: (step: string, percent: number) => Promise<void> | void;
}): Promise<InterviewCrawlResult> {
  const company = input.company.trim();
  const companySlug = (input.companySlug || company).trim();
  const limit = Math.min(80, Math.max(1, input.limit));
  const fetchImpl = input.fetchImpl ?? fetch;
  const cookie = input.cookie ?? "";
  const pause = input.pause ?? (async () => delay(120));
  const onProgress = input.onProgress ?? (() => undefined);

  await onProgress(`Listing ${company} interview threads`, 8);
  const sortId = await loadSortId(fetchImpl, input.fid, cookie);
  const catalog = await loadCatalog(fetchImpl, sortId, cookie);
  const listed = await listCompanyThreads(fetchImpl, {
    fid: input.fid,
    sortId,
    company: companySlug,
    limit,
    cookie,
    pause,
  });

  const threads: CollectedThread[] = [];
  const mentions: QuestionMention[] = [];
  const readable: ReadablePost[] = [];

  for (let index = 0; index < listed.threads.length; index += 1) {
    const item = listed.threads[index];
    if (!item) continue;
    await onProgress(`Reading thread ${index + 1}/${listed.threads.length}`, 15 + Math.round((index / listed.threads.length) * 65));
    await pause();
    const collected = await readThread(fetchImpl, item.tid, item.subject, item.dateline, catalog, cookie);
    threads.push(collected.thread);
    mentions.push(...collected.mentions);
    if (collected.readable) readable.push(collected.readable);
  }

  if (input.extract && readable.length > 0) {
    await onProgress("Summarizing questions", 88);
    const extracted = await input.extract(readable);
    mentions.push(...extracted);
  }

  const questions = aggregateQuestions(clusterMentions(mentions)).slice(0, 100);
  const readableCount = threads.filter((thread) => !thread.locked).length;
  const lockedCount = threads.length - readableCount;
  return {
    totalOnSite: listed.total,
    threads,
    questions,
    summary: localSummary(company, questions, {
      collected: threads.length,
      readable: readableCount,
      locked: lockedCount,
    }),
    readableCount,
    lockedCount,
  };
}

export function mentionsForThread(input: {
  tid: number;
  title: string;
  text: string;
  leetcode: string[];
}): QuestionMention[] {
  const mentions: QuestionMention[] = [];
  for (const leetcode of input.leetcode) {
    mentions.push({
      tid: input.tid,
      title: input.title,
      text: `LeetCode ${leetcode}`,
      kind: "coding",
      leetcode,
    });
  }
  for (const leetcode of leetcodeFromText(`${input.title}\n${input.text}`)) {
    mentions.push({
      tid: input.tid,
      title: input.title,
      text: `LeetCode ${leetcode}`,
      kind: "coding",
      leetcode,
    });
  }
  return mentions;
}

async function loadSortId(fetchImpl: FetchLike, fid: number, cookie: string): Promise<number> {
  try {
    const payload = await onePointFetch(fetchImpl, forumSortRequest(fid), undefined, cookie);
    return interviewSortId(parseForumSorts(payload));
  } catch {
    return 311;
  }
}

async function loadCatalog(fetchImpl: FetchLike, sortId: number, cookie: string): Promise<SortOption[]> {
  try {
    const payload = await onePointFetch(fetchImpl, sortOptionsRequest(sortId), undefined, cookie);
    return parseSortOptions(payload);
  } catch {
    return [];
  }
}

async function listCompanyThreads(
  fetchImpl: FetchLike,
  input: { fid: number; sortId: number; company: string; limit: number; cookie: string; pause: () => Promise<void> },
) {
  const threads: { tid: number; subject: string; dateline: number }[] = [];
  let total = 0;
  for (let page = 1; threads.length < input.limit && page <= 10; page += 1) {
    if (page > 1) await input.pause();
    const pageSize = Math.min(PAGE_SIZE, input.limit - threads.length);
    const payload = await onePointFetch(
      fetchImpl,
      threadListRequest(input.fid, input.sortId, page, pageSize),
      {
        method: "POST",
        body: JSON.stringify({ filters: { othercompany: input.company } }),
      },
      input.cookie,
    );
    const parsed = parseThreadPage(payload);
    total = parsed.total;
    threads.push(...parsed.threads);
    if (parsed.threads.length < pageSize) break;
  }
  return { total, threads: threads.slice(0, input.limit) };
}

async function readThread(
  fetchImpl: FetchLike,
  tid: number,
  fallbackTitle: string,
  fallbackDateline: number,
  catalog: SortOption[],
  cookie: string,
): Promise<{ thread: CollectedThread; mentions: QuestionMention[]; readable?: ReadablePost }> {
  const detailPayload = await onePointFetch(fetchImpl, `https://api.1point3acres.com/api/v3/threads/${tid}`, undefined, cookie);
  const detail = parseThreadDetail(detailPayload);
  const optionPayload = await onePointFetch(
    fetchImpl,
    `https://api.1point3acres.com/api/threads/${tid}/options`,
    undefined,
    cookie,
  );
  const fields = fieldsFromOptions(catalog, parseThreadOptions(optionPayload));
  const locked = isHiddenPost(detail.message);
  const text = locked ? "" : bbcodeToText(detail.message);
  const title = detail.subject || fallbackTitle;
  const sourceText = locked ? title : `${title}\n${text}`;
  const leetcode = unique([...leetcodeFromFields(fields), ...leetcodeFromText(locked ? "" : sourceText)]);
  const thread: CollectedThread = {
    tid,
    title,
    url: threadUrl(tid),
    postedAt: toIso(detail.dateline || fallbackDateline),
    locked,
    interviewType: fields.interviewtype || roundFromSlang(sourceText),
    difficulty: fields.difficulty,
    category: fields.jobcategory,
    leetcode,
    excerpt: text ? text.slice(0, 500) : undefined,
  };
  const meta = [
    thread.interviewType,
    thread.difficulty,
    thread.category,
    leetcode.map((id) => `LeetCode ${id}`).join(", "),
    slangGloss(sourceText),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    thread,
    mentions: mentionsForThread({ tid, title, text, leetcode }),
    readable: text ? { tid, title, text: text.slice(0, 4000), meta } : undefined,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function toIso(unixSeconds: number): string | undefined {
  if (!unixSeconds) return undefined;
  const date = new Date(unixSeconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isQuestionKind(value: string): value is QuestionKind {
  return value === "coding" || value === "system_design" || value === "behavioral" || value === "other";
}
