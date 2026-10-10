import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./db";
import { runOnce } from "./run-once";
import type { FrequencyQuestion } from "./interview/aggregate";
import type { CollectedThread } from "./interview/crawl";

export type InterviewStatus = "crawling" | "ready" | "failed";

export type InterviewDigest = {
  id: string;
  company: string;
  companySlug?: string;
  forumUrl: string;
  fid: number;
  limit: number;
  hasCookie: boolean;
  status: InterviewStatus;
  totalOnSite?: number;
  collected: number;
  readableCount: number;
  lockedCount: number;
  summary: string;
  questions: FrequencyQuestion[];
  threads: CollectedThread[];
  error?: string;
  createdAt: string;
  updatedAt: string;
  crawledAt?: string;
};

export type InterviewDigestSummary = {
  id: string;
  company: string;
  forumUrl: string;
  status: InterviewStatus;
  collected: number;
  questionCount: number;
  topQuestions: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
  crawledAt?: string;
};

type InterviewDigestDoc = {
  _id?: ObjectId;
  userId: string;
  company: string;
  companySlug?: string;
  forumUrl: string;
  fid: number;
  limit: number;
  cookie?: string;
  status: InterviewStatus;
  totalOnSite?: number;
  collected: number;
  readableCount: number;
  lockedCount: number;
  summary: string;
  questions: FrequencyQuestion[];
  threads: CollectedThread[];
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  crawledAt?: Date;
};

export type InterviewDigestRecord = InterviewDigest & { cookie?: string };

function iso(date: Date) {
  return date.toISOString();
}

