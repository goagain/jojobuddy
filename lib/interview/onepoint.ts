const API_HOSTS = new Set(["api.1point3acres.com", "trpc.1point3acres.com"]);

export const ONEPOINT_API = "https://api.1point3acres.com";
export const ONEPOINT_TRPC = "https://trpc.1point3acres.com";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type SortOption = {
  optionid: number;
  identifier: string;
  title: string;
  type: string;
  choices: { k: string; v: string }[];
};

export type ListedThread = {
  tid: number;
  subject: string;
  dateline: number;
};

export type ThreadDetail = {
  tid: number;
  subject: string;
  dateline: number;
  message: string;
};

export type ThreadOptionValue = {
  optionid: number;
  value: string;
};

const LEET_FIELDS = ["leet1", "leet2", "leet3"] as const;
const LEET_IN_TEXT = /(?:leetcode|leet\s*code|\blc\b|题号)\s*[#＃:：]?\s*(\d{1,4})/gi;

export function parseForumTarget(input: string): { fid: number; url: string } {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Forum link must be a 1point3acres.com URL");
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "1point3acres.com") {
    throw new Error("Forum link must be on 1point3acres.com");
  }
  const match = url.pathname.match(/\/forum\/(\d+)/) ?? url.pathname.match(/forum-(\d+)/);
  const fid = Number(match?.[1]);
  if (!Number.isInteger(fid) || fid <= 0) {
    throw new Error("Could not read a forum id from that link");
  }
  return { fid, url: url.toString() };
}

export function sanitizeCookie(raw: string): string {
  const cookie = raw.trim().replace(/^cookie\s*:\s*/i, "");
  if (!cookie) return "";
  if (cookie.length > 8000) throw new Error("Cookie is too long");
  if (/[\r\n]/.test(cookie)) throw new Error("Cookie must be a single line");
  return cookie;
}

export function interviewSortId(sorts: Record<string, string>): number {
  const entries = Object.entries(sorts).filter(([id]) => Number(id) > 0);
  const named = entries.find(([, name]) => name.includes("面试"));
  const picked = named ?? entries[0];
  const id = Number(picked?.[0]);
  return Number.isInteger(id) && id > 0 ? id : 311;
}

const LOCKED_NOTICE =
  /积分高于|积分不足|攒积分|隐藏的内容|隐藏内容|才可浏览|才可以浏览|没有权限|无法查看|需要登录|请先登录|回复可见|回复后可见|权限不够/;

export function isHiddenPost(message: string): boolean {
  const blocks = [...message.matchAll(/\[hide[^\]]*\]([\s\S]*?)\[\/hide\]/gi)];
  if (blocks.length > 0) return blocks.every((block) => isLockedNotice(block[1] ?? ""));
  return /\[hide(?:[=|\]])/i.test(message) && isLockedNotice(message);
}

function isLockedNotice(text: string): boolean {
  const plain = decodeEntities(text.replace(/\[\/?[a-z*]+(?:=[^\]]+)?\]/gi, ""))
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return true;
  if (plain.length > 160) return false;
  return LOCKED_NOTICE.test(plain);
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number(code);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    })
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function bbcodeToText(input: string): string {
  const withoutHidden = input.replace(/\[hide[^\]]*\]([\s\S]*?)\[\/hide\]/gi, (_, inner: string) =>
    isLockedNotice(inner) ? "" : inner,
  );
  const links = withoutHidden.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, "$2");
  const tags = links.replace(/\[\/?[a-z*]+(?:=[^\]]+)?\]/gi, "");
  return decodeEntities(tags).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function leetcodeFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(LEET_IN_TEXT)) {
    const id = normalizeLeetcode(match[1] ?? "");
    if (id) found.add(id);
  }
  return [...found];
}

export function normalizeLeetcode(raw: string): string {
  const digits = raw.trim().replace(/\D/g, "");
  if (!digits) return "";
  const value = Number(digits);
  if (!Number.isInteger(value) || value <= 0 || value > 9999) return "";
  return String(value);
}

export function decodeOptionValue(option: SortOption, raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (option.choices.length === 0) return decodeEntities(value);
  const keys = option.type === "checkbox" ? value.split(/[^\d]+/).filter(Boolean) : [value];
  const labels = keys.map((key) => option.choices.find((choice) => choice.k === key)?.v ?? key);
  return decodeEntities(labels.filter(Boolean).join(", "));
}

export function fieldsFromOptions(catalog: SortOption[], values: ThreadOptionValue[]): Record<string, string> {
  const byId = new Map(catalog.map((option) => [option.optionid, option]));
  const fields: Record<string, string> = {};
  for (const entry of values) {
    const option = byId.get(entry.optionid);
    if (!option) continue;
    const decoded = decodeOptionValue(option, entry.value);
    if (decoded) fields[option.identifier] = decoded;
  }
  return fields;
}

export function leetcodeFromFields(fields: Record<string, string>): string[] {
  const found = new Set<string>();
  for (const key of LEET_FIELDS) {
    const id = normalizeLeetcode(fields[key] ?? "");
    if (id) found.add(id);
  }
  return [...found];
}

export function threadUrl(tid: number): string {
  return `https://www.1point3acres.com/bbs/thread-${tid}-1-1.html`;
}

