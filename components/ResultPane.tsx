"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import type { CraftResult } from "@/lib/types";
import { useI18n } from "@/components/LocaleProvider";
import { OpenInterviewButton } from "@/components/OpenInterviewButton";
import { ScoreRadar } from "./ScoreRadar";
import { buildResumeExportStem } from "@/lib/export-filename";
import { extractOfficialJobNumber } from "@/lib/job-number";
import { joinMarkdownSegments, splitMarkdownSegments } from "@/lib/markdown-segments";

function fileStem(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 160) || "resume";
}

export type BoundContext = {
  profileId: string;
  profileLabel: string;
  personName?: string;
  jobId: string;
  jobTitle?: string;
  jobCompany?: string;
  jobNumber?: string;
  jobLabel: string;
  jobSourceKind: "paste" | "url";
  jobSourceUrl?: string;
};

function ResumeMarkdown({ markdown }: { markdown: string }) {
  return (
    <Markdown
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="resume-link">
            {children}
          </a>
        ),
      }}
    >
      {markdown}
    </Markdown>
  );
}

export function ResultPane({
  result,
  busy,
  progress,
  boundContext,
  downloadName,
  onSaveEdit,
}: {
  result: CraftResult | null;
  busy: boolean;
  progress?: string;
  boundContext?: BoundContext;
  downloadName?: string;
  /** Pass null to drop the manual edit. */
  onSaveEdit?: (markdown: string | null) => Promise<void>;
}) {
  const { t } = useI18n();
  const [roundIndex, setRoundIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftSegments, setDraftSegments] = useState<string[]>([]);
  const articleRef = useRef<HTMLElement>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const rounds = result?.rounds ?? [];
  const hasMultipleRounds = rounds.length > 1;
  const safeRoundIndex = hasMultipleRounds ? Math.min(roundIndex, rounds.length - 1) : 0;
  const isFinalRound = !hasMultipleRounds || safeRoundIndex === rounds.length - 1;
  const activeRound = rounds[safeRoundIndex];
  const generatedMarkdown = activeRound?.resumeMarkdown ?? result?.resumeMarkdown ?? "";
  const editedMarkdown = isFinalRound ? result?.editedMarkdown : undefined;
  const displayedMarkdown = editedMarkdown ?? generatedMarkdown;
  const canEdit = Boolean(result && onSaveEdit && isFinalRound && !busy);
  const judgment = activeRound?.judgment ?? result?.judgment;
  const referral = (activeRound?.crafted?.referral ?? result?.crafted?.referral ?? "").trim();
  const [referralCopied, setReferralCopied] = useState(false);

  useEffect(() => {
    setReferralCopied(false);
  }, [referral]);

  useEffect(() => {
    setEditing(false);
    setEditError(null);
  }, [result?.resumeMarkdown, boundContext?.profileId, boundContext?.jobId]);

  function startEditing() {
    const segments = splitMarkdownSegments(displayedMarkdown);
    setDraftSegments(segments.length > 0 ? segments : [""]);
    setEditError(null);
    setEditing(true);
    articleRef.current?.scrollTo({ top: 0 });
  }

  function updateSegment(index: number, value: string) {
    setDraftSegments((prev) => prev.map((segment, i) => (i === index ? value : segment)));
  }

  function insertSegmentAfter(index: number) {
    setDraftSegments((prev) => [...prev.slice(0, index + 1), "", ...prev.slice(index + 1)]);
  }

  async function persistEdit(markdown: string | null) {
    if (!onSaveEdit) return;
    setSaving(true);
    setEditError(null);
    try {
      await onSaveEdit(markdown);
      setEditing(false);
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : t("unknownError"));
    } finally {
      setSaving(false);
    }
  }

  function saveDraft() {
    const draft = joinMarkdownSegments(draftSegments);
    const unchanged = draft === joinMarkdownSegments(splitMarkdownSegments(generatedMarkdown));
    void persistEdit(unchanged || !draft ? null : draft);
  }

  function restoreGenerated() {
    if (!window.confirm(t("editRestoreConfirm"))) return;
    void persistEdit(null);
  }

  useEffect(() => {
    if (!result) {
      setRoundIndex(0);
      return;
    }
    setRoundIndex(Math.max(0, result.rounds.length - 1));
  }, [result?.resumeMarkdown, result?.rounds.length]);

  const dimensions = [
    ["keywordHit", t("dimKeyword"), "30%"],
    ["quantifiedImpact", t("dimImpact"), "30%"],
    ["experienceMatch", t("dimExperience"), "20%"],
    ["signalToNoise", t("dimNoise"), "20%"],
  ] as const;

  function resolveExportStem() {
    if (boundContext) {
      const jobNumber = boundContext.jobNumber ?? extractOfficialJobNumber(boundContext.jobSourceUrl);
      return buildResumeExportStem({
        personName: boundContext.personName ?? boundContext.profileLabel,
        jobTitle: boundContext.jobTitle,
        jobNumber: jobNumber ?? undefined,
        company: boundContext.jobCompany,
      });
    }
    return fileStem(downloadName || "resume");
  }

  function downloadMarkdown() {
    if (!displayedMarkdown) return;
    const blob = new Blob([displayedMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const roundSuffix = hasMultipleRounds ? `-r${safeRoundIndex + 1}` : "";
    link.href = url;
    link.download = `${resolveExportStem()}${roundSuffix}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyReferral() {
    if (!referral) return;
    await navigator.clipboard.writeText(referral);
    setReferralCopied(true);
    window.setTimeout(() => setReferralCopied(false), 1500);
  }

  function printResume() {
    const previous = document.title;
    document.title = resolveExportStem();
    window.print();
    document.title = previous;
  }

  const stoppedReason =
    result?.stoppedReason === "s_rank"
      ? t("reasonS")
      : result?.stoppedReason === "threshold"
        ? t("reasonThreshold")
        : t("reasonMax");

  return (
    <section className="grid min-h-0 gap-4 xl:grid-rows-[1.15fr_0.85fr]">
      <article
        ref={articleRef}
        className="min-h-[320px] overflow-auto border-2 border-[#e2c56a] bg-[#fff8ea] p-6 text-[#1a1208] shadow-[6px_6px_0_rgba(45,41,64,0.12)]"
      >
        <header
          className={`no-print mb-4 flex items-end justify-between gap-3 ${
            editing ? "sticky -top-6 z-10 -mx-6 -mt-6 border-b-2 border-black/10 bg-[#fff8ea] px-6 pb-3 pt-6" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="display text-[11px] tracking-[0.35em] text-[#6b3cff]">STAR PLATINUM</p>
            <div className="flex flex-wrap items-end gap-3">
              <h2 className="text-xl font-black">{t("starTitle")}</h2>
              {judgment ? (
                <div className="border-2 border-black bg-white px-2 py-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-black/50">
                    {t("starPreviewScore")}
                  </p>
                  <p className="leading-none">
                    <span className="display text-2xl font-black">{judgment.rank}</span>
                    <span className="ml-2 text-xl font-black">{judgment.overall}</span>
                  </p>
                </div>
              ) : null}
            </div>
            {result?.usedModels ? (
              <p className="text-[11px] font-bold text-black/60">
                {result.usedModels.generator.providerName} / {result.usedModels.generator.label}
              </p>
            ) : null}
            {boundContext?.jobCompany ? (
              <div className="mt-2">
                <OpenInterviewButton company={boundContext.jobCompany} />
              </div>
            ) : null}
            {result && boundContext ? (
              <p className="mt-1 text-[11px] font-bold text-black/60">
                {t("boundLabelPrefix")}
                <Link
                  href={`/profiles/${boundContext.profileId}`}
                  className="kicker-gold underline underline-offset-2"
                >
                  {boundContext.profileLabel}
                </Link>
                {" · "}
                {boundContext.jobSourceKind === "url" && boundContext.jobSourceUrl ? (
                  <a
                    href={boundContext.jobSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="kicker-gold underline underline-offset-2"
                  >
                    {boundContext.jobLabel}
                  </a>
                ) : (
                  <Link
                    href={`/jobs/${boundContext.jobId}`}
                    className="kicker-gold underline underline-offset-2"
                  >
                    {boundContext.jobLabel}
                  </Link>
                )}
              </p>
            ) : null}
          </div>
          {result && editing ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="border-2 border-black bg-[#6b3cff] px-3 py-1 text-xs font-black text-white disabled:opacity-50"
                onClick={saveDraft}
                disabled={saving}
              >
                {saving ? t("editSaving") : t("editSave")}
              </button>
              <button
                type="button"
                className="border-2 border-black bg-white px-3 py-1 text-xs font-black disabled:opacity-50"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                {t("editCancel")}
              </button>
            </div>
          ) : result ? (
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <button
                  type="button"
                  className="border-2 border-black bg-white px-3 py-1 text-xs font-black"
                  onClick={startEditing}
                >
                  {t("editResume")}
                </button>
              ) : null}
              <button
                type="button"
                className="border-2 border-black bg-white px-3 py-1 text-xs font-black"
                onClick={downloadMarkdown}
              >
                {t("downloadMd")}
              </button>
              <button
                type="button"
                className="border-2 border-black px-3 py-1 text-xs font-black"
                onClick={printResume}
              >
                {t("printPdf")}
              </button>
            </div>
          ) : null}
        </header>
        {result && hasMultipleRounds ? (
          <div className="no-print mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-black/50">
              {t("roundIterations")}
            </span>
            {rounds.map((round, index) => {
              const isActive = index === safeRoundIndex;
              const isFinal = index === rounds.length - 1;
              const label = isFinal
                ? t("roundTabFinal", { n: round.round })
                : t("roundTab", { n: round.round });
              return (
                <button
                  key={round.round}
                  type="button"
                  className={`border-2 border-black px-2 py-1 text-[11px] font-black ${
                    isActive ? "bg-[#6b3cff] text-white" : "bg-white text-black hover:bg-[#fff0c8]"
                  }`}
                  onClick={() => setRoundIndex(index)}
                >
                  {label}
                  <span className="ml-1 opacity-80">
                    {round.judgment.rank} {round.judgment.overall}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {result && editedMarkdown && !editing ? (
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2 border-2 border-dashed border-[#6b3cff] bg-white/70 px-3 py-2">
            <p className="text-[11px] font-bold text-black/70">{t("editManualBadge")}</p>
            {onSaveEdit && !busy ? (
              <button
                type="button"
                className="border-2 border-black bg-white px-2 py-0.5 text-[11px] font-black disabled:opacity-50"
                onClick={restoreGenerated}
                disabled={saving}
              >
                {t("editRestore")}
              </button>
            ) : null}
          </div>
        ) : null}
        {editError ? (
          <p className="no-print mb-3 text-sm font-bold text-rose-700">{editError}</p>
        ) : null}
        {result && editing ? (
          <div className="no-print grid gap-2">
            <div className="hidden gap-3 md:grid md:grid-cols-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-black/50">
                {t("editMarkdownLabel")}
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest text-black/50">
                {t("editPreviewLabel")}
              </span>
            </div>
            {draftSegments.map((segment, index) => (
              <div
                key={index}
                className="group grid gap-3 border-b border-dashed border-black/10 pb-2 md:grid-cols-2"
              >
                <div className="grid gap-1">
                  <textarea
                    className="field-sizing-content min-h-[2.5rem] w-full resize-none border-2 border-black bg-white px-2 py-1 font-mono text-xs leading-5 text-black"
                    value={segment}
                    onChange={(event) => updateSegment(index, event.target.value)}
                    spellCheck={false}
                    autoFocus={index === 0}
                  />
                  <button
                    type="button"
                    className="justify-self-start text-[10px] font-black text-black/40 opacity-0 transition group-hover:opacity-100 focus:opacity-100 hover:text-[#6b3cff]"
                    onClick={() => insertSegmentAfter(index)}
                  >
                    {t("editInsertSegment")}
                  </button>
                </div>
                <div className="resume-sheet min-w-0 self-start">
                  <ResumeMarkdown markdown={segment} />
                </div>
              </div>
            ))}
          </div>
        ) : result ? (
          <div className="resume-sheet print-resume">
            <ResumeMarkdown markdown={displayedMarkdown} />
          </div>
        ) : (
          <p className="text-sm leading-6 text-black/60">
            {busy ? progress || t("starEmptyBusy") : t("starEmpty")}
          </p>
        )}
        {referral ? (
          <div className="no-print mt-4 border-2 border-black bg-white p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-widest">{t("referralTitle")}</p>
                <p className="mt-1 text-[11px] font-medium text-black/60">{t("referralHint")}</p>
              </div>
              <button
                type="button"
                className="shrink-0 border-2 border-black bg-white px-3 py-1 text-xs font-black"
                onClick={() => void copyReferral()}
              >
                {referralCopied ? t("referralCopied") : t("referralCopy")}
              </button>
            </div>
            <p className="text-sm leading-6">{referral}</p>
          </div>
        ) : null}
      </article>

      <article className="menace no-print min-h-[280px] overflow-auto border-2 border-[#d8c49a] bg-[#f3e6c8] p-5 text-[#3a2a16] shadow-[6px_6px_0_rgba(45,41,64,0.12)]">
        <p className="display text-[11px] tracking-[0.35em] text-[#7a3b16]">HEAVEN&apos;S DOOR</p>
        <h2 className="mb-1 text-xl font-black">{t("heavensTitle")}</h2>
        {result?.usedModels ? (
          <p className="mb-3 text-[11px] font-bold text-black/60">
            {result.usedModels.judge.providerName} / {result.usedModels.judge.label}
          </p>
        ) : (
          <div className="mb-3" />
        )}
        {judgment ? (
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            {hasMultipleRounds ? (
              <p className="md:col-span-2 text-[11px] font-bold text-black/60">
                {t("roundViewing", { current: safeRoundIndex + 1, total: rounds.length })}
              </p>
            ) : null}
            <div>
              <div className="mb-2 flex items-end gap-2">
                <span className="display text-5xl font-black leading-none">{judgment.rank}</span>
                <span className="text-3xl font-black">{judgment.overall}</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest">
                {judgment.verdict === "s_rank"
                  ? t("verdictS")
                  : judgment.verdict === "pass"
                    ? t("verdictPass")
                    : judgment.verdict === "rewrite"
                      ? t("verdictRewrite")
                      : t("verdictReject")}
              </p>
              <ScoreRadar scores={judgment.scores} />
            </div>
            <div className="space-y-3 text-sm">
              {editedMarkdown ? (
                <p className="text-[11px] font-bold text-[#7a3b16]">{t("editJudgeNote")}</p>
              ) : null}
              <p className="font-medium leading-6">{judgment.summary}</p>
              <div className="grid grid-cols-2 gap-2">
                {dimensions.map(([key, label, weight]) => (
                  <div key={key} className="border border-black/20 bg-white/40 px-2 py-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span>
                        {label} · {weight}
                      </span>
                      <span>{judgment.scores[key]}</span>
                    </div>
                  </div>
                ))}
              </div>
              {judgment.deductions.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-black tracking-widest">{t("deductions")}</p>
                  <ul className="list-disc space-y-1 pl-4">
                    {judgment.deductions.map((item) => (
                      <li key={`${item.dimension}-${item.reason}`}>
                        -{item.points} {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs font-bold">{t("noDeductions")}</p>
              )}
              {judgment.rewriteInstructions.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-black tracking-widest">{t("rewriteForStar")}</p>
                  <ol className="list-decimal space-y-1 pl-4">
                    {judgment.rewriteInstructions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {judgment.atsKeywords.hit.map((word) => (
                  <span key={word} className="bg-[#8b5cff] px-2 py-0.5 text-[11px] font-bold text-white">
                    HIT {word}
                  </span>
                ))}
                {judgment.atsKeywords.missed.map((word) => (
                  <span
                    key={word}
                    className="bg-[#2d2940] px-2 py-0.5 text-[11px] font-bold text-[#f6e7b8]"
                  >
                    MISS {word}
                  </span>
                ))}
              </div>
              {result ? (
                <p className="text-[11px] font-bold opacity-70">
                  {t("roundsMeta", { rounds: result.rounds.length, reason: stoppedReason })}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6 text-black/60">
            {busy ? progress || t("heavensEmptyBusy") : t("heavensEmpty")}
          </p>
        )}
      </article>
    </section>
  );
}
