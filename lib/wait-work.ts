import type { PublicWorkJob, WorkProgress } from "./work-types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForWorkJob<T>(
  jobId: string,
  onProgress?: (progress?: WorkProgress, status?: string) => void,
): Promise<T> {
  for (;;) {
    const response = await fetch(`/api/work/${jobId}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Failed to load work job");
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
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Failed to enqueue");
  if (payload.hint && !payload.workerOnline) {
    input.onProgress?.({ step: payload.hint, percent: 0 }, "queued");
  }
  return waitForWorkJob<T>(payload.job.id, input.onProgress);
}
