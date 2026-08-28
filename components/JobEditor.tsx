"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import type { Job } from "@/lib/entities";
import { resolveJobFields } from "@/lib/job-fields";
import { formatHealthHint } from "@/lib/i18n";
import { enqueueWork } from "@/lib/wait-work";
import { workbenchHref } from "@/lib/workbench-link";

const EMPTY: Omit<Job, "id" | "createdAt" | "updatedAt"> = {
  title: "",
  company: "",
  location: "",
  jobNumber: "",
  sourceKind: "paste",
  sourceUrl: "",
  sourceText: "",
  parsedText: "",
  requirements: [],
  keywords: [],
  postedAt: undefined,
};

export function JobEditor({ jobId }: { jobId?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState(EMPTY);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [hint, setHint] = useState("");

  const jdText = form.parsedText || form.sourceText;
  const showInsights = jdText.trim().length >= 40;
  const requirements = form.requirements ?? [];
  const keywords = form.keywords ?? [];

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((payload) => {
        setOk(Boolean(payload.ok));
        setHint(formatHealthHint(t, payload));
      })
      .catch(() => setHint(t("healthFail")));

    if (!jobId) return;
    fetch(`/api/jobs/${jobId}`)
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.job) {
          setError(payload.error ?? t("jobNotFound"));
          return;
        }
        const job = payload.job as Job;
        setForm({
          title: job.title,
          company: job.company,
          location: job.location ?? "",
          jobNumber: job.jobNumber ?? "",
          sourceKind: job.sourceKind,
          sourceUrl: job.sourceUrl ?? "",
          sourceText: job.sourceText,
          parsedText: job.parsedText,
          requirements: job.requirements ?? [],
          keywords: job.keywords ?? [],
          postedAt: job.postedAt,
        });
        setUrl(job.sourceUrl ?? "");
      })
      .catch(() => setError(t("readJobsFail")));
  }, [jobId, t]);

  async function analyzeInsights() {
    const text = (form.parsedText || form.sourceText).trim();
    if (text.length < 40) return;
    setBusy("analyze");
    setProgress(t("jobAnalyzingAi"));
    setError(null);
    try {
      const insights = await enqueueWork<{
        title: string;
        company: string;
        jobNumber: string;
        postedAt: string;
        requirements: string[];
        keywords: string[];
        locations: string[];
      }>({
        type: "analyze_job",
        payload: { text, sourceUrl: form.sourceUrl || undefined },
        onProgress: (step, status) => {
          setProgress(step?.step ?? status ?? t("queueing"));
        },
      });
      setForm((prev) => {
        const fields = resolveJobFields(insights, {
          title: prev.title,
          company: prev.company,
          location: prev.location,
          jobNumber: prev.jobNumber,
          postedAt: prev.postedAt,
          sourceUrl: prev.sourceUrl,
        });
        return {
          ...prev,
          title: fields.title,
          company: fields.company,
          jobNumber: fields.jobNumber ?? prev.jobNumber,
          postedAt: fields.postedAt,
          requirements: fields.requirements,
          keywords: fields.keywords,
          location: fields.locationFormatted || prev.location,
        };
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("parseFail"));
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  async function parseUrl() {
    setBusy("parse");
    setProgress(t("enqueueing"));
    setError(null);
    try {
      const page = await enqueueWork<{
        title: string;
        company: string;
        location: string;
        jobNumber?: string;
        sourceUrl: string;
        sourceText: string;
        parsedText: string;
        requirements: string[];
        keywords: string[];
        postedAt?: string;
      }>({
        type: "parse_url",
        payload: { url },
        onProgress: (step, status) => {
          setProgress(step?.step ?? status ?? t("queueing"));
        },
      });
      setForm({
        title: page.title || form.title,
        company: page.company || form.company,
        location: page.location || form.location,
        jobNumber: page.jobNumber || form.jobNumber,
        sourceKind: "url",
        sourceUrl: page.sourceUrl,
        sourceText: page.sourceText,
        parsedText: page.parsedText,
        requirements: page.requirements ?? [],
        keywords: page.keywords ?? [],
        postedAt: page.postedAt,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("parseFail"));
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const payloadBody = {
        ...form,
        sourceKind: form.sourceUrl ? "url" : "paste",
        sourceText: form.sourceText || form.parsedText,
        parsedText: form.parsedText || form.sourceText,
        postedAt: form.postedAt ?? undefined,
        jobNumber: form.jobNumber?.trim() || undefined,
      };
      const response = await fetch(jobId ? `/api/jobs/${jobId}` : "/api/jobs", {
        method: jobId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("saveFail"));
      router.push("/jobs");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFail"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader status={{ ok, hint }} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-[11px] tracking-[0.3em] kicker-gold">JOB DESCRIPTION</p>
          <h1 className="text-3xl font-black">{jobId ? t("editJob") : t("newJob")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {jobId ? (
            <Link href={workbenchHref({ jobId })} className="btn btn-violet">
              {t("workbenchGoWithJob")}
            </Link>
          ) : null}
          <button type="button" className="btn btn-gold" disabled={Boolean(busy)} onClick={save}>
            {busy === "save" ? t("saving") : t("saveJob")}
          </button>
        </div>
      </div>
      {error ? <p className="mb-3 text-sm font-bold text-rose-700">{error}</p> : null}

      <section className="panel panel-gold mb-4 space-y-3">
        <h2 className="text-xl font-black">{t("fetchFromUrl")}</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-[280px] flex-1"
            placeholder="https://..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button type="button" className="btn" disabled={Boolean(busy) || !url} onClick={parseUrl}>
            {busy === "parse" ? progress || t("fetching") : t("parseUrl")}
          </button>
        </div>
        <p className="text-xs muted">{t("parseUrlHint")}</p>
      </section>

      <section className="panel mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="field-label">
          {t("jobTitle")}
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
        </label>
        <label className="field-label">
          {t("jobCompany")}
          <input
            value={form.company}
            onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
          />
        </label>
        <label className="field-label">
          {t("jobNumber")}
          <input
            value={form.jobNumber ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, jobNumber: event.target.value }))}
            placeholder="200678539-3337"
          />
        </label>
        <label className="field-label">
          {t("location")}
          <input
            value={form.location ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
          />
        </label>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <label className="panel field-label">
          {t("sourceRaw")}
          <textarea
            rows={18}
            value={form.sourceText}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                sourceText: event.target.value,
                parsedText: prev.parsedText || event.target.value,
                sourceKind: prev.sourceUrl ? "url" : "paste",
              }))
            }
          />
        </label>
        <label className="panel panel-gold field-label">
          {t("jdBody")}
          <textarea
            rows={18}
            value={form.parsedText}
            onChange={(event) => setForm((prev) => ({ ...prev, parsedText: event.target.value }))}
          />
        </label>
      </section>

      {showInsights ? (
        <section className="panel panel-gold mb-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black">{t("jobInsights")}</h2>
            <button
              type="button"
              className="btn"
              disabled={Boolean(busy)}
              onClick={analyzeInsights}
            >
              {busy === "analyze" ? progress || t("jobAnalyzingAi") : t("jobAnalyzeAi")}
            </button>
          </div>
          <p className="text-xs muted">{t("jobInsightsAiHint")}</p>
          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest">{t("jobRequirements")}</p>
              {requirements.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-sm leading-6">
                  {requirements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm muted">—</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest">{t("jobKeywords")}</p>
              {keywords.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {keywords.map((word) => (
                    <span
                      key={word}
                      className="border-2 border-black bg-white px-2 py-0.5 text-[11px] font-bold"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm muted">—</p>
              )}
            </div>
          </div>
        </section>
      ) : (
        <p className="mb-4 text-xs muted">{t("jobInsightsEmpty")}</p>
      )}
    </div>
  );
}

