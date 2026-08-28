export type WorkbenchSearchState = {
  profileId?: string;
  jobId?: string;
  generatorModelId?: string;
  judgeModelId?: string;
  autoRefine?: boolean;
  threshold?: number;
};

export function parseWorkbenchSearch(params: URLSearchParams): WorkbenchSearchState {
  const thresholdRaw = params.get("threshold");
  const threshold = thresholdRaw !== null ? Number(thresholdRaw) : undefined;
  return {
    profileId: params.get("profileId") ?? undefined,
    jobId: params.get("jobId") ?? undefined,
    generatorModelId: params.get("generatorModelId") ?? undefined,
    judgeModelId: params.get("judgeModelId") ?? undefined,
    autoRefine: params.has("autoRefine") ? params.get("autoRefine") !== "0" : undefined,
    threshold:
      threshold !== undefined && Number.isFinite(threshold) ? Math.trunc(threshold) : undefined,
  };
}

export function buildWorkbenchSearch(state: WorkbenchSearchState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.profileId) params.set("profileId", state.profileId);
  if (state.jobId) params.set("jobId", state.jobId);
  if (state.generatorModelId) params.set("generatorModelId", state.generatorModelId);
  if (state.judgeModelId) params.set("judgeModelId", state.judgeModelId);
  if (state.autoRefine === false) params.set("autoRefine", "0");
  if (state.threshold !== undefined && state.threshold !== 85) {
    params.set("threshold", String(state.threshold));
  }
  return params;
}

/** Build workbench URL with optional pre-selected state. */
export function workbenchHref(input?: WorkbenchSearchState) {
  if (!input) return "/";
  const query = buildWorkbenchSearch(input).toString();
  return query ? `/?${query}` : "/";
}

export function workbenchSearchEquals(a: URLSearchParams, b: URLSearchParams) {
  return a.toString() === b.toString();
}
