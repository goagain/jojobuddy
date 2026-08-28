"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ResultPane } from "@/components/ResultPane";
import { SRankOverlay } from "@/components/SRankOverlay";
import { useI18n } from "@/components/LocaleProvider";
import type { JobSummary, ProfileSummary } from "@/lib/entities";
import { formatHealthHint } from "@/lib/i18n";
import type { PublicModel } from "@/lib/llm-types";
import type { CraftResult } from "@/lib/types";
import { readResponseJson } from "@/lib/http-json";
import { waitForWorkJob } from "@/lib/wait-work";

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
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CraftResult | null>(null);
  const [sRank, setSRank] = useState(false);
  const [hint, setHint] = useState(() => t("connecting"));
  const [ok, setOk] = useState(false);
  const pairRef = useRef({ profileId: "", jobId: "" });
  const pollingRef = useRef(new Set<string>());
  pairRef.current = { profileId, jobId };

  const currentPairKey = profileId && jobId ? craftPairKey(profileId, jobId) : "";
  const currentSession = currentPairKey ? craftSessions[currentPairKey] : undefined;
  const busy = Boolean(currentSession);
  const progress = currentSession?.progress ?? "";

  const loadCraftResult = useCallback(async (nextProfileId: string, nextJobId: string) => {
    const response = await fetch(
      `/api/crafts?profileId=${encodeURIComponent(nextProfileId)}&jobId=${encodeURIComponent(nextJobId)}`,
    );
    const payload = await response.json();
    return (payload.craft?.result ?? null) as CraftResult | null;
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
          } catch {
            // keep last in-memory result if reload fails
          }
        }
      }
    },
    [clearCraftSession, loadCraftResult, t, updateCraftProgress],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryProfile = params.get("profileId") ?? "";
    const queryJob = params.get("jobId") ?? "";
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
          (queryProfile && profileIds.has(queryProfile) ? queryProfile : null) ??
          (profileIds.has(savedProfile) ? savedProfile : null) ??
          nextProfiles[0]?.id ??
          "";
        const nextJobId =
          (queryJob && jobIds.has(queryJob) ? queryJob : null) ??
          (jobIds.has(savedJob) ? savedJob : null) ??
          nextJobs[0]?.id ??
          "";
        setProfileId(nextProfileId);
        setJobId(nextJobId);
        if (nextProfileId) window.localStorage.setItem(PROFILE_KEY, nextProfileId);
        if (nextJobId) window.localStorage.setItem(JOB_KEY, nextJobId);
        setGeneratorModelId(modelIds.has(savedGenerator) ? savedGenerator : (listed[0]?.id ?? ""));
        setJudgeModelId(modelIds.has(savedJudge) ? savedJudge : (listed[0]?.id ?? ""));
      })
      .catch(() => setHint(t("readFail")));
  }, [t]);

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
    if (!profileId || !jobId) {
      setResult(null);
      return;
    }
    let cancelled = false;
    loadCraftResult(profileId, jobId)
      .then((craft) => {
        if (!cancelled) setResult(craft);
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
    window.localStorage.setItem(PROFILE_KEY, profileId);
    window.localStorage.setItem(JOB_KEY, jobId);
    window.localStorage.setItem(GENERATOR_KEY, generatorModelId);
    window.localStorage.setItem(JUDGE_KEY, judgeModelId);
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
        <section className="no-print space-y-4">
          <article className="panel">
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
              <div className="space-y-2">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setProfileId(profile.id)}
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

          <article className="panel panel-gold">
            <div className="mb-3 flex items-center justify-between">
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
              <div className="space-y-2">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setJobId(job.id)}
                    className={`w-full border-2 px-3 py-2 text-left ${
                      job.id === jobId ? "choice-on" : "choice"
                    }`}
                  >
                    <span className="block text-sm font-black">{job.title}</span>
                    <span className="block text-xs opacity-70">
                      {job.company || t("workbenchUnnamedCompany")} ·{" "}
                      {job.sourceKind === "url" ? "URL" : t("workbenchSourcePaste")}
                      {craftSessions[craftPairKey(profileId, job.id)]
                        ? ` · ${craftSessions[craftPairKey(profileId, job.id)].progress || t("workbenchCrafting")}`
                        : job.id === jobId && result
                          ? ` · ${t("workbenchBoundResume")}`
                          : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedJob ? (
              <p className="mt-3 text-sm leading-6 muted">{selectedJob.excerpt}</p>
            ) : null}
          </article>

          <article className="panel space-y-3">
            <div className="flex gap-3">
              <ModelSelect
                stand="STAR PLATINUM"
                label={t("workbenchGenerator")}
                value={generatorModelId}
                models={models}
                onChange={setGeneratorModelId}
                emptyLabel={t("workbenchNeedModels")}
                globalLabel={t("scopeGlobal")}
                personalLabel={t("scopePersonal")}
              />
              <ModelSelect
                stand="HEAVEN'S DOOR"
                label={t("workbenchJudge")}
                value={judgeModelId}
                models={models}
                onChange={setJudgeModelId}
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
                  onChange={(event) => setAutoRefine(event.target.checked)}
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
                  onChange={(event) => setThreshold(Number(event.target.value))}
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
                  jobId: selectedJob.id,
                  jobLabel: `${selectedJob.company ? `${selectedJob.company} / ` : ""}${selectedJob.title}`,
                  jobSourceKind: selectedJob.sourceKind,
                  jobSourceUrl: selectedJob.sourceUrl,
                }
              : undefined
          }
          downloadName={
            selectedJob
              ? `${selectedProfile?.personName || selectedProfile?.name || "resume"} ${selectedJob.company} ${selectedJob.title}`
              : undefined
          }
        />
      </main>
      <SRankOverlay open={sRank} onClose={() => setSRank(false)} />
    </div>
  );
}
