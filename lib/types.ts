import type { UsedModel } from "./llm-types";
import type { CraftedResumeDoc } from "./crafted-schema";
import type { Judgment } from "./schema";

export type CraftRound = {
  round: number;
  resumeMarkdown: string;
  crafted?: CraftedResumeDoc;
  judgment: Judgment;
};

export type CraftResult = {
  resumeMarkdown: string;
  crafted?: CraftedResumeDoc;
  judgment: Judgment;
  rounds: CraftRound[];
  stoppedReason: "s_rank" | "threshold" | "max_rounds";
  /** User's hand-edited Markdown for the final round; cleared when the resume is re-crafted. */
  editedMarkdown?: string;
  usedModels: {
    generator: UsedModel;
    judge: UsedModel;
  };
};

export type CraftOptions = {
  autoRefine?: boolean;
  threshold?: number;
  maxRounds?: number;
};

export type CraftedResume = {
  id: string;
  profileId: string;
  jobId: string;
  profileName: string;
  personName: string;
  jobTitle: string;
  jobCompany: string;
  result: CraftResult;
  createdAt: string;
  updatedAt: string;
};
