"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import type { JobSummary } from "@/lib/entities";
import { formatHealthHint } from "@/lib/i18n";

export default function JobsPage() {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [hint, setHint] = useState(() => t("reading"));
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader status={{ ok, hint }} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-[11px] tracking-[0.3em] kicker-gold">JOBS</p>
          <h1 className="text-3xl font-black">{t("jobsTitle")}</h1>
          <p className="mt-1 text-sm muted">{t("jobsDesc")}</p>
        </div>
        <Link href="/jobs/new" className="btn btn-gold">
          {t("newJob")}
        </Link>
      </div>
      {error ? <p className="mb-3 text-sm font-bold text-rose-700">{error}</p> : null}
      {jobs.length === 0 ? (
        <div className="panel text-sm muted">{t("jobsEmpty")}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {jobs.map((job) => (
            <article key={job.id} className="panel flex flex-col gap-3">
              <div>
                <p className="text-[11px] font-black tracking-widest kicker-gold">
                  {job.sourceKind === "url" ? "FROM URL" : "PASTED"}
                </p>
                <h2 className="text-lg font-black">{job.title}</h2>
                <p className="text-sm muted">{job.company || t("workbenchUnnamedCompany")}</p>
              </div>
              <p className="text-sm leading-6 muted">{job.excerpt}</p>
              {job.sourceUrl ? (
                <p className="truncate text-[11px] muted">{job.sourceUrl}</p>
              ) : null}
              <div className="mt-auto flex gap-2">
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
