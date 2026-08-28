import { normalizeCompanyName } from "./job-company";
import { resolveJobLocation } from "./job-location";
import { extractOfficialJobNumber } from "./job-number";
import type { JobInsights } from "./parse-job";

export function resolveJobTitle(insights: JobInsights, fallback?: string): string {
  const title = insights.title.trim();
  if (title) return title.slice(0, 160);
  return fallback?.trim().slice(0, 160) || "Untitled job";
}

export function resolveJobCompany(insights: JobInsights, fallback?: string): string {
  const fromAi = normalizeCompanyName(insights.company);
  if (fromAi) return fromAi;
  return normalizeCompanyName(fallback ?? "");
}

/** Prefer official id from URL; AI extraction is fallback. */
export function resolveJobNumber(insights: JobInsights, sourceUrl?: string): string | undefined {
  const fromUrl = extractOfficialJobNumber(sourceUrl);
  if (fromUrl) return fromUrl;
  const fromAi = insights.jobNumber.trim();
  return fromAi || undefined;
}

export { resolveJobLocation };
