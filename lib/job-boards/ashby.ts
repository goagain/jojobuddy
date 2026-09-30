import type { FetchText } from "@/lib/job-adapters/types";
import { normalizePostedAt } from "@/lib/parse-posted-at";
import { prepareListings } from "./prepare";
import type { BoardFacet, BoardListing, BoardMeta, BoardQuery, JobBoardAdapter } from "./types";

type AshbyJob = {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: unknown[];
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  jobUrl?: string;
  descriptionPlain?: string;
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  FullTime: "Full-time",
  PartTime: "Part-time",
  Intern: "Intern",
  Contract: "Contract",
  Temporary: "Temporary",
};

export function ashbyBoardSlug(url: URL): string | null {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== "jobs.ashbyhq.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return null;
  if (!/^[a-z0-9][a-z0-9_-]{0,80}$/i.test(parts[0])) return null;
  return parts[0];
}

export function ashbyJobRef(url: URL): { board: string; id: string } | null {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== "jobs.ashbyhq.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [board, id] = parts;
  if (!/^[a-z0-9][a-z0-9_-]{0,80}$/i.test(board)) return null;
  if (!/^[a-z0-9-]{8,}$/i.test(id)) return null;
  return { board, id };
}

export function findAshbyBoardUrl(html: string): string | null {
  const match = html.match(/https?:\/\/jobs\.ashbyhq\.com\/([a-z0-9][a-z0-9_-]*)\b/i);
  if (!match) return null;
  return `https://jobs.ashbyhq.com/${match[1]}`;
}

export function companyFromAshbyHtml(html: string): string {
  const og =
    html.match(/property=["']og:site_name["']\s+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/content=["']([^"']+)["']\s+property=["']og:site_name["']/i)?.[1];
  if (og?.trim()) return decodeHtml(og.trim());
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "";
  return decodeHtml(title)
    .replace(/\s*[|\-–—].*$/, "")
    .replace(/\bjobs?\b/gi, "")
    .replace(/\bat\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function fallbackCompanyName(slug: string) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function secondaryLocation(item: unknown): string {
  if (typeof item === "string") return item.trim();
  if (!item || typeof item !== "object") return "";
  const record = item as { location?: string; name?: string };
  return (record.location || record.name || "").trim();
}

function excerpt(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 280 ? `${compact.slice(0, 277)}…` : compact;
}

export function parseAshbyJobs(payload: unknown): BoardListing[] {
  const jobs = (payload as { jobs?: AshbyJob[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return [];
  const listings: BoardListing[] = [];
  for (const job of jobs) {
    if (job.isListed === false) continue;
    const id = job.id?.trim();
    const title = job.title?.trim();
    const url = job.jobUrl?.trim();
    if (!id || !title || !url) continue;
    const places = [job.location, ...(job.secondaryLocations ?? []).map(secondaryLocation)].filter(
      (place): place is string => Boolean(place && place.trim()),
    );
    const location = places.join(" / ") || (job.isRemote ? "Remote" : undefined);
    const department = job.department?.trim() || "";
    const team = job.team?.trim() || "";
    const employmentType = job.employmentType?.trim() || "";
    listings.push({
      id,
      title,
      url,
      location,
      family: team || department || undefined,
      postedAt: normalizePostedAt(job.publishedAt),
      excerpt: job.descriptionPlain ? excerpt(job.descriptionPlain) : undefined,
      facets: {
        ...(department ? { department } : {}),
        ...(team ? { team } : {}),
        ...(job.location?.trim() ? { location: job.location.trim() } : {}),
        ...(employmentType ? { employmentType } : {}),
      },
    });
  }
  return listings;
}

export function ashbyFacets(listings: BoardListing[]): BoardFacet[] {
  const specs = [
    ["department", "Department"],
    ["team", "Team"],
    ["location", "Location"],
    ["employmentType", "Employment type"],
  ] as const;
  return specs
    .map(([id, label]) => {
      const counts = new Map<string, number>();
      for (const listing of listings) {
        const value = listing.facets[id];
        if (!value) continue;
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      const options = [...counts.entries()]
        .map(([value, count]) => ({
          id: value,
          label: id === "employmentType" ? EMPLOYMENT_LABELS[value] ?? value : value,
          count,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      return { id, label, options };
    })
    .filter((facet) => facet.options.length > 0);
}

export function readAshbyJobText(payload: unknown, jobId: string): {
  title: string;
  location: string;
  text: string;
  postedAt?: string;
} | null {
  const jobs = (payload as { jobs?: AshbyJob[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return null;
  const job = jobs.find((item) => item.id === jobId);
  if (!job?.title) return null;
  const places = [job.location, ...(job.secondaryLocations ?? []).map(secondaryLocation)].filter(
    (place): place is string => Boolean(place && place.trim()),
  );
  const location = places.join(" / ");
  const lines = [
    job.title,
    job.department && `Department: ${job.department}`,
    job.team && `Team: ${job.team}`,
    location && `Location: ${location}`,
    job.employmentType && `Employment: ${EMPLOYMENT_LABELS[job.employmentType] ?? job.employmentType}`,
    job.descriptionPlain?.trim(),
  ].filter(Boolean);
  const text = lines.join("\n\n").trim();
  if (text.length < 40) return null;
  return {
    title: job.title,
    location,
    text,
    postedAt: normalizePostedAt(job.publishedAt),
  };
}

export function ashbyMeta(company: string, listings: BoardListing[]): BoardMeta {
  return {
    company,
    facets: ashbyFacets(listings),
    capabilities: { supportsPostedSince: true, serverFilters: true },
    total: listings.length,
  };
}

async function fetchAshbyJobs(slug: string, fetchText: FetchText): Promise<BoardListing[] | null> {
  const apiUrl = new URL(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`);
  let status: number;
  let body: string;
  try {
    ({ status, body } = await fetchText(apiUrl));
  } catch {
    return null;
  }
  if (status < 200 || status >= 300) return null;
  try {
    return parseAshbyJobs(JSON.parse(body));
  } catch {
    return null;
  }
}

async function companyForSlug(slug: string, pageUrl: URL, fetchText: FetchText) {
  try {
    const page = await fetchText(pageUrl);
    if (page.status >= 200 && page.status < 300) {
      const fromHtml = companyFromAshbyHtml(page.body);
      if (fromHtml) return fromHtml;
    }
  } catch {
    // The posting API is enough to list jobs; the HTML title is only a nicer company name.
  }
  return fallbackCompanyName(slug);
}

export const ashbyBoardAdapter: JobBoardAdapter = {
  id: "ashby",
  matches(url) {
    return ashbyBoardSlug(url) !== null;
  },
  async discover(url, fetchText) {
    const slug = ashbyBoardSlug(url);
    if (!slug) return null;
    const listings = await fetchAshbyJobs(slug, fetchText);
    if (!listings) return null;
    const boardUrl = `https://jobs.ashbyhq.com/${slug}`;
    const company = await companyForSlug(slug, url, fetchText);
    return { boardUrl, meta: ashbyMeta(company, listings) };
  },
  async list(url, fetchText, query: BoardQuery) {
    const slug = ashbyBoardSlug(url);
    if (!slug) return null;
    const listings = await fetchAshbyJobs(slug, fetchText);
    if (!listings) return null;
    return prepareListings(listings, query);
  },
};
