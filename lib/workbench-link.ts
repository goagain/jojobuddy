/** Build workbench URL with optional pre-selected profile and job. */
export function workbenchHref(input?: { profileId?: string; jobId?: string }) {
  const params = new URLSearchParams();
  if (input?.profileId) params.set("profileId", input.profileId);
  if (input?.jobId) params.set("jobId", input.jobId);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
