"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import type { JobSummary } from "@/lib/entities";
import { formatAddedAt, matchesRecentWindow, type RecentWindow } from "@/lib/format-date";
import { formatHealthHint } from "@/lib/i18n";
import {
  jobLocationKeys,
  jobMatchesCityFilter,
  parseJobCities,
  UNNAMED_LOCATION,
} from "@/lib/job-location";
import { workbenchHref } from "@/lib/workbench-link";
import { enqueueWork } from "@/lib/wait-work";
import type { RefreshJobsResult } from "@/lib/refresh-jobs";

const UNNAMED_COMPANY = "__unnamed__";

function jobCompanyKey(job: JobSummary) {
  return job.company.trim() || UNNAMED_COMPANY;
}

export default function JobsPage() {
  const { t, locale } = useI18n();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [hint, setHint] = useState(() => t("reading"));
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState("");
  const [titleQuery, setTitleQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [addedWindow, setAddedWindow] = useState<RecentWindow>("");
  const [postedWindow, setPostedWindow] = useState<RecentWindow>("");
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [craftByJobId, setCraftByJobId] = useState<Record<string, { profileId: string }>>({});

  const companyOptions = useMemo(() => {
    const names = new Set(jobs.map(jobCompanyKey));
    return [...names].sort((a, b) => {
      if (a === UNNAMED_COMPANY) return 1;
      if (b === UNNAMED_COMPANY) return -1;
      return a.localeCompare(b, locale);
    });
  }, [jobs, locale]);

  const locationOptions = useMemo(() => {
    const names = new Set<string>();
    for (const job of jobs) {
      for (const city of jobLocationKeys(job)) {
        names.add(city);
      }
    }
    return [...names].sort((a, b) => {
      if (a === UNNAMED_LOCATION) return 1;
      if (b === UNNAMED_LOCATION) return -1;
      return a.localeCompare(b, locale);
    });
  }, [jobs, locale]);

  function toggleLocation(key: string) {
    setLocationFilter((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  }

  const urlJobCount = useMemo(
    () => jobs.filter((job) => job.sourceKind === "url" && job.sourceUrl).length,
    [jobs],
  );

  const filteredJobs = useMemo(() => {
    const query = titleQuery.trim().toLowerCase();
    const locationSet = new Set(locationFilter);
    return jobs.filter((job) => {
      if (companyFilter && jobCompanyKey(job) !== companyFilter) return false;
      if (!jobMatchesCityFilter(job, locationSet)) return false;
      if (query && !job.title.toLowerCase().includes(query)) return false;
      if (!matchesRecentWindow(job.createdAt, addedWindow)) return false;
      if (!matchesRecentWindow(job.postedAt, postedWindow)) return false;
      return true;
    });
  }, [jobs, titleQuery, companyFilter, locationFilter, addedWindow, postedWindow]);

  async function reload() {
    const [health, list, craftSummary] = await Promise.all([
      fetch("/api/health").then((response) => response.json()),
      fetch("/api/jobs").then((response) => response.json()),
      fetch("/api/crafts/summary").then((response) => response.json()),
    ]);
    setOk(Boolean(health.ok));
    setHint(formatHealthHint(t, health));
    setJobs(list.jobs ?? []);
    if (list.error) setError(list.error);
    const nextCraftByJobId: Record<string, { profileId: string }> = {};
    for (const craft of craftSummary.crafts ?? []) {
      if (!craft?.jobId || !craft?.profileId) continue;
      nextCraftByJobId[craft.jobId] = { profileId: craft.profileId };
    }
    setCraftByJobId(nextCraftByJobId);
  }

  useEffect(() => {
    reload().catch(() => setError(t("readJobsFail")));
  }, [t]);

  async function remove(id: string) {
    if (!window.confirm(t("deleteJobConfirm"))) return;
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    await reload();
  }

  async function cleanupStale() {
    if (!window.confirm(t("cleanupStaleJobsConfirm"))) return;
    setCleaning(true);
    setError(null);
    try {
      const response = await fetch("/api/jobs/cleanup", { method: "POST" });
      const data = (await response.json()) as { deleted?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? t("readJobsFail"));
      window.alert(
        data.deleted && data.deleted > 0
          ? t("cleanupStaleJobsDone", { count: String(data.deleted) })
          : t("cleanupStaleJobsNone"),
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("readJobsFail"));
    } finally {
      setCleaning(false);
    }
  }

  async function refreshUrlJobs() {
    if (urlJobCount === 0) {
      window.alert(t("refreshJobsNone"));
      return;
    }
    if (!window.confirm(t("refreshJobsConfirm"))) return;
    setRefreshing(true);
    setRefreshProgress("");
    setError(null);
    try {
      const result = await enqueueWork<RefreshJobsResult>({
        type: "refresh_jobs",
        payload: {},
        onProgress: (step, status) => {
          setRefreshProgress(step?.step ?? status ?? t("queueing"));
        },
      });
      window.alert(
        t("refreshJobsDone", {
          updated: String(result.updated),
          deleted: String(result.deleted),
          skipped: String(result.skipped),
        }),
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("readJobsFail"));
    } finally {
      setRefreshing(false);
      setRefreshProgress("");
    }
  }

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader status={{ ok, hint }} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-[11px] tracking-[0.3em] kicker-gold">JOBS</p>
          <h1 className="text-3xl font-black">{t("jobsTitle")}</h1>
          <p className="mt-1 text-sm muted">{t("jobsDesc")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className="btn">
            {t("workbenchGo")}
          </Link>
          <button
            type="button"
            className="btn"
            disabled={refreshing || cleaning || urlJobCount === 0}
            onClick={() => void refreshUrlJobs()}
          >
            {refreshing ? refreshProgress || t("refreshingJobs") : t("refreshJobs")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={cleaning || refreshing || jobs.length === 0}
            onClick={() => void cleanupStale()}
          >
            {cleaning ? t("cleaningUp") : t("cleanupStaleJobs")}
          </button>
          <Link href="/jobs/new" className="btn btn-gold">
            {t("newJob")}
          </Link>
        </div>
      </div>
      {error ? <p className="mb-3 text-sm font-bold text-rose-700">{error}</p> : null}
      {jobs.length > 0 ? (
        <div className="panel mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="field-label">
            <span>{t("jobsFilterTitle")}</span>
            <input
              type="search"
              value={titleQuery}
              onChange={(event) => setTitleQuery(event.target.value)}
              placeholder={t("jobsFilterTitlePlaceholder")}
            />
          </label>
          <label className="field-label">
            <span>{t("jobsFilterCompany")}</span>
            <select
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
            >
              <option value="">{t("jobsFilterAllCompanies")}</option>
              {companyOptions.map((company) => (
                <option key={company} value={company}>
                  {company === UNNAMED_COMPANY ? t("workbenchUnnamedCompany") : company}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>{t("jobsFilterAddedWhen")}</span>
            <select
              value={addedWindow}
              onChange={(event) => setAddedWindow(event.target.value as RecentWindow)}
            >
              <option value="">{t("jobsFilterAnyTime")}</option>
              <option value="7">{t("jobsFilterLast7Days")}</option>
              <option value="30">{t("jobsFilterLast30Days")}</option>
              <option value="90">{t("jobsFilterLast90Days")}</option>
              <option value="older90">{t("jobsFilterOlder90Days")}</option>
            </select>
          </label>
          <label className="field-label">
            <span>{t("jobsFilterPostedWhen")}</span>
            <select
              value={postedWindow}
              onChange={(event) => setPostedWindow(event.target.value as RecentWindow)}
            >
              <option value="">{t("jobsFilterAnyTime")}</option>
              <option value="7">{t("jobsFilterLast7Days")}</option>
              <option value="30">{t("jobsFilterLast30Days")}</option>
              <option value="90">{t("jobsFilterLast90Days")}</option>
              <option value="older90">{t("jobsFilterOlder90Days")}</option>
              <option value="unknown">{t("jobsFilterPostedUnknown")}</option>
            </select>
          </label>
          {locationOptions.length > 0 ? (
            <div className="field-label md:col-span-2 xl:col-span-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{t("jobsFilterLocation")}</span>
                {locationFilter.length > 0 ? (
                  <button
                    type="button"
                    className="text-xs font-bold kicker-gold underline"
                    onClick={() => setLocationFilter([])}
                  >
                    {t("jobsFilterClearLocations")}
                  </button>
                ) : null}
              </div>
              <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                {locationOptions.map((location) => {
                  const selected = locationFilter.includes(location);
                  return (
                    <label
                      key={location}
                      className={`flex cursor-pointer items-center gap-2 border-2 px-2 py-1.5 text-xs font-bold ${
                        selected ? "choice-on" : "choice"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleLocation(location)}
                      />
                      {location === UNNAMED_LOCATION ? t("jobsFilterLocationUnknown") : location}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {jobs.length === 0 ? (
        <div className="panel text-sm muted">{t("jobsEmpty")}</div>
      ) : filteredJobs.length === 0 ? (
        <div className="panel text-sm muted">{t("jobsFilterNoMatch")}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredJobs.map((job) => {
            const craft = craftByJobId[job.id];
            return (
            <article key={job.id} className="panel flex flex-col gap-3">
              <div>
                <p className="text-[11px] font-black tracking-widest kicker-gold">
                  {job.sourceKind === "url" ? "FROM URL" : "PASTED"}
                </p>
                <h2 className="text-lg font-black">{job.title}</h2>
                <p className="text-sm muted">{job.company || t("workbenchUnnamedCompany")}</p>
                {job.location ? (
                  <p className="text-sm muted">
                    {t("location")}: {parseJobCities(job.location).join(" / ")}
                  </p>
                ) : null}
                <p className="mt-1 text-xs muted">
                  {t("addedAt", { date: formatAddedAt(job.createdAt, locale) })}
                </p>
                <p className="text-xs muted">
                  {job.postedAt
                    ? t("postedAt", { date: formatAddedAt(job.postedAt, locale) })
                    : t("postedAtUnknown")}
                </p>
              </div>
              <p className="text-sm leading-6 muted">{job.excerpt}</p>
              {job.sourceUrl ? (
                <p className="truncate text-[11px] muted">{job.sourceUrl}</p>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2">
                <Link
                  href={workbenchHref(
                    craft ? { profileId: craft.profileId, jobId: job.id } : { jobId: job.id },
                  )}
                  className="btn btn-violet"
                >
                  {craft ? t("workbenchViewCraft") : t("workbenchGoWithJob")}
                </Link>
                <Link href={`/jobs/${job.id}`} className="btn btn-gold">
                  {t("edit")}
                </Link>
                <button type="button" className="btn" onClick={() => void remove(job.id)}>
                  {t("delete")}
                </button>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
