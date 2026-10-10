"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import { formatAddedAt } from "@/lib/format-date";
import { readResponseJson } from "@/lib/http-json";
import type { InterviewDigest } from "@/lib/interview-store";
import type { QuestionKind } from "@/lib/interview/aggregate";
import { formatHealthHint, type MessageKey } from "@/lib/i18n";

const STATUS_KEY: Record<InterviewDigest["status"], MessageKey> = {
  crawling: "interviewsStatusCrawling",
  ready: "interviewsStatusReady",
  failed: "interviewsStatusFailed",
};

const KIND_KEY: Record<QuestionKind, MessageKey> = {
  coding: "interviewsKindCoding",
  system_design: "interviewsKindSystem",
  behavioral: "interviewsKindBehavioral",
  other: "interviewsKindOther",
};

export function InterviewView({ digestId }: { digestId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [digest, setDigest] = useState<InterviewDigest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [ok, setOk] = useState(false);
  const [cookie, setCookie] = useState("");
  const [clearCookie, setClearCookie] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const response = await fetch(`/api/interviews/${digestId}`);
    const payload = await readResponseJson<{ digest?: InterviewDigest; error?: string }>(
      response,
      "Interviews API",
    );
    if (!response.ok || !payload.digest) throw new Error(payload.error ?? t("interviewsNotFound"));
    setDigest(payload.digest);
  }, [digestId, t]);

  useEffect(() => {
    let cancelled = false;
    reload().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : t("interviewsReadFail"));
    });
    return () => {
      cancelled = true;
    };
  }, [reload, t]);

  useEffect(() => {
    if (digest?.status !== "crawling") return;
    const timer = window.setInterval(() => {
      reload().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [digest?.status, reload]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => response.json())
      .then((health) => {
        if (cancelled) return;
        setOk(Boolean(health.ok));
        setHint(formatHealthHint(t, health));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [t, digest?.status]);

  async function recrawl(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/interviews/${digestId}/crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          event
            ? {
                cookie: cookie.trim() || undefined,
                clearCookie,
              }
            : {},
        ),
      });
      const payload = await readResponseJson<{ error?: string }>(response, "Interviews API");
      if (!response.ok) throw new Error(payload.error ?? t("interviewsReadFail"));
      setCookie("");
      setClearCookie(false);
      setDigest((current) => (current ? { ...current, status: "crawling", error: undefined } : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("interviewsReadFail"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("interviewsDeleteConfirm"))) return;
    await fetch(`/api/interviews/${digestId}`, { method: "DELETE" });
    router.push("/interviews");
  }

  const topCount = digest?.questions[0]?.count ?? 1;

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader status={hint ? { ok, hint } : undefined} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-[11px] tracking-[0.3em] kicker-gold">INTERVIEWS</p>
          <h1 className="text-3xl font-black">{digest?.company || t("interviewsTitle")}</h1>
          {digest ? (
            <p className="mt-1 text-sm muted">
              <a href={digest.forumUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {digest.forumUrl}
              </a>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-gold"
            disabled={!digest || busy || digest.status === "crawling"}
            onClick={() => void recrawl()}
          >
            {busy || digest?.status === "crawling" ? t("interviewsCollecting") : t("interviewsRecrawl")}
          </button>
          <Link href="/interviews" className="btn">
            {t("interviewsBack")}
          </Link>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm font-bold text-rose-700">{error}</p> : null}
      {!digest ? <p className="text-sm muted">{t("reading")}</p> : null}

      {digest ? (
        <div className="grid gap-4">
          <section className="panel">
            <p className="text-[11px] font-black tracking-widest kicker-gold">{t(STATUS_KEY[digest.status])}</p>
            <p className="mt-2 text-sm">
              {t("interviewsCollected", { count: digest.collected })}
              {digest.totalOnSite != null ? ` · ${t("interviewsOnSite", { count: digest.totalOnSite })}` : ""}
              {` · ${t("interviewsReadable", { count: digest.readableCount })}`}
              {` · ${t("interviewsLocked", { count: digest.lockedCount })}`}
            </p>
            {digest.status === "crawling" ? <p className="mt-2 text-sm muted">{t("interviewsProgress")}</p> : null}
            {digest.error ? <p className="mt-2 text-sm font-bold text-rose-700">{digest.error}</p> : null}
            {digest.summary ? <p className="mt-3 text-sm leading-6">{digest.summary}</p> : null}
            {digest.hasCookie ? <p className="mt-2 text-xs muted">{t("interviewsCookieSaved")}</p> : null}
          </section>

          <section className="panel">
            <h2 className="text-xl font-black">{t("interviewsQuestions")}</h2>
            {digest.questions.length === 0 ? (
              <p className="mt-2 text-sm muted">{t("interviewsNoQuestions")}</p>
            ) : (
              <ol className="mt-3 grid gap-3">
                {digest.questions.map((question) => (
                  <li key={`${question.leetcode ?? ""}:${question.text}`} className="grid gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-bold">
                        <span className="mr-2 text-[#5b45d6]">{question.count}</span>
                        {question.text}
                      </p>
                      <span className="text-xs font-black tracking-wide kicker-gold">{t(KIND_KEY[question.kind])}</span>
                    </div>
                    <div className="h-2 border border-[#c9bdf0] bg-white">
                      <div
                        className="h-full bg-[#f6e7b8]"
                        style={{ width: `${Math.max(8, Math.round((question.count / topCount) * 100))}%` }}
                      />
                    </div>
                    <p className="text-xs muted">
                      {question.sources.map((source, index) => {
                        const thread = digest.threads.find((item) => item.tid === source.tid);
                        return (
                          <span key={source.tid}>
                            {index > 0 ? " · " : ""}
                            <a href={thread?.url} target="_blank" rel="noopener noreferrer" className="underline">
                              {source.title}
                            </a>
                          </span>
                        );
                      })}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel">
            <h2 className="text-xl font-black">{t("interviewsThreads")}</h2>
            <ul className="mt-3 grid gap-3">
              {digest.threads.map((thread) => (
                <li key={thread.tid} className="border-b border-[#eee7f7] pb-3 last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <a href={thread.url} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                      {thread.title}
                    </a>
                    <span className="text-xs font-black">
                      {thread.locked ? t("interviewsLockedBadge") : t("interviewsReadableBadge")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs muted">
                    {[thread.postedAt ? formatAddedAt(thread.postedAt, locale) : "", thread.interviewType, thread.difficulty, thread.category]
                      .filter(Boolean)
                      .join(" · ")}
                    {thread.leetcode.length > 0 ? ` · LeetCode ${thread.leetcode.join(", ")}` : ""}
                  </p>
                  {thread.excerpt ? <p className="mt-1 text-sm leading-6">{thread.excerpt}</p> : null}
                </li>
              ))}
            </ul>
          </section>

          <form onSubmit={(event) => void recrawl(event)} className="panel grid max-w-2xl gap-3">
            <label className="field-label">
              <span>{t("interviewsCookie")}</span>
              <textarea
                rows={3}
                value={cookie}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setCookie(event.target.value)}
              />
              <span className="text-xs font-normal muted">{t("interviewsCookieHint")}</span>
            </label>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={clearCookie}
                onChange={(event) => setClearCookie(event.target.checked)}
              />
              {t("interviewsClearCookie")}
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-gold" disabled={busy || digest.status === "crawling"}>
                {busy || digest.status === "crawling" ? t("interviewsCollecting") : t("interviewsRecrawl")}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void remove()}>
                {t("interviewsDelete")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
