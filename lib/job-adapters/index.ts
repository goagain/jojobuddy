import { appleJobAdapter } from "./apple";
import { linkedInJobAdapter } from "./linkedin";
import { tikTokJobAdapter } from "./tiktok";
import type { AdaptedJobPage, FetchText, JobSiteAdapter } from "./types";

export type { AdaptedJobPage, FetchText, JobSiteAdapter } from "./types";
export { appleJobAdapter } from "./apple";
export { linkedInJobAdapter, linkedInJobId, parseLinkedInGuestHtml } from "./linkedin";
export { parseTikTokJobPayload, tikTokJobAdapter, tikTokPositionId } from "./tiktok";

/** Site-specific parsers tried before generic HTML extraction. */
export const jobSiteAdapters: JobSiteAdapter[] = [appleJobAdapter, linkedInJobAdapter, tikTokJobAdapter];

export async function fetchViaJobAdapters(
  url: URL,
  fetchText: FetchText,
): Promise<AdaptedJobPage | null> {
  for (const adapter of jobSiteAdapters) {
    if (!adapter.matches(url)) continue;
    const result = await adapter.fetch(url, fetchText);
    if (result) return result;
  }
  return null;
}
