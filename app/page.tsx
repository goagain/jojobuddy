"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ResultPane } from "@/components/ResultPane";
import { SRankOverlay } from "@/components/SRankOverlay";
import { useI18n } from "@/components/LocaleProvider";
import type { JobSummary, ProfileSummary } from "@/lib/entities";
import { formatHealthHint } from "@/lib/i18n";
import type { PublicModel } from "@/lib/llm-types";
import type { CraftResult } from "@/lib/types";
import { readResponseJson } from "@/lib/http-json";
import { type CraftScore } from "@/lib/craft-score";
import { waitForWorkJob } from "@/lib/wait-work";
import {
  buildWorkbenchSearch,
  parseWorkbenchSearch,
  workbenchHref,
  workbenchSearchEquals,
  type WorkbenchSearchState,
} from "@/lib/workbench-search";

const PROFILE_KEY = "jojobuddy.profile-id";
const JOB_KEY = "jojobuddy.job-id";
const GENERATOR_KEY = "jojobuddy.generator-model";
const JUDGE_KEY = "jojobuddy.judge-model";

type CraftSession = {
  workJobId: string;
  progress: string;
};

function craftPairKey(profileId: string, jobId: string) {
  return `${profileId}:${jobId}`;
}

function ModelSelect({
  label,
  stand,
  value,
  models,
  onChange,
  emptyLabel,
  globalLabel,
  personalLabel,
}: {
  label: string;
  stand: string;
  value: string;
  models: PublicModel[];
  onChange: (id: string) => void;
  emptyLabel: string;
  globalLabel: string;
  personalLabel: string;
}) {
  const groups = new Map<string, PublicModel[]>();
  for (const model of models) {
    const scopeTag = model.scope === "global" ? globalLabel : personalLabel;
    const key = `${scopeTag} · ${model.providerName}`;
    const list = groups.get(key) ?? [];
    list.push(model);
    groups.set(key, list);
  }

  return (
    <label className="field-label flex-1">
      <span>
        <span className="display tracking-[0.2em] kicker-gold">{stand}</span>
        <span className="ml-2">{label}</span>
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {models.length === 0 ? <option value="">{emptyLabel}</option> : null}
        {[...groups.entries()].map(([groupName, items]) => (
          <optgroup key={groupName} label={groupName}>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen px-4 py-5 md:px-8">
          <div className="panel text-sm muted">Loading…</div>
        </div>
      }
    >
      <WorkbenchPage />
    </Suspense>
  );
}

function WorkbenchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [profileId, setProfileId] = useState("");
  const [jobId, setJobId] = useState("");
  const [generatorModelId, setGeneratorModelId] = useState("");
  const [judgeModelId, setJudgeModelId] = useState("");
  const [autoRefine, setAutoRefine] = useState(true);
  const [threshold, setThreshold] = useState(85);
  const [craftSessions, setCraftSessions] = useState<Record<string, CraftSession>>({});
  const [craftScoresByJobId, setCraftScoresByJobId] = useState<Record<string, CraftScore>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CraftResult | null>(null);
  const [sRank, setSRank] = useState(false);
  const [hint, setHint] = useState(() => t("connecting"));
  const [ok, setOk] = useState(false);
  const pairRef = useRef({ profileId: "", jobId: "" });
  const pollingRef = useRef(new Set<string>());
  const readyRef = useRef(false);
  const loadedRef = useRef(false);
  pairRef.current = { profileId, jobId };

  const currentPairKey = profileId && jobId ? craftPairKey(profileId, jobId) : "";
  const currentSession = currentPairKey ? craftSessions[currentPairKey] : undefined;
  const busy = Boolean(currentSession);
  const progress = currentSession?.progress ?? "";

  const persistWorkbenchPrefs = useCallback((state: WorkbenchSearchState) => {
    if (state.profileId) window.localStorage.setItem(PROFILE_KEY, state.profileId);
    if (state.jobId) window.localStorage.setItem(JOB_KEY, state.jobId);
    if (state.generatorModelId) window.localStorage.setItem(GENERATOR_KEY, state.generatorModelId);
    if (state.judgeModelId) window.localStorage.setItem(JUDGE_KEY, state.judgeModelId);
  }, []);

  const syncWorkbenchUrl = useCallback(
    (patch: Partial<WorkbenchSearchState>) => {
      const nextState: WorkbenchSearchState = {
        profileId: patch.profileId ?? profileId,
        jobId: patch.jobId ?? jobId,
        generatorModelId: patch.generatorModelId ?? generatorModelId,
        judgeModelId: patch.judgeModelId ?? judgeModelId,
        autoRefine: patch.autoRefine ?? autoRefine,
        threshold: patch.threshold ?? threshold,
      };
      const nextParams = buildWorkbenchSearch(nextState);
      const currentParams = new URLSearchParams(searchParams.toString());
      if (!workbenchSearchEquals(nextParams, currentParams)) {
        router.replace(workbenchHref(nextState), { scroll: false });
      }
      persistWorkbenchPrefs(nextState);
    },
    [
      autoRefine,
      generatorModelId,
      jobId,
      judgeModelId,
      persistWorkbenchPrefs,
      profileId,
      router,
      searchParams,
      threshold,
    ],
  );

  const loadCraftResult = useCallback(async (nextProfileId: string, nextJobId: string) => {
    const response = await fetch(
      `/api/crafts?profileId=${encodeURIComponent(nextProfileId)}&jobId=${encodeURIComponent(nextJobId)}`,
    );
    const payload = await response.json();
    return (payload.craft?.result ?? null) as CraftResult | null;
  }, []);

  const loadCraftScores = useCallback(async (forProfileId: string) => {
    if (!forProfileId) {
      setCraftScoresByJobId({});
      return;
    }
    const response = await fetch(
      `/api/crafts/summary?profileId=${encodeURIComponent(forProfileId)}`,
    );
    const payload = await response.json();
    const next: Record<string, CraftScore> = {};
    for (const craft of payload.crafts ?? []) {
      if (!craft?.jobId || !craft?.rank || craft.overall === undefined) continue;
      next[craft.jobId] = { rank: craft.rank, overall: craft.overall };
    }
    setCraftScoresByJobId(next);
  }, []);

  const updateCraftProgress = useCallback((key: string, nextProgress: string) => {
    setCraftSessions((prev) => {
      const current = prev[key];
      if (!current) return prev;
      return { ...prev, [key]: { ...current, progress: nextProgress } };
    });
  }, []);

  const clearCraftSession = useCallback((key: string) => {
    setCraftSessions((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const trackCraftWork = useCallback(
    async (workJobId: string, forProfile: string, forJob: string) => {
      if (pollingRef.current.has(workJobId)) return;
      pollingRef.current.add(workJobId);

      const key = craftPairKey(forProfile, forJob);
      setCraftSessions((prev) => ({
        ...prev,
        [key]: { workJobId, progress: prev[key]?.progress ?? t("queueing") },
      }));

      try {
        const crafted = await waitForWorkJob<CraftResult>(workJobId, (step, status) => {
          updateCraftProgress(key, step?.step ?? status ?? t("queueing"));
        });
        if (pairRef.current.profileId === forProfile && pairRef.current.jobId === forJob) {
          setResult(crafted);
          setSRank(crafted.judgment?.verdict === "s_rank");
        }
      } catch (caught) {
        if (pairRef.current.profileId === forProfile && pairRef.current.jobId === forJob) {
          setError(caught instanceof Error ? caught.message : t("unknownError"));
        }
      } finally {
        pollingRef.current.delete(workJobId);
        clearCraftSession(key);
        if (pairRef.current.profileId === forProfile && pairRef.current.jobId === forJob) {
          try {
            const saved = await loadCraftResult(forProfile, forJob);
            if (saved) setResult(saved);
            void loadCraftScores(forProfile);
          } catch {
            // keep last in-memory result if reload fails
          }
        }
      }
    },
    [clearCraftSession, loadCraftResult, loadCraftScores, t, updateCraftProgress],
  );

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const fromUrl = parseWorkbenchSearch(searchParams);
    const savedProfile = window.localStorage.getItem(PROFILE_KEY) ?? "";
    const savedJob = window.localStorage.getItem(JOB_KEY) ?? "";
    const savedGenerator = window.localStorage.getItem(GENERATOR_KEY) ?? "";
    const savedJudge = window.localStorage.getItem(JUDGE_KEY) ?? "";

    Promise.all([
      fetch("/api/health").then((response) => response.json()),
      fetch("/api/profiles").then((response) => response.json()),
      fetch("/api/jobs").then((response) => response.json()),
    ])
      .then(([health, profilePayload, jobPayload]) => {
        const listed = (health.models ?? []) as PublicModel[];
        const nextProfiles = (profilePayload.profiles ?? []) as ProfileSummary[];
        const nextJobs = (jobPayload.jobs ?? []) as JobSummary[];
        setOk(Boolean(health.ok));
        setHint(formatHealthHint(t, health));
        setModels(listed);
        setProfiles(nextProfiles);
        setJobs(nextJobs);
        const profileIds = new Set(nextProfiles.map((item) => item.id));
        const jobIds = new Set(nextJobs.map((item) => item.id));
        const modelIds = new Set(listed.map((item) => item.id));
        const nextProfileId =
          (fromUrl.profileId && profileIds.has(fromUrl.profileId) ? fromUrl.profileId : null) ??
          (profileIds.has(savedProfile) ? savedProfile : null) ??
          nextProfiles[0]?.id ??
          "";
        const nextJobId =
          (fromUrl.jobId && jobIds.has(fromUrl.jobId) ? fromUrl.jobId : null) ??
          (jobIds.has(savedJob) ? savedJob : null) ??
          nextJobs[0]?.id ??
          "";
        const nextGeneratorModelId =
          (fromUrl.generatorModelId && modelIds.has(fromUrl.generatorModelId)
            ? fromUrl.generatorModelId
            : null) ??
          (modelIds.has(savedGenerator) ? savedGenerator : null) ??
          listed[0]?.id ??
          "";
        const nextJudgeModelId =
          (fromUrl.judgeModelId && modelIds.has(fromUrl.judgeModelId) ? fromUrl.judgeModelId : null) ??
          (modelIds.has(savedJudge) ? savedJudge : null) ??
          listed[0]?.id ??
          "";
        const nextAutoRefine = fromUrl.autoRefine ?? true;
        const nextThreshold =
          fromUrl.threshold !== undefined &&
          fromUrl.threshold >= 60 &&
          fromUrl.threshold <= 99
            ? fromUrl.threshold
            : 85;

        setProfileId(nextProfileId);
        setJobId(nextJobId);
        setGeneratorModelId(nextGeneratorModelId);
        setJudgeModelId(nextJudgeModelId);
        setAutoRefine(nextAutoRefine);
        setThreshold(nextThreshold);

        const resolvedState: WorkbenchSearchState = {
          profileId: nextProfileId || undefined,
          jobId: nextJobId || undefined,
          generatorModelId: nextGeneratorModelId || undefined,
          judgeModelId: nextJudgeModelId || undefined,
          autoRefine: nextAutoRefine,
          threshold: nextThreshold,
        };
        persistWorkbenchPrefs(resolvedState);
        const resolvedParams = buildWorkbenchSearch(resolvedState);
        if (!workbenchSearchEquals(resolvedParams, searchParams)) {
          router.replace(workbenchHref(resolvedState), { scroll: false });
        }
        readyRef.current = true;
      })
      .catch(() => setHint(t("readFail")));
  }, [persistWorkbenchPrefs, router, t]);

  useEffect(() => {
    if (!readyRef.current || profiles.length === 0 && jobs.length === 0 && models.length === 0) {
      return;
    }
    const parsed = parseWorkbenchSearch(searchParams);
    const profileIds = new Set(profiles.map((item) => item.id));
    const jobIds = new Set(jobs.map((item) => item.id));
    const modelIds = new Set(models.map((item) => item.id));

    if (parsed.profileId && profileIds.has(parsed.profileId) && parsed.profileId !== profileId) {
      setProfileId(parsed.profileId);
    }
    if (parsed.jobId && jobIds.has(parsed.jobId) && parsed.jobId !== jobId) {
      setJobId(parsed.jobId);
    }
    if (
      parsed.generatorModelId &&
      modelIds.has(parsed.generatorModelId) &&
      parsed.generatorModelId !== generatorModelId
    ) {
      setGeneratorModelId(parsed.generatorModelId);
    }
    if (parsed.judgeModelId && modelIds.has(parsed.judgeModelId) && parsed.judgeModelId !== judgeModelId) {
      setJudgeModelId(parsed.judgeModelId);
    }
    if (parsed.autoRefine !== undefined && parsed.autoRefine !== autoRefine) {
      setAutoRefine(parsed.autoRefine);
    }
    if (
      parsed.threshold !== undefined &&
      parsed.threshold >= 60 &&
      parsed.threshold <= 99 &&
      parsed.threshold !== threshold
    ) {
      setThreshold(parsed.threshold);
    }
  }, [
    autoRefine,
    generatorModelId,
    jobId,
    judgeModelId,
    jobs,
    models,
    profileId,
    profiles,
    searchParams,
    threshold,
  ]);

  useEffect(() => {
    fetch("/api/craft/active")
      .then((response) => response.json())
      .then((payload) => {
        for (const job of payload.jobs ?? []) {
          if (!job.id || !job.profileId || !job.jobId) continue;
          const key = craftPairKey(job.profileId, job.jobId);
          setCraftSessions((prev) => ({
            ...prev,
            [key]: {
              workJobId: job.id,
              progress: job.progress?.step ?? t("queueing"),
            },
          }));
          void trackCraftWork(job.id, job.profileId, job.jobId);
        }
      })
      .catch(() => undefined);
  }, [t, trackCraftWork]);

  useEffect(() => {
    void loadCraftScores(profileId);
  }, [loadCraftScores, profileId]);

  useEffect(() => {
    if (!profileId || !jobId) {
      setResult(null);
      return;
    }
    let cancelled = false;
    loadCraftResult(profileId, jobId)
      .then((craft) => {
        if (!cancelled) {
          setResult(craft);
          if (craft?.judgment) {
            setCraftScoresByJobId((prev) => ({
              ...prev,
              [jobId]: { rank: craft.judgment.rank, overall: craft.judgment.overall },
            }));
          }
        }
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, jobId, loadCraftResult]);

  useEffect(() => {
    setError(null);
  }, [profileId, jobId]);

  const selectedProfile = profiles.find((item) => item.id === profileId);
  const selectedJob = jobs.find((item) => item.id === jobId);

  async function craft() {
    if (!profileId || !jobId) {
      setError(t("workbenchNeedBoth"));
      return;
    }
    if (currentSession) return;

    setError(null);
    const forProfile = profileId;
    const forJob = jobId;
    syncWorkbenchUrl({});
    try {
      const response = await fetch("/api/craft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          jobId,
          generatorModelId,
          judgeModelId,
          options: { autoRefine, threshold, maxRounds: 3 },
        }),
      });
      const payload = await readResponseJson<{ error?: string; jobId?: string }>(response, "Craft API");
      if (!response.ok) throw new Error(payload.error ?? t("craftFail"));
      if (!payload.jobId) throw new Error(payload.error ?? t("enqueueFail"));

      const key = craftPairKey(forProfile, forJob);
      setCraftSessions((prev) => ({
        ...prev,
        [key]: { workJobId: payload.jobId!, progress: t("enqueueing") },
      }));
      void trackCraftWork(payload.jobId, forProfile, forJob);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("unknownError"));
    }
  }

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader status={{ ok, hint }} />
      <main className="grid gap-4 xl:grid-cols-[minmax(340px,0.9fr)_minmax(420px,1.1fr)]">
        <section className="workbench-sidebar no-print">
          <div className="workbench-sidebar-scroll">
          <article className="panel shrink-0">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="display text-[11px] tracking-[0.3em] kicker">{t("workbenchProfile")}</p>
                <h2 className="text-xl font-black">{t("workbenchPickProfile")}</h2>
              </div>
              <Link href="/profiles/new" className="text-xs font-black kicker-gold">
                {t("workbenchNew")}
              </Link>
            </div>
            {profiles.length === 0 ? (
              <p className="text-sm muted">
                {t("workbenchNoProfiles")}{" "}
                <Link href="/profiles" className="font-black kicker-gold underline">
                  {t("workbenchProfilesLib")}
                </Link>{" "}
                {t("workbenchUploadOrFill")}
              </p>
            ) : (
              <div className="choice-list space-y-2">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => {
                      setProfileId(profile.id);
                      syncWorkbenchUrl({ profileId: profile.id });
                    }}
                    className={`w-full border-2 px-3 py-2 text-left ${
                      profile.id === profileId ? "choice-on" : "choice"
                    }`}
                  >
                    <span className="block text-sm font-black">{profile.name}</span>
                    <span className="block text-xs opacity-70">
                      {profile.personName || t("workbenchUnnamed")} ·{" "}
                      {t("workbenchExpCount", { count: profile.experienceCount })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </article>

          <article className="panel panel-gold flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <div>
                <p className="display text-[11px] tracking-[0.3em] kicker-gold">{t("workbenchJob")}</p>
                <h2 className="text-xl font-black">{t("workbenchPickJob")}</h2>
              </div>
              <Link href="/jobs/new" className="text-xs font-black kicker-gold">
                {t("workbenchNew")}
              </Link>
            </div>
            {jobs.length === 0 ? (
              <p className="text-sm muted">
                {t("workbenchNoJobs")}{" "}
                <Link href="/jobs" className="font-black kicker-gold underline">
                  {t("workbenchJobsLib")}
                </Link>{" "}
                {t("workbenchPasteOrUrl")}
              </p>
            ) : (
              <div className="choice-list-fluid min-h-0 flex-1 space-y-2">
                {jobs.map((job) => {
                  const craftScore = craftScoresByJobId[job.id];
                  const activeSession = craftSessions[craftPairKey(profileId, job.id)];
                  return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => {
                      setJobId(job.id);
                      syncWorkbenchUrl({ jobId: job.id });
                    }}
                    className={`w-full border-2 px-3 py-2 text-left ${
                      job.id === jobId ? "choice-on" : "choice"
                    }`}
                  >
                    <span className="block text-sm font-black">{job.title}</span>
                    <span className="block text-xs opacity-70">
                      {job.company || t("workbenchUnnamedCompany")} ·{" "}
                      {job.sourceKind === "url" ? "URL" : t("workbenchSourcePaste")}
                      {activeSession
                        ? ` · ${activeSession.progress || t("workbenchCrafting")}`
                        : craftScore
                          ? ` · ${t("workbenchCraftScore", {
                              rank: craftScore.rank,
                              overall: String(craftScore.overall),
                            })}`
                          : ""}
                    </span>
                  </button>
                  );
                })}
                {selectedJob ? (
                  <p className="text-sm leading-6 muted">{selectedJob.excerpt}</p>
                ) : null}
              </div>
            )}
          </article>
          </div>

          <article className="workbench-controls panel space-y-3">
            <div className="flex gap-3">
              <ModelSelect
                stand="STAR PLATINUM"
                label={t("workbenchGenerator")}
                value={generatorModelId}
                models={models}
                onChange={(id) => {
                  setGeneratorModelId(id);
                  syncWorkbenchUrl({ generatorModelId: id });
                }}
                emptyLabel={t("workbenchNeedModels")}
                globalLabel={t("scopeGlobal")}
                personalLabel={t("scopePersonal")}
              />
              <ModelSelect
                stand="HEAVEN'S DOOR"
                label={t("workbenchJudge")}
                value={judgeModelId}
                models={models}
                onChange={(id) => {
                  setJudgeModelId(id);
                  syncWorkbenchUrl({ judgeModelId: id });
                }}
                emptyLabel={t("workbenchNeedModels")}
                globalLabel={t("scopeGlobal")}
                personalLabel={t("scopePersonal")}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={autoRefine}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setAutoRefine(next);
                    syncWorkbenchUrl({ autoRefine: next });
                  }}
                />
                {t("workbenchAutoRefine")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                {t("workbenchThreshold")}
                <input
                  type="number"
                  min={60}
                  max={99}
                  value={threshold}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setThreshold(next);
                    syncWorkbenchUrl({ threshold: next });
                  }}
                  className="w-16"
                />
              </label>
              <button
                type="button"
                disabled={busy || !profileId || !jobId || !generatorModelId || !judgeModelId}
                onClick={craft}
                className="btn btn-violet ml-auto -skew-x-6 px-6 py-3 text-lg shadow-[6px_6px_0_#f0c75e]"
              >
                {busy ? progress || t("workbenchCrafting") : t("workbenchCraft")}
              </button>
            </div>
            {selectedProfile && selectedJob ? (
              <p className="text-xs muted">
                {t("workbenchCraftPairPrefix")}
                <Link href={`/profiles/${selectedProfile.id}`} className="font-black kicker-gold underline">
                  {selectedProfile.name}
                </Link>
                {t("workbenchCraftPairMid")}
                {selectedJob.sourceKind === "url" && selectedJob.sourceUrl ? (
                  <a
                    href={selectedJob.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-black kicker-gold underline"
                  >
                    {selectedJob.title}
                  </a>
                ) : (
                  <Link href={`/jobs/${selectedJob.id}`} className="font-black kicker-gold underline">
                    {selectedJob.title}
                  </Link>
                )}
                {t("workbenchCraftPairSuffix")}
              </p>
            ) : null}
            {error ? <p className="text-sm font-bold text-rose-700">{error}</p> : null}
          </article>
        </section>
        <ResultPane
          result={result}
          busy={busy}
          progress={progress}
          boundContext={
            selectedProfile && selectedJob
              ? {
                  profileId: selectedProfile.id,
                  profileLabel: selectedProfile.name,
                  personName: selectedProfile.personName,
                  jobId: selectedJob.id,
                  jobTitle: selectedJob.title,
                  jobCompany: selectedJob.company,
                  jobNumber: selectedJob.jobNumber,
                  jobLabel: `${selectedJob.company ? `${selectedJob.company} / ` : ""}${selectedJob.title}`,
                  jobSourceKind: selectedJob.sourceKind,
                  jobSourceUrl: selectedJob.sourceUrl,
                }
              : undefined
          }
        />
      </main>
      <SRankOverlay open={sRank} onClose={() => setSRank(false)} />
    </div>
  );
}
