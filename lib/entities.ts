import type { MasterResume } from "./schema";

export type SourceKind = "upload" | "paste" | "url" | "manual";

export type SourceRecord = {
  id: string;
  kind: SourceKind;
  filename?: string;
  mimeType?: string;
  url?: string;
  text: string;
  createdAt: string;
};

export type Profile = {
  id: string;
  name: string;
  resume: MasterResume;
  sources: SourceRecord[];
  createdAt: string;
  updatedAt: string;
};

export type ProfileSummary = {
  id: string;
  name: string;
  personName: string;
  headline?: string;
  experienceCount: number;
  sourceCount: number;
  updatedAt: string;
};

export type Job = {
  id: string;
  title: string;
  company: string;
  location?: string;
  sourceKind: "paste" | "url";
  sourceUrl?: string;
  sourceText: string;
  parsedText: string;
  requirements?: string[];
  keywords?: string[];
  createdAt: string;
  updatedAt: string;
};

export type JobSummary = {
  id: string;
  title: string;
  company: string;
  sourceKind: "paste" | "url";
  sourceUrl?: string;
  excerpt: string;
  updatedAt: string;
};
