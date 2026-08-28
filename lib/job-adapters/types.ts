export type AdaptedJobPage = {
  title: string;
  company: string;
  location: string;
  text: string;
  canonicalUrl?: string;
};

export type FetchText = (
  url: URL,
  headers?: Record<string, string>,
) => Promise<{ status: number; body: string }>;

export type JobSiteAdapter = {
  id: string;
  matches(url: URL): boolean;
  fetch(url: URL, fetchText: FetchText): Promise<AdaptedJobPage | null>;
};
