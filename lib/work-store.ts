import { hostname } from "node:os";
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./db";
import { runOnce } from "./run-once";
import {
  workPriority,
  type PublicWorkJob,
  type WorkJobType,
  type WorkProgress,
} from "./work-types";

export type WorkJobDoc = {
  _id?: ObjectId;
  userId: string;
  type: WorkJobType;
  status: "queued" | "running" | "succeeded" | "failed";
  payload: unknown;
  result?: unknown;
  error?: string;
  progress?: WorkProgress;
  priority: number;
  attempts: number;
  maxAttempts: number;
  lockedAt?: Date;
  lockedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  finishedAt?: Date;
};

export type WorkerDoc = {
  _id: string;
  lastSeen: Date;
  currentJobId?: string | null;
};

const STALE_MS = 2 * 60 * 1000;
const WORKER_ONLINE_MS = 20 * 1000;

async function jobs(): Promise<Collection<WorkJobDoc>> {
  return (await getDb()).collection<WorkJobDoc>("work_jobs");
}

async function workers(): Promise<Collection<WorkerDoc>> {
  return (await getDb()).collection<WorkerDoc>("workers");
}

export async function ensureWorkIndexes() {
  await runOnce("work-priority-index", async () => {
    await (await jobs()).createIndex({ status: 1, priority: -1, createdAt: 1 });
  });
  return runOnce("work-indexes", async () => {
    const col = await jobs();
    await Promise.all([
      col.createIndex({ status: 1, createdAt: 1 }),
      col.createIndex({ status: 1, priority: -1, createdAt: 1 }),
      col.createIndex({ status: 1, lockedAt: 1 }),
      col.createIndex({ userId: 1, createdAt: -1 }),
      (await workers()).createIndex({ lastSeen: -1 }),
    ]);
  });
}

function toPublic(doc: WorkJobDoc): PublicWorkJob {
  if (!doc._id) throw new Error("Work job is missing id");
  return {
    id: doc._id.toHexString(),
    type: doc.type,
    status: doc.status,
    progress: doc.progress,
    result: doc.result,
    error: doc.error,
  };
}

export async function enqueueWork(input: {
  userId: string;
  type: WorkJobType;
  payload: unknown;
}): Promise<PublicWorkJob> {
  const now = new Date();
  const doc: WorkJobDoc = {
    userId: input.userId,
    type: input.type,
    status: "queued",
    payload: input.payload,
    priority: workPriority(input.type),
    attempts: 0,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
  };
  const result = await (await jobs()).insertOne(doc);
  return toPublic({ ...doc, _id: result.insertedId });
}

export async function getWork(id: string, userId: string): Promise<PublicWorkJob | null> {
  const doc = await (await jobs()).findOne({ _id: new ObjectId(id), userId });
  return doc ? toPublic(doc) : null;
}

export async function listActiveCraftJobs(userId: string) {
  const docs = await (await jobs())
    .find({
      userId,
      type: "craft",
      status: { $in: ["queued", "running"] },
    })
    .sort({ createdAt: -1 })
    .toArray();

  return docs.flatMap((doc) => {
    if (!doc._id) return [];
    const payload = doc.payload as { profileId?: string; jobId?: string };
    if (!payload.profileId || !payload.jobId) return [];
    return [
      {
        ...toPublic(doc),
        profileId: payload.profileId,
        jobId: payload.jobId,
      },
    ];
  });
}

export function workerId() {
  return `worker-${hostname()}-${process.pid}`;
}

export async function heartbeat(currentJobId?: string | null) {
  const id = workerId();
  await (await workers()).updateOne(
    { _id: id },
    {
      $set: {
        lastSeen: new Date(),
        currentJobId: currentJobId ?? null,
      },
    },
    { upsert: true },
  );
}

export async function isWorkerOnline(): Promise<boolean> {
  const seen = await (await workers()).findOne({
    lastSeen: { $gt: new Date(Date.now() - WORKER_ONLINE_MS) },
  });
  return Boolean(seen);
}

