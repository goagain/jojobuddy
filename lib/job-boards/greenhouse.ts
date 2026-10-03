import { htmlToText } from "@/lib/job-adapters/text";
import type { FetchText } from "@/lib/job-adapters/types";
import { normalizePostedAt } from "@/lib/parse-posted-at";
import { fallbackCompanyName } from "./ashby";
import { prepareListings } from "./prepare";
import { FACET_VALUE_SEPARATOR, type BoardFacet, type BoardListing, type BoardMeta, type BoardQuery, type JobBoardAdapter } from "./types";

type GreenhouseNamed = {
  name?: string;
  location?: string;
};

type GreenhouseJob = {
  id?: number | string;
  title?: string;
  absolute_url?: string;
  company_name?: string;
  location?: { name?: string };
  departments?: GreenhouseNamed[];
  offices?: GreenhouseNamed[];
  first_published?: string;
  updated_at?: string;
  content?: string;
};

const BOARD_HOSTS = new Set([
  "job-boards.greenhouse.io",
  "boards.greenhouse.io",
  "job-boards.eu.greenhouse.io",
  "boards.eu.greenhouse.io",
]);

const API_HOSTS = ["boards-api.greenhouse.io", "boards-api.eu.greenhouse.io"];

function boardHost(url: URL) {
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}

function isSlug(value: string) {
  return /^[a-z0-9][a-z0-9_-]{0,80}$/i.test(value);
}

export function greenhouseBoardSlug(url: URL): string | null {
  if (!BOARD_HOSTS.has(boardHost(url))) return null;
  const token = url.searchParams.get("for");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed" && token && isSlug(token)) return token;
  if (parts.length !== 1 || !isSlug(parts[0])) return null;
  return parts[0];
}

export function greenhouseJobRef(url: URL): { board: string; id: string } | null {
  if (!BOARD_HOSTS.has(boardHost(url))) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[1] !== "jobs") return null;
  const [board, , id] = parts;
  if (!isSlug(board) || !/^\d+$/.test(id)) return null;
  return { board, id };
}

