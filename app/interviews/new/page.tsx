"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import { readResponseJson } from "@/lib/http-json";

const DEFAULT_FORUM = "https://www.1point3acres.com/home/forum/145";

export default function NewInterviewPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [forumUrl, setForumUrl] = useState(DEFAULT_FORUM);
  const [limit, setLimit] = useState(40);
  const [cookie, setCookie] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function collect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          forumUrl,
          limit,
          cookie: cookie.trim() || undefined,
        }),
      });
      const payload = await readResponseJson<{
        digest?: { id: string };
        error?: string;
      }>(response, "Interviews API");
      if (!response.ok || !payload.digest) throw new Error(payload.error ?? t("interviewsReadFail"));
      router.push(`/interviews/${payload.digest.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("interviewsReadFail"));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader />
      <div className="mb-5">
        <p className="display text-[11px] tracking-[0.3em] kicker-gold">INTERVIEWS</p>
        <h1 className="text-3xl font-black">{t("interviewsNew")}</h1>
        <p className="mt-1 text-sm muted">{t("interviewsDesc")}</p>
      </div>
      <form onSubmit={(event) => void collect(event)} className="panel grid max-w-2xl gap-3">
        <label className="field-label">
          <span>{t("interviewsCompany")}</span>
          <input
            required
            value={company}
            placeholder={t("interviewsCompanyPlaceholder")}
            onChange={(event) => setCompany(event.target.value)}
          />
        </label>
        <label className="field-label">
          <span>{t("interviewsForumUrl")}</span>
          <input
            type="url"
            required
            value={forumUrl}
            placeholder={t("interviewsForumPlaceholder")}
            onChange={(event) => setForumUrl(event.target.value)}
          />
        </label>
        <label className="field-label">
          <span>{t("interviewsLimit")}</span>
          <input
            type="number"
            min={1}
            max={80}
            required
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
        </label>
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
        {error ? <p className="text-sm font-bold text-rose-700">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-gold" disabled={busy}>
            {busy ? t("interviewsCollecting") : t("interviewsCollect")}
          </button>
          <Link href="/interviews" className="btn">
            {t("interviewsBack")}
          </Link>
        </div>
      </form>
    </div>
  );
}
