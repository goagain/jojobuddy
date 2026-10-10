import type { QuestionKind, QuestionMention } from "./aggregate";

type Family = {
  id: string;
  label: string;
  kind: QuestionKind;
  test: (text: string, kind: QuestionKind) => boolean;
};

const FAMILIES: Family[] = [
  {
    id: "find-dups",
    label: "文件系统找重复文件（find_dups）",
    kind: "coding",
    test: (text) => /find\s*dups|list\s*dir|duplicate files|重复文件/.test(text),
  },
  {
    id: "spreadsheet",
    label: "Spreadsheet / Excel（set_cell、get_cell、公式与循环引用）",
    kind: "coding",
    test: (text) =>
      /spreadsheet|excel|set\s*cell|get\s*cell|表格/.test(text) ||
      (/formula/.test(text) && /circular|cycle|环/.test(text)),
  },
  {
    id: "expression",
    label: "表达式求值与环检测",
    kind: "coding",
    test: (text) => /expression map|expression evaluation|表达式求值/.test(text),
  },
  {
    id: "citation",
    label: "文本高亮 / citation tagging",
    kind: "coding",
    test: (text) => /citation|highlight|高亮|yellow|overlapping match|matched substring/.test(text),
  },
  {
    id: "embedding",
    label: "实现 embedding 与余弦相似度检索",
    kind: "coding",
    test: (text, kind) => kind !== "system_design" && /cosine|embedding/.test(text),
  },
  {
    id: "rag-coding",
    label: "RAG 相关编程实现",
    kind: "coding",
    test: (text, kind) => kind === "coding" && /\brag\b/.test(text),
  },
  {
    id: "vault",
    label: "内存文件系统（创建、列出、重名加后缀）",
    kind: "coding",
    test: (text, kind) =>
      kind !== "system_design" &&
      /vault|add\s*file|get\s*files|duplicate file name|filesystem|file system/.test(text),
  },
  {
    id: "drive",
    label: "系统设计：Google Drive / 文件存储",
    kind: "system_design",
    test: (text) => /google drive|file storage|data room|blob store|文件存储/.test(text),
  },
  {
    id: "rag-design",
    label: "系统设计：RAG / 律所备忘录问答",
    kind: "system_design",
    test: (text, kind) =>
      kind !== "coding" && /rag|retrieval augmented|law\s*firm memo|memo q/.test(text),
  },
  {
    id: "behavioral",
    label: "行为面 / 项目深挖",
    kind: "behavioral",
    test: (text) => /behavioral|deep\s*dive|行为面|\bbq\b|core values|harvey values|项目深挖/.test(text),
  },
];

const STOP = new Set([
  "a", "an", "the", "of", "to", "and", "or", "with", "for", "in", "on", "by", "from", "that", "this",
  "is", "are", "be", "as", "at", "it", "into", "when", "what", "how", "you", "your", "all", "not",
  "only", "can", "if", "so", "implement", "implementation", "problem", "question", "questions",
  "coding", "interview", "follow", "part", "using", "given", "return", "write", "support",
  "including", "related", "standard", "phone", "screen", "onsite", "virtual", "round", "design",
  "system",
]);

export function clusterMentions(mentions: QuestionMention[]): QuestionMention[] {
  const families = mentions.map((mention) => (mention.leetcode ? null : matchFamily(mention)));
  const parent = mentions.map((_, index) => index);

  function find(index: number): number {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]!]!;
      cursor = parent[cursor]!;
    }
    return cursor;
  }

  function union(left: number, right: number) {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  }

  for (let i = 0; i < mentions.length; i += 1) {
    for (let j = i + 1; j < mentions.length; j += 1) {
      const left = families[i];
      const right = families[j];
      if (left || right) {
        if (left && right && left.id === right.id) union(i, j);
        continue;
      }
      const a = mentions[i];
      const b = mentions[j];
      if (!a || !b || !kindsCompatible(a.kind, b.kind)) continue;
      if (similarQuestion(a.text, b.text)) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  mentions.forEach((_, index) => {
    const root = find(index);
    const list = groups.get(root) ?? [];
    list.push(index);
    groups.set(root, list);
  });

  const labels = new Map<number, { text: string; kind: QuestionKind }>();
  for (const [root, indexes] of groups) {
    const family = families[indexes[0]!];
    if (family) {
      labels.set(root, { text: family.label, kind: family.kind });
      continue;
    }
    if (indexes.length < 2) continue;
    const members = indexes.map((index) => mentions[index]).filter((item): item is QuestionMention => Boolean(item));
    labels.set(root, { text: pickLabel(members.map((item) => item.text)), kind: majorityKind(members.map((item) => item.kind)) });
  }

  return mentions.map((mention, index) => {
    const label = labels.get(find(index));
    if (!label) return mention;
    return { ...mention, text: label.text, kind: label.kind };
  });
}

function matchFamily(mention: QuestionMention): Family | null {
  const text = loosen(mention.text);
  return FAMILIES.find((family) => family.test(text, mention.kind)) ?? null;
}

function loosen(text: string): string {
  return text
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_\-/]+/g, " ")
    .toLowerCase();
}

function kindsCompatible(left: QuestionKind, right: QuestionKind): boolean {
  return left === right || left === "other" || right === "other";
}

function similarQuestion(left: string, right: string): boolean {
  const a = contentTokens(left);
  const b = contentTokens(right);
  if (a.size < 3 || b.size < 3) return false;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  if (shared < 4) return false;
  return shared / (a.size + b.size - shared) >= 0.45;
}

function contentTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const token of loosen(text).split(/[^\p{L}\p{N}]+/u)) {
    if (token.length < 3 || STOP.has(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

function pickLabel(texts: string[]): string {
  const usable = texts.map((text) => text.trim()).filter((text) => text.length >= 12);
  const pool = usable.length > 0 ? usable : texts;
  return [...pool].sort((a, b) => a.length - b.length)[0] ?? "";
}

function majorityKind(kinds: QuestionKind[]): QuestionKind {
  const counts = new Map<QuestionKind, number>();
  for (const kind of kinds) {
    if (kind === "other") continue;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] ?? "other";
}
