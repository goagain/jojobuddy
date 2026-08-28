import { deleteJob, listUrlJobs, updateJob } from "./entity-store";
import type { Job } from "./entities";
import { fetchJobPage } from "./extract-url";
import { resolveJobLocation } from "./job-location";
import type { LlmRuntime } from "./llm-types";
import { analyzeJobDescription } from "./parse-job";

export type RefreshJobsResult = {
  total: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: { id: string; title: string; error: string }[];
};

type RefreshOneOutcome =
  | { status: "updated" }
  | { status: "deleted" }
  | { status: "skipped"; error: string };

/** Definitive fetch failures — job listing is gone or unusable. */
export function isInvalidJobFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  if (/fetch failed \((404|410|451)\)/.test(message)) return true;
  if (/almost no readable text/.test(message)) return true;
  if (/invalid url|only http\/https|cannot be fetched/.test(message)) return true;
  if (/job (?:is )?(?:no longer|not) (?:available|open|accepting)/.test(message)) return true;
  if (/posting (?:has )?(?:expired|been removed|closed)/.test(message)) return true;
  return false;
}

export async function refreshUserJobs(
  userId: string,
  runtime: LlmRuntime,
  onProgress?: (step: string, percent: number) => void | Promise<void>,
): Promise<RefreshJobsResult> {
  const jobs = await listUrlJobs(userId);
  const result: RefreshJobsResult = {
    total: jobs.length,
    updated: 0,
    deleted: 0,
    skipped: 0,
    errors: [],
  };

  if (jobs.length === 0) return result;

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const label = job.title.trim() || job.company.trim() || job.id;
    const basePercent = Math.round((index / jobs.length) * 90) + 5;
    await onProgress?.(`Refreshing ${index + 1}/${jobs.length}: ${label}`, basePercent);

    const outcome = await refreshOneJob(userId, job, runtime);
    if (outcome.status === "updated") result.updated += 1;
    else if (outcome.status === "deleted") result.deleted += 1;
    else {
      result.skipped += 1;
      result.errors.push({ id: job.id, title: label, error: outcome.error });
    }
  }

  await onProgress?.("Done", 100);
  return result;
}

async function refreshOneJob(
  userId: string,
  job: Job,
  runtime: LlmRuntime,
): Promise<RefreshOneOutcome> {
  const url = job.sourceUrl?.trim();
  if (!url) return { status: "skipped", error: "Missing URL" };

  try {
    const page = await fetchJobPage(url);
    const insights = await analyzeJobDescription(page.text, runtime);
    await updateJob(userId, job.id, {
      title: page.title || job.title,
      company: page.company || job.company,
      location: resolveJobLocation(insights, page.location),
      sourceUrl: page.url,
      sourceText: page.text,
      parsedText: page.text,
      requirements: insights.requirements,
      keywords: insights.keywords,
      postedAt: page.postedAt ?? job.postedAt,
    });
    return { status: "updated" };
  } catch (error) {
    if (isInvalidJobFetchError(error)) {
      await deleteJob(userId, job.id);
      return { status: "deleted" };
    }
    const message = error instanceof Error ? error.message : "Refresh failed";
    return { status: "skipped", error: message };
  }
}
