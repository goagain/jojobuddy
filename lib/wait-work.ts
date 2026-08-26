import { readResponseJson } from "./http-json";
import type { PublicWorkJob, WorkProgress } from "./work-types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableApiError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /HTML page|empty body|invalid JSON|Work API unavailable/i.test(error.message);
}

async function fetchWorkPayload(jobId: string, retries = 4): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(`/api/work/${jobId}`);
      const payload = await readResponseJson<Record<string, unknown>>(response, "Work API");
      if (!response.ok) {
        throw new Error(String(payload.error ?? "Failed to load work job"));
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (!isRetryableApiError(error) || attempt === retries - 1) throw error;
      await sleep(600 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Work API unavailable");
}

export async function waitForWorkJob<T>(
  jobId: string,
  onProgress?: (progress?: WorkProgress, status?: string) => void,
): Promise<T> {
  for (;;) {
    const payload = await fetchWorkPayload(jobId);
    const job = payload.job as PublicWorkJob;
    onProgress?.(job.progress, job.status);
    if (job.status === "succeeded") return job.result as T;
    if (job.status === "failed") throw new Error(job.error ?? "Work job failed");
    if (!payload.workerOnline && job.status === "queued") {
      onProgress?.({ step: "Waiting for worker… run npm run dev:worker in another terminal", percent: 0 }, job.status);
    }
    await sleep(700);
  }
}

export async function enqueueWork<T>(input: {
  type: "parse_url" | "parse_resume" | "craft";
  payload: unknown;
  onProgress?: (progress?: WorkProgress, status?: string) => void;
}): Promise<T> {
  const response = await fetch("/api/work", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await readResponseJson<Record<string, unknown>>(response, "Work API");
  if (!response.ok) throw new Error(String(payload.error ?? "Failed to enqueue"));
  if (payload.hint && !payload.workerOnline) {
    input.onProgress?.({ step: String(payload.hint), percent: 0 }, "queued");
  }
  const job = payload.job as PublicWorkJob;
  return waitForWorkJob<T>(job.id, input.onProgress);
}
