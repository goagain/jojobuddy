import {
  buildHeavensDoorMessages,
  buildStarPlatinumMessages,
} from "./prompts";
import { chat, extractJsonObject } from "./llm";
import type { LlmRuntime, UsedModel } from "./llm-types";
import {
  type Judgment,
  type MasterResume,
  judgmentSchema,
  rankFromScore,
  weightedOverall,
} from "./schema";
import type { CraftedResumeDoc } from "./crafted-schema";
import { parseAndNormalizeCrafted, renderCraftedResumeMarkdown } from "./render-crafted-resume";
import { sortResumeByTime } from "./resume-factory";
import type { CraftOptions, CraftResult, CraftRound } from "./types";

export type { CraftOptions, CraftResult, CraftRound };

function toUsed(runtime: LlmRuntime): UsedModel {
  return {
    providerName: runtime.providerName,
    kind: runtime.kind,
    label: runtime.modelLabel,
    modelId: runtime.modelId,
  };
}

function normalizeJudgment(raw: unknown): Judgment {
  const parsed = judgmentSchema.parse(raw);
  const overall = weightedOverall(parsed.scores);
  const verdict = rankFromScore(overall);
  const rankMap = {
    s_rank: "S",
    pass: "A",
    rewrite: overall >= 70 ? "B" : "C",
    reject: "D",
  } as const;
  return {
    ...parsed,
    overall,
    verdict,
    rank: rankMap[verdict],
  };
}

export async function generateResume(input: {
  masterResume: MasterResume;
  jobDescription: string;
  runtime: LlmRuntime;
  rewriteInstructions?: string[];
  previousCrafted?: CraftedResumeDoc;
}): Promise<{ crafted: CraftedResumeDoc; resumeMarkdown: string }> {
  const content = await chat({
    runtime: input.runtime,
    json: true,
    messages: buildStarPlatinumMessages({
      masterResumeJson: JSON.stringify(sortResumeByTime(input.masterResume), null, 2),
      jobDescription: input.jobDescription,
      rewriteInstructions: input.rewriteInstructions,
      previousCraftedJson: input.previousCrafted
        ? JSON.stringify(input.previousCrafted, null, 2)
        : undefined,
    }),
  });

  const crafted = parseAndNormalizeCrafted(extractJsonObject(content), input.masterResume);
  return {
    crafted,
    resumeMarkdown: renderCraftedResumeMarkdown(crafted),
  };
}

export async function judgeResume(input: {
  jobDescription: string;
  resumeMarkdown: string;
  runtime: LlmRuntime;
}): Promise<Judgment> {
  const content = await chat({
    runtime: input.runtime,
    json: true,
    messages: buildHeavensDoorMessages(input),
  });

  return normalizeJudgment(extractJsonObject(content));
}

export async function craftResume(input: {
  masterResume: MasterResume;
  jobDescription: string;
  generator: LlmRuntime;
  judge: LlmRuntime;
  options?: CraftOptions;
  onProgress?: (progress: { step: string; percent?: number }) => Promise<void> | void;
}): Promise<CraftResult> {
  const autoRefine = input.options?.autoRefine ?? true;
  const threshold = input.options?.threshold ?? 85;
  const maxRounds = input.options?.maxRounds ?? 3;
  const usedModels = {
    generator: toUsed(input.generator),
    judge: toUsed(input.judge),
  };

  const rounds: CraftRound[] = [];
  let previousCrafted: CraftedResumeDoc | undefined;
  let rewriteInstructions: string[] | undefined;

  for (let round = 1; round <= maxRounds; round += 1) {
    const base = Math.round(((round - 1) / maxRounds) * 100);
    await input.onProgress?.({
      step: `Star Platinum · round ${round}/${maxRounds}`,
      percent: Math.min(90, base + 10),
    });
    const { crafted, resumeMarkdown } = await generateResume({
      masterResume: input.masterResume,
      jobDescription: input.jobDescription,
      runtime: input.generator,
      previousCrafted,
      rewriteInstructions,
    });
    await input.onProgress?.({
      step: `Heaven's Door · round ${round}/${maxRounds}`,
      percent: Math.min(95, base + 25),
    });
    const judgment = await judgeResume({
      jobDescription: input.jobDescription,
      resumeMarkdown,
      runtime: input.judge,
    });

    rounds.push({ round, resumeMarkdown, crafted, judgment });

    if (judgment.overall >= 90) {
      return {
        resumeMarkdown,
        crafted,
        judgment,
        rounds,
        stoppedReason: "s_rank",
        usedModels,
      };
    }

    if (!autoRefine || judgment.overall >= threshold) {
      return {
        resumeMarkdown,
        crafted,
        judgment,
        rounds,
        stoppedReason: "threshold",
        usedModels,
      };
    }

    previousCrafted = crafted;
    rewriteInstructions = judgment.rewriteInstructions;
  }

  const last = rounds[rounds.length - 1];
  return {
    resumeMarkdown: last.resumeMarkdown,
    crafted: last.crafted,
    judgment: last.judgment,
    rounds,
    stoppedReason: "max_rounds",
    usedModels,
  };
}
