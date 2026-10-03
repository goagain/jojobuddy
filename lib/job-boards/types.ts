import type { FetchText } from "@/lib/job-adapters/types";

export type { FetchText };

export const JOB_LEVELS = [
  "intern",
  "new_grad",
  "mid",
  "senior",
  "staff",
  "principal",
  "manager",
  "director",
  "unspecified",
] as const;

export type JobLevel = (typeof JOB_LEVELS)[number];

export type RoleFamily = "engineer" | "other";

export type BoardFacetOption = {
  id: string;
  label: string;
  count: number;
};

export type BoardFacet = {
  id: string;
  label: string;
  options: BoardFacetOption[];
};

export type BoardCapabilities = {
  supportsPostedSince: boolean;
  /** Facets, role, level, and posted window are applied before maxJobs. */
  serverFilters: boolean;
};

export type BoardMeta = {
  company: string;
  facets: BoardFacet[];
  capabilities: BoardCapabilities;
  total: number;
};

export type BoardQuery = {
  selections: Record<string, string[]>;
  maxJobs: number;
  postedWithinDays?: number;
  role?: RoleFamily;
  levels?: JobLevel[];
};

/** Joins several values of one facet, such as a job listed in two offices. */
export const FACET_VALUE_SEPARATOR = "\u001f";

export type BoardListing = {
  id: string;
  title: string;
  url: string;
  location?: string;
  family?: string;
  postedAt?: string;
  excerpt?: string;
  facets: Record<string, string>;
};

export type StoredBoardListing = BoardListing & {
  level: JobLevel;
  roleFamily: RoleFamily;
  /** 0–100 fit against the selected profile. Set by the parse model after a pull. */
  fitScore?: number;
  fitReason?: string;
};

export type JobBoardAdapter = {
  id: string;
  matches(url: URL): boolean;
  discover(url: URL, fetchText: FetchText): Promise<{ boardUrl: string; meta: BoardMeta } | null>;
  list(url: URL, fetchText: FetchText, query: BoardQuery): Promise<StoredBoardListing[] | null>;
};
