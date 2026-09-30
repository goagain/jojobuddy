import type { FetchText } from "@/lib/job-adapters/types";
import { ashbyBoardAdapter, findAshbyBoardUrl } from "./ashby";
import type { BoardMeta, BoardQuery, JobBoardAdapter, StoredBoardListing } from "./types";

export type { BoardFacet, BoardListing, BoardMeta, BoardQuery, JobBoardAdapter, StoredBoardListing } from "./types";
export { ashbyBoardAdapter, ashbyBoardSlug, findAshbyBoardUrl, parseAshbyJobs } from "./ashby";

/** Site-specific board readers. Add a file and append it here to patch a new ATS. */
export const jobBoardAdapters: JobBoardAdapter[] = [ashbyBoardAdapter];

export type DiscoveredBoard = {
  adapterId: string;
  boardUrl: string;
  meta: BoardMeta;
};

async function discoverEmbedded(url: URL, fetchText: FetchText) {
  let status: number;
  let body: string;
  try {
    ({ status, body } = await fetchText(url));
  } catch {
    return null;
  }
  if (status < 200 || status >= 300) return null;
  const embedded = findAshbyBoardUrl(body);
  if (!embedded) return null;
  const found = await ashbyBoardAdapter.discover(new URL(embedded), fetchText);
  if (!found) return null;
  return { adapterId: ashbyBoardAdapter.id, ...found };
}

export async function discoverJobBoard(url: URL, fetchText: FetchText) {
  for (const adapter of jobBoardAdapters) {
    if (!adapter.matches(url)) continue;
    const found = await adapter.discover(url, fetchText);
    if (found) return { adapterId: adapter.id, ...found };
  }
  return discoverEmbedded(url, fetchText);
}

export async function listJobBoard(
  adapterId: string,
  url: URL,
  fetchText: FetchText,
  query: BoardQuery,
): Promise<StoredBoardListing[]> {
  const adapter = jobBoardAdapters.find((item) => item.id === adapterId);
  if (!adapter) throw new Error(`No job board adapter: ${adapterId}`);
  const listings = await adapter.list(url, fetchText, query);
  if (!listings) throw new Error("Could not read jobs from this board");
  return listings;
}