export function parseForumSorts(payload: unknown): Record<string, string> {
  const json = trpcJson(payload);
  const forum = asRecord(json.forum ?? json);
  const field = asRecord(forum.forum_field);
  const sorts = asRecord(field.thread_sorts);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(sorts)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export function parseSortOptions(payload: unknown): SortOption[] {
  const json = trpcJson(payload);
  const raw = Array.isArray(json.options) ? json.options : [];
  return raw.flatMap((entry) => {
    const option = asRecord(entry);
    const optionid = Number(option.optionid);
    const identifier = typeof option.identifier === "string" ? option.identifier : "";
    if (!Number.isInteger(optionid) || !identifier) return [];
    const choices = Array.isArray(option.choices) ? option.choices : [];
    return [
      {
        optionid,
        identifier,
        title: typeof option.title === "string" ? option.title : identifier,
        type: typeof option.type === "string" ? option.type : "text",
        choices: choices.flatMap((choice) => {
          const item = asRecord(choice);
          if (typeof item.k !== "string" || typeof item.v !== "string") return [];
          return [{ k: item.k, v: item.v }];
        }),
      },
    ];
  });
}

export function parseThreadPage(payload: unknown): { total: number; threads: ListedThread[] } {
  const root = asRecord(payload);
  assertErrno(root, "1point3acres rejected the thread list");
  const threads = Array.isArray(root.threads) ? root.threads : [];
  return {
    total: Number(root.total) || 0,
    threads: threads.flatMap((entry) => {
      const thread = asRecord(entry);
      const tid = Number(thread.tid);
      const subject = typeof thread.subject === "string" ? thread.subject.trim() : "";
      if (!Number.isInteger(tid) || tid <= 0 || !subject) return [];
      return [{ tid, subject, dateline: Number(thread.dateline) || 0 }];
    }),
  };
}

export function parseThreadDetail(payload: unknown): ThreadDetail {
  const root = asRecord(payload);
  assertErrno(root, "1point3acres rejected the thread");
  const thread = asRecord(root.thread);
  const tid = Number(thread.tid);
  if (!Number.isInteger(tid) || tid <= 0) throw new Error("Thread is missing an id");
  return {
    tid,
    subject: typeof thread.subject === "string" ? thread.subject.trim() : "",
    dateline: Number(thread.dateline) || 0,
    message: typeof thread.message_bbcode === "string" ? thread.message_bbcode : "",
  };
}

export function parseThreadOptions(payload: unknown): ThreadOptionValue[] {
  const root = asRecord(payload);
  assertErrno(root, "1point3acres rejected thread options");
  const options = Array.isArray(root.options) ? root.options : [];
  return options.flatMap((entry) => {
    const option = asRecord(entry);
    const optionid = Number(option.optionid);
    if (!Number.isInteger(optionid)) return [];
    return [{ optionid, value: typeof option.value === "string" ? option.value : String(option.value ?? "") }];
  });
}

export async function onePointFetch(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit | undefined,
  cookie: string,
): Promise<unknown> {
  const host = new URL(url).hostname;
  if (!API_HOSTS.has(host)) throw new Error("Refusing to call a non-1point3acres host");
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json, text/plain, */*");
  headers.set("Referer", "https://www.1point3acres.com/home/forum/145");
  headers.set(
    "User-Agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  );
  if (init?.body) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetchImpl(url, { ...init, headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`1point3acres failed (${response.status}): ${text.slice(0, 180)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("1point3acres returned a non-JSON response");
  }
}

export function forumSortRequest(fid: number): string {
  const input = encodeURIComponent(JSON.stringify({ json: { fid } }));
  return `${ONEPOINT_TRPC}/trpc/forum.get?input=${input}`;
}

export const DEFAULT_INTERVIEW_FORUM = "https://www.1point3acres.com/home/forum/145";
export const DEFAULT_INTERVIEW_FID = 145;

export function userMeRequest(): string {
  const input = encodeURIComponent(JSON.stringify({ "0": { json: null, meta: { values: ["undefined"] } } }));
  return `${ONEPOINT_TRPC}/trpc/user.me?batch=1&input=${input}`;
}

export function companyTypeaheadRequest(query: string): string {
  const input = encodeURIComponent(JSON.stringify({ "0": { json: { q: query } } }));
  return `${ONEPOINT_TRPC}/trpc/company.typeahead?batch=1&input=${input}`;
}

export function sortOptionsRequest(sortId: number): string {
  const input = encodeURIComponent(JSON.stringify({ json: { sortId } }));
  return `${ONEPOINT_TRPC}/trpc/type.options?input=${input}`;
}

export function threadListRequest(fid: number, sortId: number, page: number, pageSize: number): string {
  const params = new URLSearchParams({
    ps: String(pageSize),
    order: "time_desc",
    includes: "job_options",
    pg: String(page),
    with_total: "1",
  });
  return `${ONEPOINT_API}/api/forums/${fid}/types/${sortId}/threads?${params}`;
}

function trpcJson(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  const result = asRecord(root.result);
  const data = asRecord(result.data);
  const json = data.json;
  if (json && typeof json === "object") return asRecord(json);
  return root;
}

function assertErrno(root: Record<string, unknown>, fallback: string) {
  if (typeof root.errno === "number" && root.errno !== 0) {
    throw new Error(typeof root.msg === "string" && root.msg ? root.msg : fallback);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
