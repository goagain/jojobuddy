"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import type { JobBoard } from "@/lib/board-store";
import type { ProfileSummary } from "@/lib/entities";
import { formatAddedAt } from "@/lib/format-date";
import { readResponseJson } from "@/lib/http-json";
import type { MessageKey } from "@/lib/i18n";
import { formatHealthHint } from "@/lib/i18n";
import {
  jobLocationKeys,
  jobMatchesCityFilter,
  parseJobCities,
  UNNAMED_LOCATION,
} from "@/lib/job-location";
import { FIT_HIGHLIGHT_SCORE } from "@/lib/job-boards/fit";
import { JOB_LEVELS, type JobLevel, type RoleFamily, type StoredBoardListing } from "@/lib/job-boards/types";
import { waitForWorkJob } from "@/lib/wait-work";
import type { PublicWorkJob } from "@/lib/work-types";

const STATUS_KEY: Record<JobBoard["status"], MessageKey> = {
  discovering: "boardsStatusDiscovering",
  ready: "boardsStatusReady",
  crawling: "boardsStatusCrawling",
  crawled: "boardsStatusCrawled",
  failed: "boardsStatusFailed",
};

const LEVEL_KEY: Record<JobLevel, MessageKey> = {
  intern: "boardLevelIntern",
  new_grad: "boardLevelNewGrad",
  mid: "boardLevelMid",
  senior: "boardLevelSenior",
  staff: "boardLevelStaff",
  principal: "boardLevelPrincipal",
  manager: "boardLevelManager",
  director: "boardLevelDirector",
  unspecified: "boardLevelUnspecified",
};

function facetTitle(t: (key: MessageKey) => string, id: string) {
  if (id === "department") return t("boardsFacetDepartment");
  if (id === "team") return t("boardsFacetTeam");
  if (id === "location") return t("boardsFacetLocation");
  if (id === "employmentType") return t("boardsFacetEmployment");
  return id;
}

function engineerHint(label: string) {
  return /\bengineers?\b|\bengineering\b/i.test(label);
}

