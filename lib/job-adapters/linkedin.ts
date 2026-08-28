import * as cheerio from "cheerio";
import type { AdaptedJobPage, FetchText, JobSiteAdapter } from "./types";
import { cleanText } from "./text";

/** Extract numeric job id from LinkedIn view or search-results URLs. */
export function linkedInJobId(raw: string | URL): string | null {
  let url: URL;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== "linkedin.com") return null;

  const fromQuery = url.searchParams.get("currentJobId");
  if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;

  const slugMatch = url.pathname.match(/\/jobs\/view\/(?:[\w%-]+-)?(\d+)\/?$/i);
  if (slugMatch) return slugMatch[1];

  const plainMatch = url.pathname.match(/\/jobs\/view\/(\d+)/i);
  return plainMatch?.[1] ?? null;
}

export function parseLinkedInGuestHtml(html: string): Omit<AdaptedJobPage, "canonicalUrl"> | null {
  const $ = cheerio.load(html);
  const title =
    $(".top-card-layout__title").first().text().trim() ||
    $("h2.top-card-layout__title").first().text().trim() ||
    $("h1").first().text().trim();
  const company =
    $("a[data-tracking-control-name='public_jobs_topcard_org_name']").first().text().trim() ||
    $(".topcard__org-name-link").first().text().trim() ||
    $(".top-card-layout__entity-info .topcard__flavor").first().text().trim();

  const bulletFlavors = $(".topcard__flavor--bullet")
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter(Boolean);
  const locationFromBullet = bulletFlavors.find(
    (line) => !/applicants|See who|\bago\b|\bweeks?\b|\bdays?\b|\bhours?\b/i.test(line),
  );
  const location =
    locationFromBullet ||
    cleanText($(".top-card-layout__entity-info .topcard__flavor").eq(1).text()) ||
    "";

  const description = cleanText($(".show-more-less-html__markup, .description__text").first().text());
  if (!title && description.length < 40) return null;

  const criteria = cleanText($(".description__job-criteria-list").text());
  const sections = [
    title || "LinkedIn job",
    [company && `Company: ${company}`, location && `Location: ${location}`].filter(Boolean).join("\n"),
    description && `Description\n${description}`,
    criteria && `Job criteria\n${criteria}`,
  ].filter(Boolean);

  const text = sections.join("\n\n").trim();
  if (text.length < 40) return null;
  return {
    title: title || "LinkedIn job",
    company,
    location,
    text,
  };
}

async function fetchLinkedInJob(url: URL, fetchText: FetchText): Promise<AdaptedJobPage | null> {
  const jobId = linkedInJobId(url);
  if (!jobId) return null;

  const canonicalUrl = `https://www.linkedin.com/jobs/view/${jobId}`;
  const guestUrl = new URL(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`);

  let status: number;
  let body: string;
  try {
    ({ status, body } = await fetchText(guestUrl));
  } catch {
    return null;
  }
  if (status < 200 || status >= 300) return null;

  const parsed = parseLinkedInGuestHtml(body);
  if (!parsed) return null;
  return { ...parsed, canonicalUrl };
}

export const linkedInJobAdapter: JobSiteAdapter = {
  id: "linkedin",
  matches(url) {
    return linkedInJobId(url) !== null;
  },
  fetch: fetchLinkedInJob,
};
