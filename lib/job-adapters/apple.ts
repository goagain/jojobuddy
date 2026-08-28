import type { AdaptedJobPage, FetchText, JobSiteAdapter } from "./types";
import { htmlToText } from "./text";

async function fetchAppleJob(url: URL, fetchText: FetchText): Promise<AdaptedJobPage | null> {
  const match = url.pathname.match(/\/details\/(\d+(?:-\d+)?)/i);
  if (!url.hostname.endsWith("apple.com") || !match) return null;

  const apiUrl = new URL(`https://jobs.apple.com/api/v1/jobDetails/${match[1]}`);
  let status: number;
  let body: string;
  try {
    ({ status, body } = await fetchText(apiUrl));
  } catch {
    return null;
  }
  if (status < 200 || status >= 300) return null;

  let payload: { res?: Record<string, unknown> };
  try {
    payload = JSON.parse(body) as { res?: Record<string, unknown> };
  } catch {
    return null;
  }
  const job = payload.res;
  if (!job) return null;

  const title = String(job.postingTitle ?? "");
  const locations = Array.isArray(job.locations)
    ? job.locations
        .map((item) => {
          const loc = item as { name?: string; city?: string; stateProvince?: string; countryName?: string };
          return [loc.city || loc.name, loc.stateProvince, loc.countryName].filter(Boolean).join(", ");
        })
        .filter(Boolean)
        .join(" / ")
    : "";
  const teams = Array.isArray(job.teamNames) ? job.teamNames.map(String).join(", ") : "";
  const level = [job.lowJobTitle, job.highJobTitle].filter(Boolean).map(String).join(" – ");

  const sections = [
    title,
    ["Company: Apple", locations && `Location: ${locations}`, teams && `Team: ${teams}`, level && `Level: ${level}`]
      .filter(Boolean)
      .join("\n"),
    job.jobSummary && `Summary\n${htmlToText(String(job.jobSummary))}`,
    job.description && `Description\n${htmlToText(String(job.description))}`,
    job.minimumQualifications &&
      `Minimum Qualifications\n${htmlToText(String(job.minimumQualifications))}`,
    job.preferredQualifications &&
      `Preferred Qualifications\n${htmlToText(String(job.preferredQualifications))}`,
  ].filter(Boolean);

  const text = sections.join("\n\n").trim();
  if (text.length < 40) return null;
  return { title: title || "Apple job", company: "Apple", location: locations, text };
}

export const appleJobAdapter: JobSiteAdapter = {
  id: "apple",
  matches(url) {
    return url.hostname.endsWith("apple.com") && /\/details\/(\d+(?:-\d+)?)/i.test(url.pathname);
  },
  fetch: fetchAppleJob,
};
