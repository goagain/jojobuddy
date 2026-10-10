export type SlangKind = "round" | "company" | "outcome" | "ignore";

export type SlangEntry = {
  meaning: string;
  kind: SlangKind;
  aliases: string[];
};

/** Homophones and forum slang that refer to one interview concept. */
export const ONEPOINT_SLANG: SlangEntry[] = [
  {
    meaning: "Onsite",
    kind: "round",
    aliases: ["onsite", "昂赛", "昂三", "现场表演", "现场面"],
  },
  {
    meaning: "Phone screen",
    kind: "round",
    aliases: ["phone screen", "店面", "电面", "电话面"],
  },
  {
    meaning: "Virtual onsite",
    kind: "round",
    aliases: ["virtual onsite", "VO", "视频面"],
  },
  {
    meaning: "Online assessment",
    kind: "round",
    aliases: ["online assessment", "OA", "在线笔试"],
  },
  {
    meaning: "Behavioral",
    kind: "round",
    aliases: ["behavioral", "行为面", "BQ"],
  },
  {
    meaning: "System design",
    kind: "round",
    aliases: ["system design", "系统设计", "SD"],
  },
  {
    meaning: "HR screen",
    kind: "round",
    aliases: ["HR面", "HR筛选"],
  },
  {
    meaning: "Google",
    kind: "company",
    aliases: ["狗家"],
  },
  {
    meaning: "Amazon",
    kind: "company",
    aliases: ["亚麻"],
  },
  {
    meaning: "Meta",
    kind: "company",
    aliases: ["脸书"],
  },
  {
    meaning: "Microsoft",
    kind: "company",
    aliases: ["微硬"],
  },
  {
    meaning: "Figma",
    kind: "company",
    aliases: ["飞哥麻"],
  },
  {
    meaning: "Reddit",
    kind: "company",
    aliases: ["红迪"],
  },
  {
    meaning: "LinkedIn",
    kind: "company",
    aliases: ["领英"],
  },
  {
    meaning: "OpenAI",
    kind: "company",
    aliases: ["OAI"],
  },
  {
    meaning: "论坛积分，不是面试题",
    kind: "ignore",
    aliases: ["求米", "加米", "给米"],
  },
  {
    meaning: "没通过。这只是结果，不是题目；正文里被问到的题仍然要提取",
    kind: "outcome",
    aliases: ["挂经"],
  },
];

export function slangHits(text: string): { meaning: string; kind: SlangKind; aliases: string[] }[] {
  const hits: { meaning: string; kind: SlangKind; aliases: string[] }[] = [];
  for (const entry of ONEPOINT_SLANG) {
    const matched = entry.aliases.filter((alias) => containsAlias(text, alias));
    const aliases = matched.filter(
      (alias) =>
        !matched.some(
          (other) => other !== alias && other.length > alias.length && other.toLowerCase().includes(alias.toLowerCase()),
        ),
    );
    if (aliases.length === 0) continue;
    hits.push({ meaning: entry.meaning, kind: entry.kind, aliases });
  }
  return hits;
}

export function roundFromSlang(text: string): string | undefined {
  const rounds = slangHits(text)
    .filter((hit) => hit.kind === "round")
    .map((hit) => hit.meaning);
  return rounds.length > 0 ? rounds.join(", ") : undefined;
}

export function slangGloss(text: string): string {
  const hits = slangHits(text);
  if (hits.length === 0) return "";
  return `黑话：${hits.map((hit) => `${hit.aliases.join("、")} = ${hit.meaning}`).join("；")}`;
}

export function slangGlossary(): string {
  return ONEPOINT_SLANG.map((entry) => `- ${entry.aliases.join("、")} = ${entry.meaning}`).join("\n");
}

function containsAlias(text: string, alias: string): boolean {
  if (/^[A-Za-z0-9]+$/.test(alias) && alias.length <= 3) {
    return new RegExp(`(?:^|[^A-Za-z0-9])${alias}(?:[^A-Za-z0-9]|$)`, "i").test(text);
  }
  return text.toLowerCase().includes(alias.toLowerCase());
}
