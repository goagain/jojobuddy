"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import { readResponseJson } from "@/lib/http-json";
import { waitForWorkJob } from "@/lib/wait-work";
import type { PublicWorkJob } from "@/lib/work-types";

export default function NewBoardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);

  async function discover(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setProgress(t("boardsDiscovering"));
    try {
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = await readResponseJson<{
        board?: { id: string };
        job?: PublicWorkJob;
        error?: string;
      }>(response, "Boards API");
      if (!response.ok || !payload.board || !payload.job) {
        throw new Error(payload.error ?? t("boardsReadFail"));
      }
      await waitForWorkJob(payload.job.id, (step) => setProgress(step?.step ?? t("boardsDiscovering")));
      router.push(`/boards/${payload.board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("boardsReadFail"));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader />
      <div className="mb-5">
        <p className="display text-[11px] tracking-[0.3em] kicker-gold">BOARDS</p>
        <h1 className="text-3xl font-black">{t("boardsNew")}</h1>
        <p className="mt-1 text-sm muted">{t("boardsDesc")}</p>
      </div>
      <form onSubmit={(event) => void discover(event)} className="panel grid max-w-2xl gap-3">
        <label className="field-label">
          <span>{t("boardsUrl")}</span>
          <input
            type="url"
            required
            value={url}
            placeholder={t("boardsUrlPlaceholder")}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        {error ? <p className="text-sm font-bold text-rose-700">{error}</p> : null}
        {progress && busy ? <p className="text-sm muted">{progress}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-gold" disabled={busy}>
            {busy ? t("boardsDiscovering") : t("boardsDiscover")}
          </button>
          <Link href="/boards" className="btn">
            {t("boardsBack")}
          </Link>
        </div>
      </form>
    </div>
  );
}
