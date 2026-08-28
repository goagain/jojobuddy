function sanitizePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Resume export stem: Name - Job title - job id - Company */
export function buildResumeExportStem(input: {
  personName?: string;
  jobTitle?: string;
  jobId?: string;
  company?: string;
}): string {
  const name = sanitizePart(input.personName ?? "") || "resume";
  const parts = [name];

  const title = sanitizePart(input.jobTitle ?? "");
  if (title) parts.push(title);

  const jobId = sanitizePart(input.jobId ?? "");
  if (jobId) parts.push(jobId);

  const company = sanitizePart(input.company ?? "");
  if (company) parts.push(company);

  return parts.join(" - ").slice(0, 160) || "resume";
}
