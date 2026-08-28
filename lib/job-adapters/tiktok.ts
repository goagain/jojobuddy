import type { AdaptedJobPage, FetchText, JobSiteAdapter } from "./types";
import { cleanText } from "./text";

type TikTokCity = {
  en_name?: string;
  i18n_name?: string;
  name?: string;
};

type TikTokJobDetail = {
  title?: string;
  description?: string;
  requirement?: string;
  city_info?: TikTokCity;
  city_list?: TikTokCity[];
  job_category?: { en_name?: string; i18n_name?: string; name?: string };
  recruit_type?: { en_name?: string; i18n_name?: string; name?: string };
};

/** Extract numeric position id from lifeattiktok.com referral URLs. */
export function tikTokPositionId(raw: string | URL): string | null {
  let url: URL;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== "lifeattiktok.com") return null;

  const match = url.pathname.match(/\/position\/(\d+)(?:\/|$)/i);
  return match?.[1] ?? null;
}

function formatCity(city: TikTokCity | undefined) {
  if (!city) return "";
  return (city.en_name || city.i18n_name || city.name || "").trim();
}

function formatLocation(detail: TikTokJobDetail) {
  const fromList = (detail.city_list ?? []).map(formatCity).filter(Boolean);
  if (fromList.length > 0) return fromList.join(" / ");
  return formatCity(detail.city_info);
}

export function parseTikTokJobPayload(body: string): Omit<AdaptedJobPage, "canonicalUrl"> | null {
  let payload: { code?: number; data?: { job_post_detail?: TikTokJobDetail } };
  try {
    payload = JSON.parse(body) as { code?: number; data?: { job_post_detail?: TikTokJobDetail } };
  } catch {
    return null;
  }
  if (payload.code !== 0) return null;

  const detail = payload.data?.job_post_detail;
  if (!detail) return null;

  const title = String(detail.title ?? "").trim();
  const description = cleanText(String(detail.description ?? ""));
  const requirement = cleanText(String(detail.requirement ?? ""));
  const location = formatLocation(detail);
  const category = detail.job_category?.en_name || detail.job_category?.i18n_name || detail.job_category?.name || "";
  const recruitType =
    detail.recruit_type?.en_name || detail.recruit_type?.i18n_name || detail.recruit_type?.name || "";

  const sections = [
    title || "TikTok job",
    [
      "Company: TikTok",
      location && `Location: ${location}`,
      category && `Category: ${category}`,
      recruitType && `Type: ${recruitType}`,
    ]
      .filter(Boolean)
      .join("\n"),
    description && `Description\n${description}`,
    requirement && `Requirements\n${requirement}`,
  ].filter(Boolean);

  const text = sections.join("\n\n").trim();
  if (text.length < 40) return null;

  return {
    title: title || "TikTok job",
    company: "TikTok",
    location,
    text,
  };
}

async function fetchTikTokJob(url: URL, fetchText: FetchText): Promise<AdaptedJobPage | null> {
  const positionId = tikTokPositionId(url);
  if (!positionId) return null;

  const apiUrl = new URL(`https://${url.hostname}/api/v1/job/posts/${positionId}`);
  let status: number;
  let body: string;
  try {
    ({ status, body } = await fetchText(apiUrl, {
      Accept: "application/json",
      Referer: url.toString(),
    }));
  } catch {
    return null;
  }
  if (status < 200 || status >= 300) return null;

  const parsed = parseTikTokJobPayload(body);
  if (!parsed) return null;

  return {
    ...parsed,
    canonicalUrl: url.toString(),
  };
}

export const tikTokJobAdapter: JobSiteAdapter = {
  id: "tiktok",
  matches(url) {
    return Boolean(tikTokPositionId(url));
  },
  fetch: fetchTikTokJob,
};
