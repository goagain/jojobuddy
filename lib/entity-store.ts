import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./db";
import type { Job, JobSummary, Profile, ProfileSummary, SourceRecord } from "./entities";
import { deleteCraftsForJob, deleteCraftsForProfile, deleteCraftsForJobs } from "./craft-store";
import { normalizePostedAt } from "./parse-posted-at";
import { sortResumeByTime } from "./resume-factory";
import type { MasterResume } from "./schema";

type ProfileDoc = {
  _id?: ObjectId;
  userId: string;
  name: string;
  resume: MasterResume;
  sources: SourceRecord[];
  createdAt: Date;
  updatedAt: Date;
};

type JobDoc = {
  _id?: ObjectId;
  userId: string;
  title: string;
  company: string;
  location?: string;
  sourceKind: "paste" | "url";
  sourceUrl?: string;
  sourceText: string;
  parsedText: string;
  requirements?: string[];
  keywords?: string[];
  postedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

function iso(date: Date) {
  return date.toISOString();
}

function excerpt(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 160 ? `${compact.slice(0, 157)}…` : compact;
}

function toProfile(doc: ProfileDoc): Profile {
  if (!doc._id) throw new Error("Profile is missing id");
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    resume: sortResumeByTime(doc.resume),
    sources: doc.sources ?? [],
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

function toProfileSummary(doc: ProfileDoc): ProfileSummary {
  const profile = toProfile(doc);
  return {
    id: profile.id,
    name: profile.name,
    personName: profile.resume.identity.name,
    headline: profile.resume.identity.headline,
    experienceCount: profile.resume.experiences.length,
    sourceCount: profile.sources.length,
    updatedAt: profile.updatedAt,
  };
}

function toJob(doc: JobDoc): Job {
  if (!doc._id) throw new Error("Job is missing id");
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    company: doc.company,
    location: doc.location,
    sourceKind: doc.sourceKind,
    sourceUrl: doc.sourceUrl,
    sourceText: doc.sourceText,
    parsedText: doc.parsedText,
    requirements: doc.requirements ?? [],
    keywords: doc.keywords ?? [],
    postedAt: doc.postedAt ? iso(doc.postedAt) : undefined,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

function toJobSummary(doc: JobDoc): JobSummary {
  const job = toJob(doc);
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    sourceKind: job.sourceKind,
    sourceUrl: job.sourceUrl,
    excerpt: excerpt(job.parsedText || job.sourceText),
    postedAt: job.postedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

async function profiles(): Promise<Collection<ProfileDoc>> {
  return (await getDb()).collection<ProfileDoc>("profiles");
}

async function jobs(): Promise<Collection<JobDoc>> {
  return (await getDb()).collection<JobDoc>("job_descriptions");
}

export async function ensureEntityIndexes() {
  const profileCol = await profiles();
  const jobCol = await jobs();
  await Promise.all([
    profileCol.createIndex({ userId: 1, updatedAt: -1 }),
    jobCol.createIndex({ userId: 1, updatedAt: -1 }),
    jobCol.createIndex({ userId: 1, createdAt: 1 }),
  ]);
}

export async function listProfiles(userId: string): Promise<ProfileSummary[]> {
  await ensureEntityIndexes();
  const docs = await (await profiles()).find({ userId }).sort({ updatedAt: -1 }).toArray();
  return docs.map(toProfileSummary);
}

export async function getProfile(id: string, userId: string): Promise<Profile | null> {
  const doc = await (await profiles()).findOne({ _id: new ObjectId(id), userId });
  return doc ? toProfile(doc) : null;
}

export async function createProfile(
  userId: string,
  input: {
    name: string;
    resume: MasterResume;
    sources?: SourceRecord[];
  },
): Promise<Profile> {
  const now = new Date();
  const doc: ProfileDoc = {
    userId,
    name: input.name.trim() || input.resume.identity.name || "Untitled profile",
    resume: sortResumeByTime(input.resume),
    sources: input.sources ?? [],
    createdAt: now,
    updatedAt: now,
  };
  const result = await (await profiles()).insertOne(doc);
  return toProfile({ ...doc, _id: result.insertedId });
}

export async function updateProfile(
  userId: string,
  id: string,
  patch: { name?: string; resume?: MasterResume; sources?: SourceRecord[] },
): Promise<Profile | null> {
  const $set: Partial<ProfileDoc> = { updatedAt: new Date() };
  if (patch.name !== undefined) $set.name = patch.name.trim();
  if (patch.resume !== undefined) $set.resume = sortResumeByTime(patch.resume);
  if (patch.sources !== undefined) $set.sources = patch.sources;
  const result = await (await profiles()).findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set },
    { returnDocument: "after" },
  );
  return result ? toProfile(result) : null;
}

export async function deleteProfile(userId: string, id: string): Promise<boolean> {
  const result = await (await profiles()).deleteOne({ _id: new ObjectId(id), userId });
  if (result.deletedCount > 0) await deleteCraftsForProfile(id);
  return result.deletedCount > 0;
}

export async function listJobs(userId: string): Promise<JobSummary[]> {
  await ensureEntityIndexes();
  const docs = await (await jobs()).find({ userId }).sort({ updatedAt: -1 }).toArray();
  return docs.map(toJobSummary);
}

export async function getJob(id: string, userId: string): Promise<Job | null> {
  const doc = await (await jobs()).findOne({ _id: new ObjectId(id), userId });
  return doc ? toJob(doc) : null;
}

export async function createJob(
  userId: string,
  input: {
    title: string;
    company?: string;
    location?: string;
    sourceKind: "paste" | "url";
    sourceUrl?: string;
    sourceText: string;
    parsedText: string;
    requirements?: string[];
    keywords?: string[];
    postedAt?: string;
  },
): Promise<Job> {
  const now = new Date();
  const parsedText = input.parsedText.trim();
  const postedAt = normalizePostedAt(input.postedAt);
  const doc: JobDoc = {
    userId,
    title: input.title.trim() || "Untitled job",
    company: input.company?.trim() ?? "",
    location: input.location?.trim(),
    sourceKind: input.sourceKind,
    sourceUrl: input.sourceUrl,
    sourceText: input.sourceText,
    parsedText,
    requirements: input.requirements?.map((item) => item.trim()).filter(Boolean),
    keywords: input.keywords?.map((item) => item.trim()).filter(Boolean),
    postedAt: postedAt ? new Date(postedAt) : undefined,
    createdAt: now,
    updatedAt: now,
  };
  const result = await (await jobs()).insertOne(doc);
  return toJob({ ...doc, _id: result.insertedId });
}

export async function updateJob(
  userId: string,
  id: string,
  patch: Partial<Omit<Job, "id" | "createdAt" | "updatedAt">>,
): Promise<Job | null> {
  const $set: Partial<JobDoc> = { updatedAt: new Date() };
  if (patch.title !== undefined) $set.title = patch.title.trim();
  if (patch.company !== undefined) $set.company = patch.company.trim();
  if (patch.location !== undefined) $set.location = patch.location;
  if (patch.sourceKind !== undefined) $set.sourceKind = patch.sourceKind;
  if (patch.sourceUrl !== undefined) $set.sourceUrl = patch.sourceUrl;
  if (patch.sourceText !== undefined) $set.sourceText = patch.sourceText;
  if (patch.parsedText !== undefined) $set.parsedText = patch.parsedText.trim();
  if (patch.requirements !== undefined) {
    $set.requirements = patch.requirements.map((item) => item.trim()).filter(Boolean);
  }
  if (patch.keywords !== undefined) {
    $set.keywords = patch.keywords.map((item) => item.trim()).filter(Boolean);
  }
  if (patch.postedAt !== undefined) {
    const postedAt = normalizePostedAt(patch.postedAt);
    $set.postedAt = postedAt ? new Date(postedAt) : undefined;
  }
  const result = await (await jobs()).findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set },
    { returnDocument: "after" },
  );
  return result ? toJob(result) : null;
}

export async function deleteJob(userId: string, id: string): Promise<boolean> {
  const result = await (await jobs()).deleteOne({ _id: new ObjectId(id), userId });
  if (result.deletedCount > 0) await deleteCraftsForJob(id);
  return result.deletedCount > 0;
}

export const STALE_JOB_DAYS = 30;

export async function deleteJobsOlderThan(userId: string, olderThanDays: number): Promise<number> {
  await ensureEntityIndexes();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  const col = await jobs();
  const stale = await col
    .find({ userId, createdAt: { $lt: cutoff } }, { projection: { _id: 1 } })
    .toArray();
  if (stale.length === 0) return 0;
  const ids = stale.map((doc) => doc._id!.toHexString());
  await deleteCraftsForJobs(ids);
  const result = await col.deleteMany({ userId, createdAt: { $lt: cutoff } });
  return result.deletedCount;
}

export async function entityCounts(userId: string) {
  const [profileCount, jobCount] = await Promise.all([
    (await profiles()).countDocuments({ userId }),
    (await jobs()).countDocuments({ userId }),
  ]);
  return { profiles: profileCount, jobs: jobCount };
}