export async function queueCounts(userId?: string) {
  const col = await jobs();
  const filter = userId ? { userId } : {};
  const [queued, running] = await Promise.all([
    col.countDocuments({ ...filter, status: "queued" }),
    col.countDocuments({ ...filter, status: "running" }),
  ]);
  return { queued, running };
}

export async function claimWork(): Promise<WorkJobDoc | null> {
  const now = new Date();
  const stale = new Date(Date.now() - STALE_MS);
  const result = await (await jobs()).findOneAndUpdate(
    {
      $or: [
        { status: "queued" },
        { status: "running", lockedAt: { $lt: stale } },
      ],
    },
    {
      $set: {
        status: "running",
        lockedAt: now,
        lockedBy: workerId(),
        updatedAt: now,
        progress: { step: "Worker claimed job", percent: 5 },
      },
      $inc: { attempts: 1 },
    },
    { sort: { priority: -1, createdAt: 1 }, returnDocument: "after" },
  );
  return result ?? null;
}

export class WorkYielded extends Error {
  constructor() {
    super("Paused so a job import or resume craft can run first");
    this.name = "WorkYielded";
  }
}

export function isWorkYielded(error: unknown): error is WorkYielded {
  return error instanceof WorkYielded;
}

/** True when a manual import or resume craft is waiting. */
export async function hasHigherPriorityQueued(priority: number): Promise<boolean> {
  const doc = await (await jobs()).findOne(
    { status: "queued", priority: { $gt: priority } },
    { projection: { _id: 1 } },
  );
  return Boolean(doc);
}

/** Put a background job back on the queue without burning a retry. */
export async function releaseForHigherPriority(id: string, payload: unknown, progress: WorkProgress) {
  const result = await (await jobs()).updateOne(
    { _id: new ObjectId(id), status: "running", lockedBy: workerId() },
    {
      $set: {
        status: "queued",
        payload,
        progress,
        updatedAt: new Date(),
      },
      $unset: { lockedAt: "", lockedBy: "" },
      $inc: { attempts: -1 },
    },
  );
  return result.matchedCount > 0;
}

export async function hasActiveBoardCrawl(boardId: string) {
  const doc = await (await jobs()).findOne(
    {
      type: "crawl_board",
      status: { $in: ["queued", "running"] },
      "payload.boardId": boardId,
    },
    { projection: { _id: 1 } },
  );
  return Boolean(doc);
}

export async function touchLock(id: string) {
  await (await jobs()).updateOne(
    { _id: new ObjectId(id), lockedBy: workerId() },
    { $set: { lockedAt: new Date(), updatedAt: new Date() } },
  );
}

export async function updateWorkProgress(id: string, progress: WorkProgress) {
  await (await jobs()).updateOne(
    { _id: new ObjectId(id) },
    { $set: { progress, updatedAt: new Date(), lockedAt: new Date() } },
  );
}

export async function finishWork(id: string, result: unknown) {
  await (await jobs()).updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: "succeeded",
        result,
        progress: { step: "Done", percent: 100 },
        updatedAt: new Date(),
        finishedAt: new Date(),
      },
      $unset: { error: "", lockedAt: "", lockedBy: "" },
    },
  );
}

export async function failWork(id: string, error: string) {
  const doc = await (await jobs()).findOne({ _id: new ObjectId(id) });
  const retry = (doc?.attempts ?? 1) < (doc?.maxAttempts ?? 3);
  await (await jobs()).updateOne(
    { _id: new ObjectId(id) },
    retry
      ? {
          $set: {
            status: "queued",
            error,
            updatedAt: new Date(),
            progress: { step: "Waiting to retry", percent: 0 },
          },
          $unset: { lockedAt: "", lockedBy: "", finishedAt: "" },
        }
      : {
          $set: {
            status: "failed",
            error,
            updatedAt: new Date(),
            finishedAt: new Date(),
            progress: { step: "Failed", percent: 100 },
          },
          $unset: { lockedAt: "", lockedBy: "" },
        },
  );
}