function objectId(id: string) {
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

function toPublic(doc: InterviewDigestDoc): InterviewDigest {
  if (!doc._id) throw new Error("Interview digest is missing id");
  return {
    id: doc._id.toHexString(),
    company: doc.company,
    companySlug: doc.companySlug,
    forumUrl: doc.forumUrl,
    fid: doc.fid,
    limit: doc.limit,
    hasCookie: Boolean(doc.cookie),
    status: doc.status,
    totalOnSite: doc.totalOnSite,
    collected: doc.collected ?? 0,
    readableCount: doc.readableCount ?? 0,
    lockedCount: doc.lockedCount ?? 0,
    summary: doc.summary ?? "",
    questions: doc.questions ?? [],
    threads: doc.threads ?? [],
    error: doc.error,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
    crawledAt: doc.crawledAt ? iso(doc.crawledAt) : undefined,
  };
}

async function digests(): Promise<Collection<InterviewDigestDoc>> {
  return (await getDb()).collection<InterviewDigestDoc>("interview_digests");
}

export async function ensureInterviewIndexes() {
  return runOnce("interview-indexes", async () => {
    const col = await digests();
    await col.createIndex({ userId: 1, updatedAt: -1 });
    await col.createIndex({ userId: 1, fid: 1, companySlug: 1 });
  });
}

export async function createInterviewDigest(
  userId: string,
  input: { company: string; companySlug?: string; forumUrl: string; fid: number; limit: number; cookie?: string },
): Promise<InterviewDigest> {
  const now = new Date();
  const doc: InterviewDigestDoc = {
    userId,
    company: input.company,
    companySlug: input.companySlug || input.company.trim().toLowerCase(),
    forumUrl: input.forumUrl,
    fid: input.fid,
    limit: input.limit,
    cookie: input.cookie || undefined,
    status: "crawling",
    collected: 0,
    readableCount: 0,
    lockedCount: 0,
    summary: "",
    questions: [],
    threads: [],
    createdAt: now,
    updatedAt: now,
  };
  const result = await (await digests()).insertOne(doc);
  return toPublic({ ...doc, _id: result.insertedId });
}

export async function listInterviewDigests(userId: string): Promise<InterviewDigestSummary[]> {
  const docs = await (await digests())
    .find({ userId }, { projection: { cookie: 0 } })
    .sort({ updatedAt: -1 })
    .toArray();
  return docs.map((doc) => ({
    id: doc._id?.toHexString() ?? "",
    company: doc.company,
    forumUrl: doc.forumUrl,
    status: doc.status,
    collected: doc.collected ?? 0,
    questionCount: doc.questions?.length ?? 0,
    topQuestions: (doc.questions ?? []).slice(0, 3).map((question) => question.text),
    error: doc.error,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
    crawledAt: doc.crawledAt ? iso(doc.crawledAt) : undefined,
  }));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function findInterviewDigest(
  userId: string,
  input: { companySlug: string; company: string; query: string; fid: number },
): Promise<InterviewDigest | null> {
  const names = [...new Set([input.company, input.query].map((value) => value.trim()).filter(Boolean))];
  const doc = await (await digests()).findOne(
    {
      userId,
      fid: input.fid,
      $or: [
        { companySlug: input.companySlug },
        ...names.map((name) => ({ company: { $regex: `^${escapeRegex(name)}$`, $options: "i" } })),
      ],
    },
    { sort: { updatedAt: -1 } },
  );
  return doc ? toPublic(doc) : null;
}

export async function getInterviewDigest(id: string, userId: string): Promise<InterviewDigest | null> {
  const _id = objectId(id);
  if (!_id) return null;
  const doc = await (await digests()).findOne({ _id, userId });
  return doc ? toPublic(doc) : null;
}

export async function getInterviewDigestForCrawl(id: string, userId: string): Promise<InterviewDigestRecord | null> {
  const _id = objectId(id);
  if (!_id) return null;
  const doc = await (await digests()).findOne({ _id, userId });
  if (!doc) return null;
  return { ...toPublic(doc), cookie: doc.cookie };
}

export async function deleteInterviewDigest(id: string, userId: string): Promise<boolean> {
  const _id = objectId(id);
  if (!_id) return false;
  const result = await (await digests()).deleteOne({ _id, userId });
  return result.deletedCount > 0;
}

export async function setInterviewCookie(id: string, userId: string, cookie: string) {
  const _id = objectId(id);
  if (!_id) return;
  const updatedAt = new Date();
  if (cookie) {
    await (await digests()).updateOne({ _id, userId }, { $set: { cookie, updatedAt } });
    return;
  }
  await (await digests()).updateOne({ _id, userId }, { $set: { updatedAt }, $unset: { cookie: "" } });
}

export async function markInterviewCrawling(id: string, userId: string, cookie?: string) {
  const _id = objectId(id);
  if (!_id) return;
  if (cookie !== undefined) await setInterviewCookie(id, userId, cookie);
  await (await digests()).updateOne(
    { _id, userId },
    { $set: { status: "crawling", updatedAt: new Date() }, $unset: { error: "" } },
  );
}

export async function saveInterviewResult(
  id: string,
  userId: string,
  result: {
    totalOnSite: number;
    collected: number;
    readableCount: number;
    lockedCount: number;
    summary: string;
    questions: FrequencyQuestion[];
    threads: CollectedThread[];
  },
) {
  const _id = objectId(id);
  if (!_id) return;
  const now = new Date();
  await (await digests()).updateOne(
    { _id, userId },
    {
      $set: {
        status: "ready",
        totalOnSite: result.totalOnSite,
        collected: result.collected,
        readableCount: result.readableCount,
        lockedCount: result.lockedCount,
        summary: result.summary,
        questions: result.questions,
        threads: result.threads,
        updatedAt: now,
        crawledAt: now,
      },
      $unset: { error: "" },
    },
  );
}

export async function markInterviewFailed(id: string, userId: string, error: string) {
  const _id = objectId(id);
  if (!_id) return;
  await (await digests()).updateOne(
    { _id, userId },
    { $set: { status: "failed", error: error.slice(0, 500), updatedAt: new Date() } },
  );
}
