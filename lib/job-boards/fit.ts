import { z } from "zod";
import { chat, extractJsonObject, type ChatMessage } from "@/lib/llm";
import type { LlmRuntime } from "@/lib/llm-types";
import type { MasterResume } from "@/lib/schema";
import type { StoredBoardListing } from "./types";

export const FIT_HIGHLIGHT_SCORE = 90;
const FIT_BATCH = 8;

const fitBatchSchema = z.object({
  scores: z.array(
    z.object({
      id: z.string(),
      score: z.number(),
      reason: z.string().default(""),
    }),
  ),
});

export function compactResume(resume: MasterResume): string {
  const lines: string[] = [];
  const identity = resume.identity;
  if (identity.headline) lines.push(`Headline: ${identity.headline}`);
  if (identity.summary) lines.push(`Summary: ${identity.summary}`);
  if (identity.location) lines.push(`Location: ${identity.location}`);
  for (const group of resume.skills) {
    if (group.items.length === 0) continue;
    lines.push(`Skills (${group.category}): ${group.items.join(", ")}`);
  }
  for (const exp of resume.experiences) {
    lines.push(
      [
        `${exp.title} @ ${exp.company}`,
        `(${exp.startDate}–${exp.endDate})`,
        exp.techStack.length ? `[${exp.techStack.join(", ")}]` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    for (const bullet of exp.bullets.slice(0, 4)) {
      const text = bullet.raw.trim();
      if (text) lines.push(`- ${text.slice(0, 220)}`);
    }
  }
  for (const project of resume.projects) {
    lines.push(
      [`Project ${project.name}`, project.role, project.techStack.length ? `[${project.techStack.join(", ")}]` : ""]
        .filter(Boolean)
        .join(" "),
    );
  }
  return lines.join("\n").slice(0, 8000);
}

export function parseFitScores(raw: unknown, allowed: Set<string>) {
  const parsed = fitBatchSchema.parse(raw);
  const scores: { id: string; score: number; reason: string }[] = [];
  for (const row of parsed.scores) {
    if (!allowed.has(row.id)) continue;
    scores.push({
      id: row.id,
      score: Math.round(Math.min(100, Math.max(0, row.score))),
      reason: row.reason.trim().slice(0, 240),
    });
  }
  return scores;
}

function listingBlock(listing: StoredBoardListing) {
  return [
    `- id: ${listing.id}`,
    `  title: ${listing.title}`,
    listing.family ? `  team: ${listing.family}` : "",
    listing.location ? `  location: ${listing.location}` : "",
    `  level: ${listing.level}`,
    listing.excerpt ? `  excerpt: ${listing.excerpt.slice(0, 400)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function fitMessages(resumeText: string, listings: StoredBoardListing[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You score how well a candidate already matches each job. Use only facts in the resume. 0 means no meaningful overlap. 100 means they already do this kind of work at this level. Do not reward keyword stuffing. Penalize a clear level or domain miss.
Return JSON only: {"scores":[{"id":"string","score":0,"reason":"one sentence"}]}
Include every job id exactly once.`,
    },
    {
      role: "user",
      content: `Resume:\n${resumeText}\n\nJobs:\n${listings.map(listingBlock).join("\n")}`,
    },
  ];
}

function applyScores(
  listings: StoredBoardListing[],
  scores: { id: string; score: number; reason: string }[],
): StoredBoardListing[] {
  const byId = new Map(scores.map((row) => [row.id, row]));
  return listings.map((listing) => {
    const hit = byId.get(listing.id);
    if (!hit) return { ...listing, fitScore: undefined, fitReason: undefined };
    return { ...listing, fitScore: hit.score, fitReason: hit.reason || undefined };
  });
}

async function scoreBatch(
  resumeText: string,
  batch: StoredBoardListing[],
  runtime: LlmRuntime,
  chatImpl: (messages: ChatMessage[], runtime: LlmRuntime) => Promise<string>,
) {
  const allowed = new Set(batch.map((listing) => listing.id));
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await chatImpl(fitMessages(resumeText, batch), runtime);
      return parseFitScores(extractJsonObject(raw), allowed);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Fit scoring failed");
}

export async function scoreBoardListings(input: {
  resume: MasterResume;
  listings: StoredBoardListing[];
  runtime: LlmRuntime;
  batchSize?: number;
  onProgress?: (done: number, total: number) => Promise<void>;
  chatImpl?: (messages: ChatMessage[], runtime: LlmRuntime) => Promise<string>;
}): Promise<StoredBoardListing[]> {
  if (input.runtime.kind === "mock") {
    throw new Error("Scoring needs a real parse model. Import one in Settings — the mock model cannot judge fit.");
  }
  if (input.listings.length === 0) return [];
  const chatImpl =
    input.chatImpl ??
    (async (messages, runtime) => chat({ messages, runtime, json: true }));
  const resumeText = compactResume(input.resume);
  const size = Math.max(1, input.batchSize ?? FIT_BATCH);
  const scores: { id: string; score: number; reason: string }[] = [];
  for (let index = 0; index < input.listings.length; index += size) {
    const batch = input.listings.slice(index, index + size);
    scores.push(...(await scoreBatch(resumeText, batch, input.runtime, chatImpl)));
    await input.onProgress?.(Math.min(input.listings.length, index + batch.length), input.listings.length);
  }
  return applyScores(input.listings, scores);
}
