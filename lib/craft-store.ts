import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./db";
import { renderCraftedResumeMarkdown } from "./render-crafted-resume";
import { sortCraftedResumeMarkdown } from "./sort-crafted-resume";
import type { CraftResult, CraftedResume } from "./types";

function normalizeCraftResult(result: CraftResult): CraftResult {
  const fix = (markdown: string, crafted = result.crafted) => {
    if (crafted) return renderCraftedResumeMarkdown(crafted);
    return sortCraftedResumeMarkdown(markdown);
  };

  return {
    ...result,
    resumeMarkdown: fix(result.resumeMarkdown, result.crafted),
    rounds: result.rounds.map((round) => ({
      ...round,
      resumeMarkdown: fix(round.resumeMarkdown, round.crafted ?? result.crafted),
    })),
  };
}

type CraftedDoc = {
  _id?: ObjectId;
  userId: string;
  profileId: string;
  jobId: string;
  profileName: string;
  personName: string;
  jobTitle: string;
  jobCompany: string;
  result: CraftResult;
  createdAt: Date;
  updatedAt: Date;
};

async function crafts(): Promise<Collection<CraftedDoc>> {
  return (await getDb()).collection<CraftedDoc>("crafted_resumes");
}

export async function ensureCraftIndexes() {
  const col = await crafts();
  await Promise.all([
    col.createIndex({ userId: 1, profileId: 1, jobId: 1 }, { unique: true }),
    col.createIndex({ userId: 1, updatedAt: -1 }),
    col.createIndex({ jobId: 1 }),
    col.createIndex({ profileId: 1 }),
  ]);
}

function toPublic(doc: CraftedDoc): CraftedResume {
  if (!doc._id) throw new Error("Missing crafted resume id");
  return {
    id: doc._id.toHexString(),
    profileId: doc.profileId,
    jobId: doc.jobId,
    profileName: doc.profileName,
    personName: doc.personName,
    jobTitle: doc.jobTitle,
    jobCompany: doc.jobCompany,
    result: normalizeCraftResult(doc.result),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function saveCraftedResume(input: {
  userId: string;
  profileId: string;
  jobId: string;
  profileName: string;
  personName: string;
  jobTitle: string;
  jobCompany: string;
  result: CraftResult;
}): Promise<CraftedResume> {
  await ensureCraftIndexes();
  const now = new Date();
  const result = await (await crafts()).findOneAndUpdate(
    { userId: input.userId, profileId: input.profileId, jobId: input.jobId },
    {
      $set: {
        profileName: input.profileName,
        personName: input.personName,
        jobTitle: input.jobTitle,
        jobCompany: input.jobCompany,
        result: normalizeCraftResult(input.result),
        updatedAt: now,
      },
      $setOnInsert: {
        userId: input.userId,
        profileId: input.profileId,
        jobId: input.jobId,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!result) throw new Error("Failed to save crafted resume");
  return toPublic(result);
}

export async function getCraftedResume(
  userId: string,
  profileId: string,
  jobId: string,
): Promise<CraftedResume | null> {
  const doc = await (await crafts()).findOne({ userId, profileId, jobId });
  return doc ? toPublic(doc) : null;
}

export type CraftJobSummary = {
  jobId: string;
  profileId: string;
  updatedAt: string;
};

/** Most recently updated craft per job for this user. */
export async function listLatestCraftsByJob(userId: string): Promise<CraftJobSummary[]> {
  await ensureCraftIndexes();
  const docs = await (await crafts())
    .find({ userId }, { projection: { jobId: 1, profileId: 1, updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .toArray();
  const byJob = new Map<string, CraftJobSummary>();
  for (const doc of docs) {
    if (byJob.has(doc.jobId)) continue;
    byJob.set(doc.jobId, {
      jobId: doc.jobId,
      profileId: doc.profileId,
      updatedAt: doc.updatedAt.toISOString(),
    });
  }
  return [...byJob.values()];
}

export async function deleteCraftsForProfile(profileId: string) {
  await ensureCraftIndexes();
  await (await crafts()).deleteMany({ profileId });
}

export async function deleteCraftsForJob(jobId: string) {
  await ensureCraftIndexes();
  await (await crafts()).deleteMany({ jobId });
}

export async function deleteCraftsForJobs(jobIds: string[]) {
  if (jobIds.length === 0) return;
  await ensureCraftIndexes();
  await (await crafts()).deleteMany({ jobId: { $in: jobIds } });
}