export function findGreenhouseBoardUrl(html: string): string | null {
  const direct = html.match(
    /https?:\/\/(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/(?!embed\b)([a-z0-9][a-z0-9_-]*)\b/i,
  );
  if (direct) return `https://job-boards.greenhouse.io/${direct[1]}`;
  if (!/greenhouse\.io/i.test(html)) return null;
  const token = html.match(/[?&]for=([a-z0-9][a-z0-9_-]*)/i)?.[1];
  if (!token || !isSlug(token)) return null;
  return `https://job-boards.greenhouse.io/${token}`;
}

function decodeGreenhouseHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function plainContent(content: string | undefined) {
  const raw = content?.trim();
  if (!raw) return "";
  return htmlToText(decodeGreenhouseHtml(raw));
}

function excerpt(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 280 ? `${compact.slice(0, 277)}…` : compact;
}

function names(items: GreenhouseNamed[] | undefined) {
  return (items ?? []).map((item) => item.name?.trim() || "").filter(Boolean);
}

function locationLabel(job: GreenhouseJob) {
  const places = new Set<string>();
  const primary = job.location?.name?.trim();
  if (primary) places.add(primary);
  for (const office of job.offices ?? []) {
    const place = (office.location || office.name || "").trim();
    if (place) places.add(place);
  }
  return [...places].join(" / ") || undefined;
}

function toListing(job: GreenhouseJob): BoardListing | null {
  const id = job.id == null ? "" : String(job.id).trim();
  const title = job.title?.trim();
  const url = job.absolute_url?.trim();
  if (!id || !title || !url) return null;
  const departments = names(job.departments);
  const offices = names(job.offices);
  const department = departments[0] ?? "";
  const text = plainContent(job.content);
  return {
    id,
    title,
    url,
    location: locationLabel(job),
    family: department || undefined,
    postedAt: normalizePostedAt(job.first_published || job.updated_at),
    excerpt: text ? excerpt(text) : undefined,
    facets: {
      ...(department ? { department } : {}),
      ...(offices.length ? { office: offices.join(FACET_VALUE_SEPARATOR) } : {}),
    },
  };
}

export function parseGreenhouseJobs(payload: unknown): BoardListing[] {
  const jobs = (payload as { jobs?: GreenhouseJob[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.flatMap((job) => {
    const listing = toListing(job);
    return listing ? [listing] : [];
  });
}

export function companyFromGreenhousePayload(payload: unknown) {
  const jobs = (payload as { jobs?: GreenhouseJob[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return "";
  return jobs.find((job) => job.company_name?.trim())?.company_name?.trim() ?? "";
}

function facetValues(value: string) {
  return value
    .split(FACET_VALUE_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function greenhouseFacets(listings: BoardListing[]): BoardFacet[] {
  const specs = [
    ["department", "Department"],
    ["office", "Office"],
  ] as const;
  return specs
    .map(([id, label]) => {
      const counts = new Map<string, number>();
      for (const listing of listings) {
        const raw = listing.facets[id];
        if (!raw) continue;
        for (const value of facetValues(raw)) {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      const options = [...counts.entries()]
        .map(([value, count]) => ({ id: value, label: value, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      return { id, label, options };
    })
    .filter((facet) => facet.options.length > 0);
}

function jobFromPayload(payload: unknown, jobId: string): GreenhouseJob | null {
  if (payload && typeof payload === "object" && "id" in payload && String((payload as GreenhouseJob).id) === jobId) {
    return payload as GreenhouseJob;
  }
  const jobs = (payload as { jobs?: GreenhouseJob[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return null;
  return jobs.find((job) => String(job.id) === jobId) ?? null;
}

export function readGreenhouseJobText(payload: unknown, jobId: string): {
  title: string;
  company: string;
  location: string;
  text: string;
  url?: string;
  postedAt?: string;
} | null {
  const job = jobFromPayload(payload, jobId);
  if (!job?.title) return null;
  const departments = names(job.departments);
  const offices = names(job.offices);
  const location = locationLabel(job) ?? "";
  const lines = [
    job.title,
    departments.length ? `Department: ${departments.join(", ")}` : "",
    offices.length ? `Office: ${offices.join(", ")}` : "",
    location && `Location: ${location}`,
    plainContent(job.content),
  ].filter(Boolean);
  const text = lines.join("\n\n").trim();
  if (text.length < 40) return null;
  return {
    title: job.title,
    company: job.company_name?.trim() || "",
    location,
    text,
    url: job.absolute_url?.trim(),
    postedAt: normalizePostedAt(job.first_published || job.updated_at),
  };
}

export function greenhouseMeta(company: string, listings: BoardListing[]): BoardMeta {
  return {
    company,
    facets: greenhouseFacets(listings),
    capabilities: { supportsPostedSince: true, serverFilters: true },
    total: listings.length,
  };
}

async function fetchGreenhouseJson(path: string, fetchText: FetchText): Promise<unknown | null> {
  for (const host of API_HOSTS) {
    let status: number;
    let body: string;
    try {
      ({ status, body } = await fetchText(new URL(`https://${host}${path}`)));
    } catch {
      continue;
    }
    if (status < 200 || status >= 300) continue;
    try {
      return JSON.parse(body);
    } catch {
      continue;
    }
  }
  return null;
}

export const greenhouseBoardAdapter: JobBoardAdapter = {
  id: "greenhouse",
  matches(url) {
    return greenhouseBoardSlug(url) !== null;
  },
  async discover(url, fetchText) {
    const slug = greenhouseBoardSlug(url);
    if (!slug) return null;
    const payload = await fetchGreenhouseJson(
      `/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
      fetchText,
    );
    if (!payload || !Array.isArray((payload as { jobs?: unknown }).jobs)) return null;
    const listings = parseGreenhouseJobs(payload);
    const company = companyFromGreenhousePayload(payload) || fallbackCompanyName(slug);
    return {
      boardUrl: `https://job-boards.greenhouse.io/${slug}`,
      meta: greenhouseMeta(company, listings),
    };
  },
  async list(url, fetchText, query: BoardQuery) {
    const slug = greenhouseBoardSlug(url);
    if (!slug) return null;
    const payload = await fetchGreenhouseJson(
      `/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
      fetchText,
    );
    if (!payload) return null;
    return prepareListings(parseGreenhouseJobs(payload), query);
  },
};
