"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import type { JobSummary } from "@/lib/entities";
import { formatAddedAt, matchesDateRange } from "@/lib/format-date";
import { formatHealthHint } from "@/lib/i18n";
import { workbenchHref } from "@/lib/workbench-link";

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
  const [titleQuery, setTitleQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [addedFrom, setAddedFrom] = useState("");
  const [addedTo, setAddedTo] = useState("");
  const [postedFrom, setPostedFrom] = useState("");
  const [postedTo, setPostedTo] = useState("");

  const companyOptions = useMemo(() => {
    const names = new Set(jobs.map(jobCompanyKey));
    return [...names].sort((a, b) => {
      if (a === UNNAMED_COMPANY) return 1;
      if (b === UNNAMED_COMPANY) return -1;
      return a.localeCompare(b, locale);
    });
  }, [jobs, locale]);

  const filteredJobs = useMemo(() => {
    const query = titleQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      if (companyFilter && jobCompanyKey(job) !== companyFilter) return false;
      if (query && !job.title.toLowerCase().includes(query)) return false;
      if (!matchesDateRange(job.createdAt, addedFrom, addedTo)) return false;
      if (!matchesDateRange(job.postedAt, postedFrom, postedTo)) return false;
      return true;
    });
  }, [jobs, titleQuery, companyFilter, addedFrom, addedTo, postedFrom, postedTo]);

  async function reload() {
    const [health, list] = await Promise.all([
      fetch("/api/health").then((response) => response.json()),
      fetch("/api/jobs").then((response) => response.json()),
    ]);
    setOk(Boolean(health.ok));
    setHint(formatHealthHint(t, health));
    setJobs(list.jobs ?? []);
    if (list.error) setError(list.error);
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
            disabled={cleaning || jobs.length === 0}
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
        <div className="panel mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
            <span>{t("jobsFilterAddedFrom")}</span>
            <input
              type="date"
              value={addedFrom}
              onChange={(event) => setAddedFrom(event.target.value)}
            />
          </label>
          <label className="field-label">
            <span>{t("jobsFilterAddedTo")}</span>
            <input
              type="date"
              value={addedTo}
              onChange={(event) => setAddedTo(event.target.value)}
            />
          </label>
          <label className="field-label">
            <span>{t("jobsFilterPostedFrom")}</span>
            <input
              type="date"
              value={postedFrom}
              onChange={(event) => setPostedFrom(event.target.value)}
            />
          </label>
          <label className="field-label">
            <span>{t("jobsFilterPostedTo")}</span>
            <input
              type="date"
              value={postedTo}
              onChange={(event) => setPostedTo(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      {jobs.length === 0 ? (
        <div className="panel text-sm muted">{t("jobsEmpty")}</div>
      ) : filteredJobs.length === 0 ? (
        <div className="panel text-sm muted">{t("jobsFilterNoMatch")}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredJobs.map((job) => (
            <article key={job.id} className="panel flex flex-col gap-3">
              <div>
                <p className="text-[11px] font-black tracking-widest kicker-gold">
                  {job.sourceKind === "url" ? "FROM URL" : "PASTED"}
                </p>
                <h2 className="text-lg font-black">{job.title}</h2>
                <p className="text-sm muted">{job.company || t("workbenchUnnamedCompany")}</p>
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
                <Link href={workbenchHref({ jobId: job.id })} className="btn btn-violet">
                  {t("workbenchGoWithJob")}
                </Link>
                <Link href={`/jobs/${job.id}`} className="btn btn-gold">
                  {t("edit")}
                </Link>
                <button type="button" className="btn" onClick={() => void remove(job.id)}>
                  {t("delete")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
