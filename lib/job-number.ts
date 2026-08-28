import { linkedInJobId } from "./job-adapters/linkedin";
import { tikTokPositionId } from "./job-adapters/tiktok";

/** Apple jobs.apple.com jobNumber, e.g. 200678539-3337 */
export function appleJobNumber(raw: string | URL): string | null {
  let url: URL;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    return null;
  }
  if (!url.hostname.replace(/^www\./i, "").toLowerCase().endsWith("apple.com")) return null;
  const match = url.pathname.match(/\/details\/(\d+(?:-\d+)?)/i);
  return match?.[1] ?? null;
}

/** Official listing id from a job URL (Apple jobNumber, LinkedIn id, TikTok position id, …). */
export function extractOfficialJobNumber(sourceUrl?: string): string | null {
  if (!sourceUrl?.trim()) return null;
  return appleJobNumber(sourceUrl) ?? linkedInJobId(sourceUrl) ?? tikTokPositionId(sourceUrl);
}
