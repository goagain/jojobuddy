"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import type { InterviewDigestSummary } from "@/lib/interview-store";
import { formatHealthHint, type MessageKey } from "@/lib/i18n";

const STATUS_KEY: Record<InterviewDigestSummary["status"], MessageKey> = {
  crawling: "interviewsStatusCrawling",
  ready: "interviewsStatusReady",
  failed: "interviewsStatusFailed",
};

export default function InterviewsPage() {
  const { t } = useI18n();
  const [digests, setDigests] = useState<InterviewDigestSummary[]>([]);
  const [hint, setHint] = useState(() => t("reading"));
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function reload() {
      const [health, list] = await Promise.all([
        fetch("/api/health").then((response) => response.json()),
        fetch("/api/interviews").then((response) => response.json()),
      ]);
      if (cancelled) return;
      setOk(Boolean(health.ok));
      setHint(formatHealthHint(t, health));
      setDigests(list.digests ?? []);
      if (list.error) setError(list.error);
    }
    reload().catch(() => {
      if (!cancelled) setError(t("interviewsReadFail"));
    });
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader status={{ ok, hint }} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-[11px] tracking-[0.3em] kicker-gold">INTERVIEWS</p>
          <h1 className="text-3xl font-black">{t("interviewsTitle")}</h1>
          <p className="mt-1 text-sm muted">{t("interviewsDesc")}</p>
        </div>
        <Link href="/interviews/new" className="btn btn-gold">
          {t("interviewsNew")}
        </Link>
      </div>
      {error ? <p className="mb-3 text-sm font-bold text-rose-700">{error}</p> : null}
      {digests.length === 0 ? (
        <div className="panel text-sm muted">{t("interviewsEmpty")}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {digests.map((digest) => (
            <article key={digest.id} className="panel flex flex-col gap-3">
              <div>
                <p className="text-[11px] font-black tracking-widest kicker-gold">{t(STATUS_KEY[digest.status])}</p>
                <h2 className="text-lg font-black">{digest.company}</h2>
                <p className="truncate text-sm muted">{digest.forumUrl}</p>
                <p className="mt-1 text-xs muted">
                  {t("interviewsCollected", { count: digest.collected })}
                  {digest.questionCount > 0
                    ? ` · ${t("interviewsQuestionCount", { count: digest.questionCount })}`
                    : ""}
                </p>
                {digest.topQuestions.length > 0 ? (
                  <ul className="mt-2 list-disc pl-4 text-sm">
                    {digest.topQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                ) : null}
                {digest.error ? <p className="mt-1 text-sm font-bold text-rose-700">{digest.error}</p> : null}
              </div>
              <div className="mt-auto">
                <Link href={`/interviews/${digest.id}`} className="btn btn-violet">
                  {t("interviewsOpen")}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
