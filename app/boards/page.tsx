"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import type { JobBoardSummary } from "@/lib/board-store";
import { formatHealthHint } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";

const STATUS_KEY: Record<JobBoardSummary["status"], MessageKey> = {
  discovering: "boardsStatusDiscovering",
  ready: "boardsStatusReady",
  crawling: "boardsStatusCrawling",
  crawled: "boardsStatusCrawled",
  failed: "boardsStatusFailed",
};

export default function BoardsPage() {
  const { t } = useI18n();
  const [boards, setBoards] = useState<JobBoardSummary[]>([]);
  const [hint, setHint] = useState(() => t("reading"));
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [health, list] = await Promise.all([
      fetch("/api/health").then((response) => response.json()),
      fetch("/api/boards").then((response) => response.json()),
    ]);
    setOk(Boolean(health.ok));
    setHint(formatHealthHint(t, health));
    setBoards(list.boards ?? []);
    if (list.error) setError(list.error);
  }

  useEffect(() => {
    reload().catch(() => setError(t("boardsReadFail")));
  }, [t]);

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader status={{ ok, hint }} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-[11px] tracking-[0.3em] kicker-gold">BOARDS</p>
          <h1 className="text-3xl font-black">{t("boardsTitle")}</h1>
          <p className="mt-1 text-sm muted">{t("boardsDesc")}</p>
        </div>
        <Link href="/boards/new" className="btn btn-gold">
          {t("boardsNew")}
        </Link>
      </div>
      {error ? <p className="mb-3 text-sm font-bold text-rose-700">{error}</p> : null}
      {boards.length === 0 ? (
        <div className="panel text-sm muted">{t("boardsEmpty")}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {boards.map((board) => (
            <article key={board.id} className="panel flex flex-col gap-3">
              <div>
                <p className="text-[11px] font-black tracking-widest kicker-gold">
                  {t(STATUS_KEY[board.status])}
                </p>
                <h2 className="text-lg font-black">{board.company || board.sourceUrl}</h2>
                <p className="truncate text-sm muted">{board.sourceUrl}</p>
                <p className="mt-1 text-xs muted">
                  {t("boardsListingCount", { count: board.listingCount })}
                  {board.total != null ? ` · ${t("boardsTotalOnSite", { count: board.total })}` : ""}
                  {board.dailyUpdate ? ` · ${t("boardsDailyUpdate")}` : ""}
                </p>
                {board.error ? <p className="mt-1 text-sm font-bold text-rose-700">{board.error}</p> : null}
              </div>
              <div className="mt-auto">
                <Link href={`/boards/${board.id}`} className="btn btn-violet">
                  {t("boardsOpen")}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
