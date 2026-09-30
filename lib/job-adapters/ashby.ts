import { ashbyJobRef, fallbackCompanyName, readAshbyJobText } from "@/lib/job-boards/ashby";
import type { AdaptedJobPage, FetchText, JobSiteAdapter } from "./types";

async function fetchAshbyJob(url: URL, fetchText: FetchText): Promise<AdaptedJobPage | null> {
  const ref = ashbyJobRef(url);
  if (!ref) return null;
  const apiUrl = new URL(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.board)}`);
  let status: number;
  let body: string;
  try {
    ({ status, body } = await fetchText(apiUrl));
  } catch {
    return null;
  }
  if (status < 200 || status >= 300) return null;
  let page: ReturnType<typeof readAshbyJobText>;
  try {
    page = readAshbyJobText(JSON.parse(body), ref.id);
  } catch {
    return null;
  }
  if (!page) return null;
  return {
    title: page.title,
    company: fallbackCompanyName(ref.board),
    location: page.location,
    text: page.text,
    canonicalUrl: `https://jobs.ashbyhq.com/${ref.board}/${ref.id}`,
    postedAt: page.postedAt,
  };
}

export const ashbyJobAdapter: JobSiteAdapter = {
  id: "ashby",
  matches(url) {
    return ashbyJobRef(url) !== null;
  },
  fetch: fetchAshbyJob,
};
