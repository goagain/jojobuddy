import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./db";
import { runOnce } from "./run-once";
import type {
  BoardCapabilities,
  BoardFacet,
  BoardQuery,
  StoredBoardListing,
} from "./job-boards/types";

export type JobBoardStatus = "discovering" | "ready" | "crawling" | "crawled" | "failed";

export type JobBoard = {
  id: string;
  sourceUrl: string;
  boardUrl?: string;
  company: string;
  adapterId: string;
  status: JobBoardStatus;
  facets: BoardFacet[];
  capabilities: BoardCapabilities;
  total?: number;
  query?: BoardQuery;
  profileId?: string;
  listings: StoredBoardListing[];
  error?: string;
  dailyUpdate: boolean;
  createdAt: string;
  updatedAt: string;
  crawledAt?: string;
};

export type JobBoardSummary = {
  id: string;
  sourceUrl: string;
  company: string;
  adapterId: string;
  status: JobBoardStatus;
  total?: number;
  listingCount: number;
  dailyUpdate: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
  crawledAt?: string;
};

type JobBoardDoc = {
  _id?: ObjectId;
  userId: string;
  sourceUrl: string;
  boardUrl?: string;
  company: string;
  adapterId: string;
  status: JobBoardStatus;
  facets: BoardFacet[];
  capabilities: BoardCapabilities;
  total?: number;
  query?: BoardQuery;
  profileId?: string;
  listings: StoredBoardListing[];
  error?: string;
  dailyUpdate?: boolean;
  lastAutoCrawlDate?: string;
  createdAt: Date;
  updatedAt: Date;
  crawledAt?: Date;
};

const EMPTY_CAPABILITIES: BoardCapabilities = {
  supportsPostedSince: false,
  serverFilters: false,
};

function iso(date: Date) {
  return date.toISOString();
}

function objectId(id: string) {
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

function toBoard(doc: JobBoardDoc): JobBoard {
  if (!doc._id) throw new Error("Board is missing id");
  return {
    id: doc._id.toHexString(),
    sourceUrl: doc.sourceUrl,
    boardUrl: doc.boardUrl,
    company: doc.company,
    adapterId: doc.adapterId,
    status: doc.status,
    facets: doc.facets ?? [],
    capabilities: doc.capabilities ?? EMPTY_CAPABILITIES,
    total: doc.total,
    query: doc.query,
    profileId: doc.profileId,
    listings: doc.listings ?? [],
    error: doc.error,
    dailyUpdate: Boolean(doc.dailyUpdate),
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
    crawledAt: doc.crawledAt ? iso(doc.crawledAt) : undefined,
  };
}

async function boards(): Promise<Collection<JobBoardDoc>> {
  return (await getDb()).collection<JobBoardDoc>("job_boards");
}

export async function ensureBoardIndexes() {
  return runOnce("board-indexes", async () => {
    const col = await boards();
    await col.createIndex({ userId: 1, updatedAt: -1 });
  });
}

export async function createJobBoard(userId: string, sourceUrl: string): Promise<JobBoard> {
  const now = new Date();
  const doc: JobBoardDoc = {
    userId,
    sourceUrl,
    company: "",
    adapterId: "",
    status: "discovering",
    facets: [],
    capabilities: EMPTY_CAPABILITIES,
    listings: [],
    dailyUpdate: false,
    createdAt: now,
    updatedAt: now,
  };
  const result = await (await boards()).insertOne(doc);
  return toBoard({ ...doc, _id: result.insertedId });
}

export async function listJobBoards(userId: string): Promise<JobBoardSummary[]> {
  const docs = await (await boards())
    .aggregate<{
      _id: ObjectId;
      sourceUrl: string;
      company: string;
      adapterId: string;
      status: JobBoardStatus;
      total?: number;
      listingCount: number;
      dailyUpdate?: boolean;
      error?: string;
      createdAt: Date;
      updatedAt: Date;
      crawledAt?: Date;
    }>([
      { $match: { userId } },
      { $sort: { updatedAt: -1 } },
      {
        $project: {
          sourceUrl: 1,
          company: 1,
          adapterId: 1,
          status: 1,
          total: 1,
          error: 1,
          dailyUpdate: 1,
          createdAt: 1,
          updatedAt: 1,
          crawledAt: 1,
          listingCount: { $size: { $ifNull: ["$listings", []] } },
        },
      },
    ])
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    sourceUrl: doc.sourceUrl,
    company: doc.company,
    adapterId: doc.adapterId,
    status: doc.status,
    total: doc.total,
    listingCount: doc.listingCount,
    dailyUpdate: Boolean(doc.dailyUpdate),
    error: doc.error,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
    crawledAt: doc.crawledAt ? iso(doc.crawledAt) : undefined,
  }));
}

