import { listDailyBoardCrawls, markBoardAutoCrawled } from "@/lib/board-store";
import { enqueueWork, hasActiveBoardCrawl } from "@/lib/work-store";

export const BOARD_DAILY_TIME_ZONE = "Asia/Shanghai";

export function zonedDateKey(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function isDailyCrawlDue(lastDate: string | undefined, today: string) {
  return lastDate !== today;
}

/** Queue one crawl per board that opted into the daily midnight update and has not run today. */
export async function enqueueDueBoardCrawls(now = new Date()) {
  const today = zonedDateKey(BOARD_DAILY_TIME_ZONE, now);
  const boards = await listDailyBoardCrawls(today);
  let queued = 0;
  for (const board of boards) {
    if (!isDailyCrawlDue(board.lastAutoCrawlDate, today)) continue;
    if (await hasActiveBoardCrawl(board.id)) continue;
    await enqueueWork({
      userId: board.userId,
      type: "crawl_board",
      payload: { boardId: board.id, query: board.query, profileId: board.profileId },
    });
    await markBoardAutoCrawled(board.id, today);
    queued += 1;
  }
  return queued;
}
