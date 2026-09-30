import {
  getJobBoard,
  saveBoardCrawl,
  saveBoardDiscovery,
  setBoardStatus,
  type JobBoard,
} from "@/lib/board-store";
import { assertPublicHttpUrl, fetchText } from "@/lib/extract-url";
import { getProfile } from "@/lib/entity-store";
import { pickParseRuntime } from "@/lib/llm-store";
import type { MasterResume } from "@/lib/schema";
import { mergeBoardListings } from "./merge";
import { notifyHighScoreListings } from "@/lib/notifications";
import { FIT_HIGHLIGHT_SCORE, scoreBoardListings } from "./fit";
import { discoverJobBoard, listJobBoard } from "./index";
import { isWorkYielded, WorkYielded } from "@/lib/work-store";
import type { BoardQuery, StoredBoardListing } from "./types";

const SCORE_BATCH = 8;

type ScoreControl = {
  resumeScoring?: boolean;
  shouldYield?: () => Promise<boolean>;
  pause?: (step: string, percent: number) => Promise<boolean>;
};

async function failBoard(
  userId: string,
  boardId: string,
  error: unknown,
  status: "failed" | "ready" | "crawled",
): Promise<never> {
  const message = error instanceof Error ? error.message : "Job board request failed";
  await setBoardStatus(userId, boardId, status, message);
  throw error instanceof Error ? error : new Error(message);
}

export async function discoverSavedBoard(
  boardId: string,
  userId: string,
  onProgress?: (step: string, percent: number) => Promise<void>,
): Promise<JobBoard> {
  const board = await getJobBoard(boardId, userId);
  if (!board) throw new Error("Board not found");
  try {
    await onProgress?.("Reading job board filters", 25);
    const url = await assertPublicHttpUrl(board.sourceUrl);
    const found = await discoverJobBoard(url, fetchText);
    if (!found) {
      throw new Error(
        "No job board found at this URL. Paste a list page such as https://jobs.ashbyhq.com/openai",
      );
    }
    await onProgress?.("Saving filters", 85);
    const saved = await saveBoardDiscovery(userId, boardId, found);
    if (!saved) throw new Error("Board not found");
    return saved;
  } catch (error) {
    if (isWorkYielded(error)) throw error;
    return failBoard(userId, boardId, error, "failed");
  }
}

export async function crawlSavedBoard(
  boardId: string,
  userId: string,
  query: BoardQuery,
  profileId: string | undefined,
  onProgress?: (step: string, percent: number) => Promise<void>,
  control: ScoreControl = {},
): Promise<JobBoard> {
  const board = await getJobBoard(boardId, userId);
  if (!board) throw new Error("Board not found");
  if (!board.boardUrl || !board.adapterId) {
    throw new Error("Read the board filters before pulling jobs");
  }
  const fallback = board.listings.length > 0 ? "crawled" : "ready";
  try {
    await setBoardStatus(userId, boardId, "crawling");
    if (!profileId) {
      throw new Error("Pick a profile so jobs can be scored against your resume");
    }
    const profile = await getProfile(profileId, userId);
    if (!profile) throw new Error("Profile not found");
    const canResume = Boolean(control.resumeScoring && board.profileId === profileId && board.listings.length > 0);
    let listings = board.listings;
    if (!canResume) {
      await onProgress?.("Pulling jobs that match your filters", 20);
      const url = await assertPublicHttpUrl(board.boardUrl);
      listings = await listJobBoard(board.adapterId, url, fetchText, query);
      listings = mergeBoardListings(board.listings, listings).merged;
      await saveBoardCrawl(userId, boardId, { listings, query, profileId });
    }
    const scored = await scorePulledListings(
      userId,
      boardId,
      board.company,
      profile.resume,
      listings,
      onProgress,
      control,
      async (next) => {
        await saveBoardCrawl(userId, boardId, { listings: next, query, profileId });
      },
    );
    await onProgress?.("Saving scores", 95);
    const saved = await saveBoardCrawl(userId, boardId, { listings: scored, query, profileId });
    if (!saved) throw new Error("Board not found");
    return saved;
  } catch (error) {
    if (isWorkYielded(error)) throw error;
    const current = await getJobBoard(boardId, userId);
    return failBoard(userId, boardId, error, current?.listings.length ? "crawled" : fallback);
  }
}

export async function scoreSavedBoard(
  boardId: string,
  userId: string,
  profileId: string,
  onProgress?: (step: string, percent: number) => Promise<void>,
  control: ScoreControl = {},
): Promise<JobBoard> {
  const board = await getJobBoard(boardId, userId);
  if (!board) throw new Error("Board not found");
  if (board.listings.length === 0) throw new Error("Pull jobs before scoring");
  const profile = await getProfile(profileId, userId);
  if (!profile) throw new Error("Profile not found");
  const query = board.query ?? { selections: {}, maxJobs: board.listings.length };
  let listings = board.listings;
  if (!control.resumeScoring) {
    listings = listings.map((listing) => ({ ...listing, fitScore: undefined, fitReason: undefined }));
    await saveBoardCrawl(userId, boardId, { listings, query, profileId });
  }
  try {
    const scored = await scorePulledListings(
      userId,
      boardId,
      board.company,
      profile.resume,
      listings,
      onProgress,
      control,
      async (next) => {
        await saveBoardCrawl(userId, boardId, { listings: next, query, profileId });
      },
    );
    const saved = await saveBoardCrawl(userId, boardId, { listings: scored, query, profileId });
    if (!saved) throw new Error("Board not found");
    return saved;
  } catch (error) {
    if (isWorkYielded(error)) throw error;
    return failBoard(userId, boardId, error, "crawled");
  }
}

async function scorePulledListings(
  userId: string,
  boardId: string,
  company: string,
  resume: MasterResume,
  listings: StoredBoardListing[],
  onProgress: ((step: string, percent: number) => Promise<void>) | undefined,
  control: ScoreControl,
  save: (listings: StoredBoardListing[]) => Promise<void>,
) {
  const runtime = await pickParseRuntime(userId);
  let current = listings;
  const total = current.length;
  const pending = () => current.filter((listing) => listing.fitScore == null);

  while (pending().length > 0) {
    const done = total - pending().length;
    const percent = 40 + Math.round((done / Math.max(total, 1)) * 50);
    if (await control.shouldYield?.()) {
      const paused = await control.pause?.("Paused — job import and resume craft go first", percent);
      if (paused) throw new WorkYielded();
    }
    const batch = pending().slice(0, SCORE_BATCH);
    const before = pending().length;
    const scoredBatch = await scoreBoardListings({
      resume,
      listings: batch,
      runtime,
      batchSize: batch.length,
    });
    const byId = new Map(scoredBatch.map((listing) => [listing.id, listing]));
    current = current.map((listing) => byId.get(listing.id) ?? listing);
    if (pending().length >= before) {
      throw new Error("Fit scoring made no progress");
    }
    await save(current);
    const justScored = scoredBatch.filter((listing) => (listing.fitScore ?? -1) >= FIT_HIGHLIGHT_SCORE);
    await notifyHighScoreListings(userId, boardId, company, justScored);
    await onProgress?.(`Scoring ${total - pending().length}/${total} against your resume`, percent);
  }
  return current;
}
