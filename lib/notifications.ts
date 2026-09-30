import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./db";
import { FIT_HIGHLIGHT_SCORE } from "./job-boards/fit";
import { runOnce } from "./run-once";
import type { StoredBoardListing } from "./job-boards/types";

export type AppNotification = {
  id: string;
  boardId: string;
  listingId: string;
  title: string;
  company: string;
  score: number;
  url: string;
  read: boolean;
  createdAt: string;
};

type NotificationDoc = {
  _id?: ObjectId;
  userId: string;
  boardId: string;
  listingId: string;
  title: string;
  company: string;
  score: number;
  url: string;
  read: boolean;
  createdAt: Date;
};

function isDuplicateKey(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 11000;
}

async function notifications(): Promise<Collection<NotificationDoc>> {
  return (await getDb()).collection<NotificationDoc>("notifications");
}

export async function ensureNotificationIndexes() {
  return runOnce("notification-indexes", async () => {
    const col = await notifications();
    await Promise.all([
      col.createIndex({ userId: 1, boardId: 1, listingId: 1 }, { unique: true }),
      col.createIndex({ userId: 1, createdAt: -1 }),
    ]);
  });
}

export async function notifyHighScoreListings(
  userId: string,
  boardId: string,
  company: string,
  listings: StoredBoardListing[],
) {
  const fresh = listings.filter((listing) => (listing.fitScore ?? -1) >= FIT_HIGHLIGHT_SCORE && listing.url);
  if (fresh.length === 0) return;
  const col = await notifications();
  const now = new Date();
  for (const listing of fresh) {
    try {
      await col.insertOne({
        userId,
        boardId,
        listingId: listing.id,
        title: listing.title,
        company,
        score: listing.fitScore ?? FIT_HIGHLIGHT_SCORE,
        url: listing.url,
        read: false,
        createdAt: now,
      });
    } catch (error) {
      if (isDuplicateKey(error)) continue;
      throw error;
    }
  }
}

export async function listNotifications(userId: string): Promise<{ unread: number; notifications: AppNotification[] }> {
  const col = await notifications();
  const [unread, docs] = await Promise.all([
    col.countDocuments({ userId, read: false }),
    col.find({ userId }).sort({ createdAt: -1 }).limit(20).toArray(),
  ]);
  return {
    unread,
    notifications: docs.flatMap((doc) => {
      if (!doc._id) return [];
      return [
        {
          id: doc._id.toHexString(),
          boardId: doc.boardId,
          listingId: doc.listingId,
          title: doc.title,
          company: doc.company,
          score: doc.score,
          url: doc.url,
          read: doc.read,
          createdAt: doc.createdAt.toISOString(),
        },
      ];
    }),
  };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const filter: { userId: string; _id?: { $in: ObjectId[] } } = { userId };
  if (ids?.length) {
    filter._id = { $in: ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) };
  }
  await (await notifications()).updateMany(filter, { $set: { read: true } });
}
