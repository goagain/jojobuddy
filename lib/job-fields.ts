import { normalizeCompanyName } from "./job-company";
import { formatJobLocations, resolveJobLocation } from "./job-location";
import { extractOfficialJobNumber } from "./job-number";
import { normalizePostedAt } from "./parse-posted-at";
import type { JobInsights } from "./parse-job";

export type JobFieldFallback = {
  title?: string;
  company?: string;
  location?: string;
  jobNumber?: string;
  postedAt?: string;
  sourceUrl?: string;
};

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

/** Prefer AI-extracted post date; fall back to adapter/HTML metadata. */
export function resolveJobPostedAt(insights: JobInsights, fallback?: string): string | undefined {
  if (insights.postedAt) return insights.postedAt;
  return normalizePostedAt(fallback);
}

/** Merge AI insights with page/adapter fallbacks for all structured job fields. */
export function resolveJobFields(insights: JobInsights, fallback: JobFieldFallback = {}) {
  return {
    title: resolveJobTitle(insights, fallback.title),
    company: resolveJobCompany(insights, fallback.company),
    location: resolveJobLocation(insights, fallback.location),
    jobNumber: resolveJobNumber(insights, fallback.sourceUrl) ?? fallback.jobNumber,
    postedAt: resolveJobPostedAt(insights, fallback.postedAt),
    requirements: insights.requirements,
    keywords: insights.keywords,
    locations: insights.locations,
    locationFormatted: formatJobLocations(insights.locations) || fallback.location?.trim() || "",
  };
}

export { resolveJobLocation };
