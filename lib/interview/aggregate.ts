export const QUESTION_KINDS = ["coding", "system_design", "behavioral", "other"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export type QuestionMention = {
  tid: number;
  title: string;
  text: string;
  kind: QuestionKind;
  leetcode?: string;
};

export type QuestionSource = {
  tid: number;
  title: string;
};

export type FrequencyQuestion = {
  text: string;
  kind: QuestionKind;
  count: number;
  leetcode?: string;
  sources: QuestionSource[];
};

export function aggregateQuestions(mentions: QuestionMention[]): FrequencyQuestion[] {
  const groups = new Map<
    string,
    { text: string; kind: QuestionKind; leetcode?: string; sources: Map<number, string> }
  >();

  for (const mention of mentions) {
    const leetcode = mention.leetcode?.trim() || undefined;
    const text = mention.text.trim();
    if (!text && !leetcode) continue;
    const key = leetcode ? `lc:${leetcode}` : normalizeQuestion(text);
    if (!key) continue;
    const group = groups.get(key) ?? {
      text: text || `LeetCode ${leetcode}`,
      kind: mention.kind,
      leetcode,
      sources: new Map<number, string>(),
    };
    if (text.length > group.text.length) group.text = text;
    if (!group.leetcode && leetcode) group.leetcode = leetcode;
    if (group.kind === "other" && mention.kind !== "other") group.kind = mention.kind;
    group.sources.set(mention.tid, mention.title);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const text =
        group.leetcode && !new RegExp(`\\b${group.leetcode}\\b`).test(group.text)
          ? `${group.text} (LeetCode ${group.leetcode})`
          : group.text;
      return {
        text,
        kind: group.kind,
        count: group.sources.size,
        leetcode: group.leetcode,
        sources: [...group.sources.entries()].map(([tid, title]) => ({ tid, title })),
      };
    })
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

export function localSummary(
  company: string,
  questions: FrequencyQuestion[],
  stats: { collected: number; readable: number; locked: number },
): string {
  if (questions.length === 0) {
    if (stats.locked > 0 && stats.readable === 0) {
      return `找到 ${stats.collected} 篇「${company}」面经，正文都被积分隐藏，帖子里也没有填写 LeetCode 题号。贴上你已登录的 Cookie 后再采集，才能读到你账号有权限看的正文。`;
    }
    return `找到 ${stats.collected} 篇「${company}」面经，没有解析出明确的面试题。`;
  }
  const top = questions
    .slice(0, 5)
    .map((question) => `${question.text}（${question.count}）`)
    .join("、");
  return `在最近 ${stats.collected} 篇「${company}」面经里，${stats.readable} 篇能读到正文，${stats.locked} 篇被积分隐藏。出现最多的是：${top}。`;
}

export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
