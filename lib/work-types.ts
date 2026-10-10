import type { BoardQuery } from "./job-boards/types";

export const WORK_JOB_TYPES = [
  "parse_url",
  "parse_resume",
  "analyze_job",
  "craft",
  "refresh_jobs",
  "discover_board",
  "crawl_board",
  "score_board",
  "crawl_interview",
] as const;

export type WorkJobType = (typeof WORK_JOB_TYPES)[number];

/** Higher runs first. Manual job import and resume craft always outrank board crawls. */
export function workPriority(type: WorkJobType): number {
  switch (type) {
    case "parse_url":
    case "parse_resume":
    case "analyze_job":
    case "craft":
      return 100;
    default:
      return 0;
  }
}

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

export type RefreshJobsPayload = {
  jobIds?: string[];
  nextIndex?: number;
};

export type DiscoverBoardPayload = { boardId: string };

export type CrawlBoardPayload = {
  boardId: string;
  query: BoardQuery;
  profileId?: string;
  /** Set when a crawl paused so a job import or resume craft could run. */
  resumeScoring?: boolean;
};

export type ScoreBoardPayload = {
  boardId: string;
  profileId: string;
  resumeScoring?: boolean;
};

export type CrawlInterviewPayload = { digestId: string };

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
