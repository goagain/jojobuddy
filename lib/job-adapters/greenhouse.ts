import { fallbackCompanyName } from "@/lib/job-boards/ashby";
import { greenhouseJobRef, readGreenhouseJobText } from "@/lib/job-boards/greenhouse";
import type { AdaptedJobPage, FetchText, JobSiteAdapter } from "./types";

const API_HOSTS = ["boards-api.greenhouse.io", "boards-api.eu.greenhouse.io"];

async function fetchGreenhouseJob(url: URL, fetchText: FetchText): Promise<AdaptedJobPage | null> {
  const ref = greenhouseJobRef(url);
  if (!ref) return null;
  for (const host of API_HOSTS) {
    const apiUrl = new URL(
      `https://${host}/v1/boards/${encodeURIComponent(ref.board)}/jobs/${encodeURIComponent(ref.id)}`,
    );
    let status: number;
    let body: string;
    try {
      ({ status, body } = await fetchText(apiUrl));
    } catch {
      continue;
    }
    if (status < 200 || status >= 300) continue;
    let page: ReturnType<typeof readGreenhouseJobText>;
    try {
      page = readGreenhouseJobText(JSON.parse(body), ref.id);
    } catch {
      continue;
    }
    if (!page) continue;
    return {
      title: page.title,
      company: page.company || fallbackCompanyName(ref.board),
      location: page.location,
      text: page.text,
      canonicalUrl: page.url || `https://job-boards.greenhouse.io/${ref.board}/jobs/${ref.id}`,
      postedAt: page.postedAt,
    };
  }
  return null;
}

export const greenhouseJobAdapter: JobSiteAdapter = {
  id: "greenhouse",
  matches(url) {
    return greenhouseJobRef(url) !== null;
  },
  fetch: fetchGreenhouseJob,
};