export async function getJobBoard(id: string, userId: string): Promise<JobBoard | null> {
  const _id = objectId(id);
  if (!_id) return null;
  const doc = await (await boards()).findOne({ _id, userId });
  return doc ? toBoard(doc) : null;
}

export async function deleteJobBoard(id: string, userId: string): Promise<boolean> {
  const _id = objectId(id);
  if (!_id) return false;
  const result = await (await boards()).deleteOne({ _id, userId });
  return result.deletedCount > 0;
}

export async function saveBoardDiscovery(
  userId: string,
  id: string,
  found: {
    adapterId: string;
    boardUrl: string;
    meta: {
      company: string;
      facets: BoardFacet[];
      capabilities: BoardCapabilities;
      total: number;
    };
  },
): Promise<JobBoard | null> {
  const _id = objectId(id);
  if (!_id) return null;
  const result = await (await boards()).findOneAndUpdate(
    { _id, userId },
    {
      $set: {
        adapterId: found.adapterId,
        boardUrl: found.boardUrl,
        company: found.meta.company,
        facets: found.meta.facets,
        capabilities: found.meta.capabilities,
        total: found.meta.total,
        status: "ready",
        updatedAt: new Date(),
      },
      $unset: { error: "" },
    },
    { returnDocument: "after" },
  );
  return result ? toBoard(result) : null;
}

export async function saveBoardCrawl(
  userId: string,
  id: string,
  input: { listings: StoredBoardListing[]; query: BoardQuery; profileId?: string },
): Promise<JobBoard | null> {
  const _id = objectId(id);
  if (!_id) return null;
  const now = new Date();
  const result = await (await boards()).findOneAndUpdate(
    { _id, userId },
    {
      $set: {
        listings: input.listings,
        query: input.query,
        profileId: input.profileId,
        status: "crawled",
        crawledAt: now,
        updatedAt: now,
      },
      $unset: { error: "" },
    },
    { returnDocument: "after" },
  );
  return result ? toBoard(result) : null;
}

export async function setBoardStatus(
  userId: string,
  id: string,
  status: JobBoardStatus,
  error?: string,
): Promise<void> {
  const _id = objectId(id);
  if (!_id) return;
  if (error) {
    await (await boards()).updateOne(
      { _id, userId },
      { $set: { status, error, updatedAt: new Date() } },
    );
    return;
  }
  await (await boards()).updateOne(
    { _id, userId },
    { $set: { status, updatedAt: new Date() }, $unset: { error: "" } },
  );
}

export async function setBoardProfile(
  userId: string,
  id: string,
  profileId: string | undefined,
): Promise<JobBoard | null> {
  const _id = objectId(id);
  if (!_id) return null;
  const result = await (await boards()).findOneAndUpdate(
    { _id, userId },
    profileId
      ? { $set: { profileId, updatedAt: new Date() } }
      : { $set: { updatedAt: new Date() }, $unset: { profileId: "" } },
    { returnDocument: "after" },
  );
  return result ? toBoard(result) : null;
}

export async function setBoardDailyUpdate(userId: string, id: string, dailyUpdate: boolean): Promise<JobBoard | null> {
  const _id = objectId(id);
  if (!_id) return null;
  const result = await (await boards()).findOneAndUpdate(
    { _id, userId },
    { $set: { dailyUpdate, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return result ? toBoard(result) : null;
}

export async function listDailyBoardCrawls(today: string) {
  const docs = await (await boards())
    .find({
      dailyUpdate: true,
      profileId: { $type: "string", $ne: "" },
      query: { $exists: true },
      status: { $in: ["ready", "crawled", "failed"] },
      lastAutoCrawlDate: { $ne: today },
    })
    .project<{
      _id: ObjectId;
      userId: string;
      profileId: string;
      query: BoardQuery;
      lastAutoCrawlDate?: string;
    }>({ userId: 1, profileId: 1, query: 1, lastAutoCrawlDate: 1 })
    .toArray();
  return docs.flatMap((doc) => {
    if (!doc.profileId || !doc.query) return [];
    return [
      {
        id: doc._id.toHexString(),
        userId: doc.userId,
        profileId: doc.profileId,
        query: doc.query,
        lastAutoCrawlDate: doc.lastAutoCrawlDate,
      },
    ];
  });
}

export async function markBoardAutoCrawled(id: string, day: string) {
  const _id = objectId(id);
  if (!_id) return;
  await (await boards()).updateOne({ _id }, { $set: { lastAutoCrawlDate: day, updatedAt: new Date() } });
}