export function BoardView({ boardId }: { boardId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [board, setBoard] = useState<JobBoard | null>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [hint, setHint] = useState(() => t("reading"));
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const hydratedRef = useRef(false);
  const [showForm, setShowForm] = useState(true);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [maxJobs, setMaxJobs] = useState(40);
  const [postedWithinDays, setPostedWithinDays] = useState<"" | "7" | "30" | "90">("");
  const [role, setRole] = useState<"" | RoleFamily>("engineer");
  const [levels, setLevels] = useState<JobLevel[]>([]);
  const [profileId, setProfileId] = useState("");
  const [localRole, setLocalRole] = useState<"" | RoleFamily>("");
  const [localLevels, setLocalLevels] = useState<JobLevel[]>([]);
  const [localLocations, setLocalLocations] = useState<string[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [imported, setImported] = useState<Record<string, string>>({});

  async function reload() {
    const [health, payload, profileList] = await Promise.all([
      fetch("/api/health").then((response) => response.json()),
      fetch(`/api/boards/${boardId}`).then((response) => response.json()),
      fetch("/api/profiles").then((response) => response.json()),
    ]);
    setOk(Boolean(health.ok));
    setHint(formatHealthHint(t, health));
    setProfiles(profileList.profiles ?? []);
    if (payload.error && !payload.board) {
      setError(payload.error);
      setBoard(null);
      return;
    }
    const next = payload.board as JobBoard;
    setBoard(next);
    if (!hydratedRef.current) {
      if (next.query) {
        setSelections(next.query.selections ?? {});
        setMaxJobs(next.query.maxJobs || 40);
        setPostedWithinDays(
          next.query.postedWithinDays === 7 ||
            next.query.postedWithinDays === 30 ||
            next.query.postedWithinDays === 90
            ? (String(next.query.postedWithinDays) as "7" | "30" | "90")
            : "",
        );
        setRole(next.query.role ?? "");
        setLevels(next.query.levels ?? []);
        setLocalRole(next.query.role ?? "");
        setLocalLevels(next.query.levels ?? []);
      }
      if (next.profileId) setProfileId(next.profileId);
      else if (profileList.profiles?.[0]?.id) setProfileId(profileList.profiles[0].id);
      setShowForm(next.status !== "crawled");
      hydratedRef.current = true;
    }
  }

  useEffect(() => {
    reload().catch(() => setError(t("boardsReadFail")));
    // Hydrate once from the first successful load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    if (!board || (board.status !== "discovering" && board.status !== "crawling")) return;
    const timer = window.setInterval(() => {
      reload().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [board?.status, boardId]);

  const locationOptions = useMemo(() => {
    const names = new Set<string>();
    for (const listing of board?.listings ?? []) {
      for (const city of jobLocationKeys(listing)) names.add(city);
    }
    return [...names];
  }, [board?.listings]);

  const ranked = useMemo(() => {
    const listings = board?.listings ?? [];
    const locationSet = new Set(localLocations);
    const levelSet = new Set(localLevels);
    return listings
      .filter((listing) => {
        if (localRole && listing.roleFamily !== localRole) return false;
        if (levelSet.size > 0 && !levelSet.has(listing.level)) return false;
        if (!jobMatchesCityFilter(listing, locationSet)) return false;
        return true;
      })
      .sort((a, b) => {
        const scoreA = a.fitScore ?? -1;
        const scoreB = b.fitScore ?? -1;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
      });
  }, [board?.listings, localLevels, localLocations, localRole]);

  function toggleSelection(facetId: string, optionId: string) {
    setSelections((prev) => {
      const current = prev[facetId] ?? [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [facetId]: next };
    });
  }

  function toggleLevel(level: JobLevel, target: "crawl" | "local") {
    const update = (prev: JobLevel[]) =>
      prev.includes(level) ? prev.filter((item) => item !== level) : [...prev, level];
    if (target === "crawl") setLevels(update);
    else setLocalLevels(update);
  }

  async function pullJobs(event: React.FormEvent) {
    event.preventDefault();
    if (!board) return;
    setBusy(true);
    setError(null);
    setProgress(t("boardsCrawling"));
    try {
      const selected = Object.fromEntries(
        Object.entries(selections).filter(([, ids]) => ids.length > 0),
      );
      const response = await fetch(`/api/boards/${board.id}/crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selections: selected,
          maxJobs: Number(maxJobs),
          postedWithinDays: postedWithinDays ? Number(postedWithinDays) : undefined,
          role: role || undefined,
          levels: levels.length ? levels : undefined,
          profileId: profileId || undefined,
        }),
      });
      const payload = await readResponseJson<{ job?: PublicWorkJob; error?: string }>(response, "Boards API");
      if (!response.ok || !payload.job) throw new Error(payload.error ?? t("boardsReadFail"));
      await waitForWorkJob(payload.job.id, (step) => setProgress(step?.step ?? t("boardsCrawling")));
      setLocalRole(role);
      setLocalLevels(levels);
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("boardsReadFail"));
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function retryDiscover() {
    if (!board) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/boards/${board.id}`, { method: "POST" });
      const payload = await readResponseJson<{ job?: PublicWorkJob; error?: string }>(response, "Boards API");
      if (!response.ok || !payload.job) throw new Error(payload.error ?? t("boardsReadFail"));
      await waitForWorkJob(payload.job.id, (step) => setProgress(step?.step ?? t("boardsDiscovering")));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("boardsReadFail"));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function changeProfile(nextId: string) {
    setProfileId(nextId);
    if (!board || !nextId) return;
    if (board.listings.length === 0) {
      await fetch(`/api/boards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: nextId }),
      });
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(t("boardsScoring"));
    try {
      const response = await fetch(`/api/boards/${board.id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: nextId }),
      });
      const payload = await readResponseJson<{ job?: PublicWorkJob; error?: string }>(response, "Boards API");
      if (!response.ok || !payload.job) throw new Error(payload.error ?? t("boardsReadFail"));
      await waitForWorkJob(payload.job.id, (step) => setProgress(step?.step ?? t("boardsScoring")));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("boardsReadFail"));
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function importListing(listing: StoredBoardListing) {
    if (!board) return;
    setImportingId(listing.id);
    setError(null);
    try {
      const page = await waitForParsedJob(listing.url, (step) => setProgress(step));
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: page.title || listing.title,
          company: board.company || page.company,
          location: page.location || listing.location,
          sourceKind: "url",
          sourceUrl: page.sourceUrl || listing.url,
          sourceText: page.sourceText,
          parsedText: page.parsedText,
          requirements: page.requirements,
          keywords: page.keywords,
          postedAt: page.postedAt || listing.postedAt,
          jobNumber: page.jobNumber,
        }),
      });
      const payload = await readResponseJson<{ job?: { id: string }; error?: string }>(response, "Jobs API");
      if (!response.ok || !payload.job) throw new Error(payload.error ?? t("boardsReadFail"));
      setImported((prev) => ({ ...prev, [listing.id]: payload.job!.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("boardsReadFail"));
    } finally {
      setImportingId(null);
      setProgress("");
    }
  }

  async function setDailyUpdate(dailyUpdate: boolean) {
    if (!board) return;
    setBoard({ ...board, dailyUpdate });
    const response = await fetch(`/api/boards/${board.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyUpdate }),
    });
    if (!response.ok) {
      setBoard(board);
      setError(t("boardsReadFail"));
    }
  }

  async function remove() {
    if (!board || !window.confirm(t("boardsDeleteConfirm"))) return;
    await fetch(`/api/boards/${board.id}`, { method: "DELETE" });
    router.push("/boards");
  }

  const formLevels = JOB_LEVELS.filter((level) => level !== "unspecified");

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader status={{ ok, hint }} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-[11px] tracking-[0.3em] kicker-gold">BOARDS</p>
          <h1 className="text-3xl font-black">{board?.company || t("boardsTitle")}</h1>
          {board ? (
            <p className="mt-1 text-sm muted">
              {t(STATUS_KEY[board.status])}
              {board.total != null ? ` · ${t("boardsTotalOnSite", { count: board.total })}` : ""}
            </p>
          ) : null}
          {board?.sourceUrl ? <p className="truncate text-xs muted">{board.sourceUrl}</p> : null}
          {board && board.status !== "discovering" ? (
            <label className="mt-3 flex max-w-xl cursor-pointer items-start gap-2 text-sm font-bold">
              <input
                type="checkbox"
                className="mt-1"
                checked={board.dailyUpdate}
                onChange={(event) => void setDailyUpdate(event.target.checked)}
              />
              <span>
                {t("boardsDailyUpdate")}
                <span className="mt-1 block text-xs font-medium muted">{t("boardsDailyUpdateHint")}</span>
              </span>
            </label>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/boards" className="btn">
            {t("boardsBack")}
          </Link>
          {board ? (
            <button type="button" className="btn" onClick={() => void remove()}>
              {t("delete")}
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mb-3 text-sm font-bold text-rose-700">{error}</p> : null}
      {progress ? <p className="mb-3 text-sm muted">{progress}</p> : null}
      {!board ? <div className="panel text-sm muted">{error ? t("boardsNotFound") : t("reading")}</div> : null}
      {board?.status === "failed" && board.facets.length === 0 ? (
        <div className="panel mb-4 flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold text-rose-700">{board.error || t("boardsFailed")}</p>
          <button type="button" className="btn btn-gold" disabled={busy} onClick={() => void retryDiscover()}>
            {t("boardsRetry")}
          </button>
        </div>
      ) : null}
      {board && (board.status === "ready" || board.status === "crawled" || board.facets.length > 0) ? (
        <div className="mb-4">
          {board.status === "crawled" && !showForm ? (
            <button type="button" className="btn mb-3" onClick={() => setShowForm(true)}>
              {t("boardsRecrawl")}
            </button>
          ) : null}
          {showForm ? (
            <form onSubmit={(event) => void pullJobs(event)} className="panel grid gap-4">
              <div>
                <p className="text-sm font-black">{t("boardsSiteFilters")}</p>
                <p className="mt-1 text-xs muted">{t("boardsEngineerHint")}</p>
              </div>
              {board.facets.length === 0 ? <p className="text-sm muted">{t("boardsNoFacets")}</p> : null}
              {board.facets.map((facet) => (
                <div key={facet.id} className="field-label">
                  <span>{facetTitle(t, facet.id)}</span>
                  <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                    {facet.options.map((option) => {
                      const selected = (selections[facet.id] ?? []).includes(option.id);
                      const hinted = engineerHint(option.label);
                      return (
                        <label
                          key={option.id}
                          className={`flex cursor-pointer items-center gap-2 border-2 px-2 py-1.5 text-xs font-bold ${
                            selected ? "choice-on" : hinted ? "border-[#e2c56a] bg-[#fff8e4]" : "choice"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelection(facet.id, option.id)}
                          />
                          {option.label}
                          <span className="muted">{option.count}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="field-label">
                  <span>{t("boardsRole")}</span>
                  <select value={role} onChange={(event) => setRole(event.target.value as "" | RoleFamily)}>
                    <option value="">{t("boardsRoleAll")}</option>
                    <option value="engineer">{t("boardsRoleEngineer")}</option>
                    <option value="other">{t("boardsRoleOther")}</option>
                  </select>
                </label>
                <label className="field-label">
                  <span>{t("boardsMaxJobs")}</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={maxJobs}
                    onChange={(event) => setMaxJobs(Number(event.target.value))}
                  />
                </label>
                {board.capabilities.supportsPostedSince ? (
                  <label className="field-label">
                    <span>{t("boardsPostedSince")}</span>
                    <select
                      value={postedWithinDays}
                      onChange={(event) => setPostedWithinDays(event.target.value as "" | "7" | "30" | "90")}
                    >
                      <option value="">{t("boardsPostedAny")}</option>
                      <option value="7">{t("boardsLast7")}</option>
                      <option value="30">{t("boardsLast30")}</option>
                      <option value="90">{t("boardsLast90")}</option>
                    </select>
                  </label>
                ) : null}
                <label className="field-label">
                  <span>{t("boardsPickProfile")}</span>
                  <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
                    <option value="">{t("boardsProfileNone")}</option>
                    {profiles.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-medium muted">
                    {profiles.length === 0 ? t("boardsNeedProfile") : t("boardsScoreHint")}
                  </span>
                </label>
              </div>
              <div className="field-label">
                <span>{t("boardsLevel")}</span>
                <div className="flex flex-wrap gap-2">
                  {formLevels.map((level) => {
                    const selected = levels.includes(level);
                    return (
                      <label
                        key={level}
                        className={`flex cursor-pointer items-center gap-2 border-2 px-2 py-1.5 text-xs font-bold ${
                          selected ? "choice-on" : "choice"
                        }`}
                      >
                        <input type="checkbox" checked={selected} onChange={() => toggleLevel(level, "crawl")} />
                        {t(LEVEL_KEY[level])}
                      </label>
                    );
                  })}
                </div>
              </div>
              <button
                type="submit"
                className="btn btn-gold w-fit"
                disabled={busy || board.status === "discovering" || !profileId}
              >
                {busy ? t("boardsCrawling") : t("boardsCrawl")}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
      {board && board.listings.length > 0 ? (
        <div className="grid gap-3">
          <div className="panel grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black">{t("boardsNarrow")}</p>
              <p className="text-xs muted">
                {t("boardsResultCount", { shown: ranked.length, total: board.listings.length })}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="field-label">
                <span>{t("boardsRole")}</span>
                <select
                  value={localRole}
                  onChange={(event) => setLocalRole(event.target.value as "" | RoleFamily)}
                >
                  <option value="">{t("boardsRoleAll")}</option>
                  <option value="engineer">{t("boardsRoleEngineer")}</option>
                  <option value="other">{t("boardsRoleOther")}</option>
                </select>
              </label>
              <label className="field-label">
                <span>{t("boardsPickProfile")}</span>
                <select value={profileId} onChange={(event) => void changeProfile(event.target.value)}>
                  <option value="">{t("boardsProfileNone")}</option>
                  {profiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field-label">
              <span>{t("boardsLevel")}</span>
              <div className="flex flex-wrap gap-2">
                {formLevels.map((level) => {
                  const selected = localLevels.includes(level);
                  return (
                    <label
                      key={level}
                      className={`flex cursor-pointer items-center gap-2 border-2 px-2 py-1.5 text-xs font-bold ${
                        selected ? "choice-on" : "choice"
                      }`}
                    >
                      <input type="checkbox" checked={selected} onChange={() => toggleLevel(level, "local")} />
                      {t(LEVEL_KEY[level])}
                    </label>
                  );
                })}
              </div>
            </div>
            {locationOptions.length > 0 ? (
              <div className="field-label">
                <span>{t("jobsFilterLocation")}</span>
                <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                  {locationOptions.map((location) => {
                    const selected = localLocations.includes(location);
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
                          onChange={() =>
                            setLocalLocations((prev) =>
                              prev.includes(location)
                                ? prev.filter((item) => item !== location)
                                : [...prev, location],
                            )
                          }
                        />
                        {location === UNNAMED_LOCATION ? t("jobsFilterLocationUnknown") : location}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          {ranked.length === 0 ? (
            <div className="panel text-sm muted">{t("boardsRoleEmpty")}</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {ranked.map((listing) => {
                const hot = (listing.fitScore ?? -1) >= FIT_HIGHLIGHT_SCORE;
                return (
                <article
                  key={listing.id}
                  className={`panel flex flex-col gap-3 ${hot ? "panel-gold bg-[#fff8e4]" : ""}`}
                >
                  <div>
                    <p className="text-[11px] font-black tracking-widest kicker-gold">
                      {listing.family || t(LEVEL_KEY[listing.level])}
                      {listing.fitScore != null ? ` · ${t("boardsMatch", { score: listing.fitScore })}` : ""}
                      {hot ? ` · ${t("boardsFitHigh")}` : ""}
                    </p>
                    <h2 className="text-lg font-black">{listing.title}</h2>
                    <p className="text-sm muted">
                      {t(LEVEL_KEY[listing.level])}
                      {listing.roleFamily === "engineer" ? ` · ${t("boardsRoleEngineer")}` : ""}
                    </p>
                    {listing.location ? (
                      <p className="text-sm muted">
                        {t("location")}: {parseJobCities(listing.location).join(" / ")}
                      </p>
                    ) : null}
                    <p className="text-xs muted">
                      {listing.postedAt
                        ? t("postedAt", { date: formatAddedAt(listing.postedAt, locale) })
                        : t("postedAtUnknown")}
                    </p>
                  </div>
                  {listing.fitReason ? <p className="text-sm font-medium">{listing.fitReason}</p> : null}
                  {listing.excerpt ? <p className="text-sm leading-6 muted">{listing.excerpt}</p> : null}
                  <div className="mt-auto flex flex-wrap gap-2">
                    <a href={listing.url} target="_blank" rel="noopener noreferrer" className="btn">
                      {t("boardsOpenListing")}
                    </a>
                    {imported[listing.id] ? (
                      <Link href={`/jobs/${imported[listing.id]}`} className="btn btn-violet">
                        {t("boardsImported")}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-gold"
                        disabled={importingId === listing.id}
                        onClick={() => void importListing(listing)}
                      >
                        {importingId === listing.id ? t("boardsImporting") : t("boardsImport")}
                      </button>
                    )}
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

async function waitForParsedJob(
  url: string,
  onProgress: (step: string) => void,
): Promise<{
  title: string;
  company: string;
  location?: string;
  jobNumber?: string;
  postedAt?: string;
  sourceUrl: string;
  sourceText: string;
  parsedText: string;
  requirements?: string[];
  keywords?: string[];
}> {
  const response = await fetch("/api/work", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "parse_url", payload: { url } }),
  });
  const payload = await readResponseJson<{ job?: PublicWorkJob; error?: string }>(response, "Work API");
  if (!response.ok || !payload.job) throw new Error(payload.error ?? "Failed to enqueue");
  onProgress(payload.job.progress?.step ?? "");
  return waitForWorkJob(payload.job.id, (step) => onProgress(step?.step ?? ""));
}
