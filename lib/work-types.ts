export const WORK_JOB_TYPES = ["parse_url", "parse_resume", "analyze_job", "craft", "refresh_jobs"] as const;

export type WorkJobType = (typeof WORK_JOB_TYPES)[number];

export type WorkJobStatus = "queued" | "running" | "succeeded" | "failed";

export type WorkProgress = {
  step: string;
  percent?: number;
};

export type ParseUrlPayload = { url: string };

export type ParseResumePayload = {
  text: string;
  modelId?: string;
  kind: "upload" | "paste";
  filename?: string;
  mimeType?: string;
};

export type AnalyzeJobPayload = {
  text: string;
  modelId?: string;
  sourceUrl?: string;
};

export type RefreshJobsPayload = Record<string, never>;

export type CraftPayload = {
  profileId: string;
  jobId: string;
  generatorModelId: string;
  judgeModelId: string;
  options?: {
    autoRefine?: boolean;
    threshold?: number;
    maxRounds?: number;
  };
};

export type PublicWorkJob = {
  id: string;
  type: WorkJobType;
  status: WorkJobStatus;
  progress?: WorkProgress;
  result?: unknown;
  error?: string;
  workerOnlineHint?: string;
};
