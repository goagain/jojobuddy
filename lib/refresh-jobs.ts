import { deleteJob, listUrlJobs, updateJob } from "./entity-store";
import { WorkYielded } from "./work-store";
import type { Job } from "./entities";
import { fetchJobPage } from "./extract-url";
import { resolveJobFields } from "./job-fields";
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
  control?: {
    jobIds?: string[];
    nextIndex?: number;
    shouldYield?: () => Promise<boolean>;
    onYield?: (state: { jobIds: string[]; nextIndex: number }) => Promise<boolean>;
  },
): Promise<RefreshJobsResult> {
  const jobs = await listUrlJobs(userId);
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const ids = control?.jobIds ?? jobs.map((job) => job.id);
  const result: RefreshJobsResult = {
    total: ids.length,
    updated: 0,
    deleted: 0,
    skipped: 0,
    errors: [],
  };

  if (ids.length === 0) return result;

  for (let index = control?.nextIndex ?? 0; index < ids.length; index += 1) {
    if (await control?.shouldYield?.()) {
      const paused = await control?.onYield?.({ jobIds: ids, nextIndex: index });
      if (paused) throw new WorkYielded();
    }
    const job = byId.get(ids[index]);
    if (!job) continue;
    const label = job.title.trim() || job.company.trim() || job.id;
    const basePercent = Math.round((index / ids.length) * 90) + 5;
    await onProgress?.(`Refreshing ${index + 1}/${ids.length}: ${label}`, basePercent);

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
    const insights = await analyzeJobDescription(page.text, runtime, { sourceUrl: url });
    const fields = resolveJobFields(insights, {
      title: page.title || job.title,
      company: page.company || job.company,
      location: page.location,
      postedAt: page.postedAt ?? job.postedAt,
      jobNumber: job.jobNumber,
      sourceUrl: page.url,
    });
    await updateJob(userId, job.id, {
      title: fields.title,
      company: fields.company,
      location: fields.location,
      jobNumber: fields.jobNumber,
      sourceUrl: page.url,
      sourceText: page.text,
      parsedText: page.text,
      requirements: fields.requirements,
      keywords: fields.keywords,
      postedAt: fields.postedAt,
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
