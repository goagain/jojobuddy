"use client";

import Markdown from "react-markdown";
import type { CraftResult } from "@/lib/types";
import { useI18n } from "@/components/LocaleProvider";
import { ScoreRadar } from "./ScoreRadar";

function fileStem(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 48) || "resume";
}

export function ResultPane({
  result,
  busy,
  progress,
  boundLabel,
  downloadName,
}: {
  result: CraftResult | null;
  busy: boolean;
  progress?: string;
  boundLabel?: string;
  downloadName?: string;
}) {
  const { t } = useI18n();
  const judgment = result?.judgment;

  const dimensions = [
    ["keywordHit", t("dimKeyword"), "30%"],
    ["quantifiedImpact", t("dimImpact"), "30%"],
    ["experienceMatch", t("dimExperience"), "20%"],
    ["signalToNoise", t("dimNoise"), "20%"],
  ] as const;

  function downloadMarkdown() {
    if (!result) return;
    const blob = new Blob([result.resumeMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileStem(downloadName || "resume")}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printResume() {
    const previous = document.title;
    document.title = fileStem(downloadName || "resume");
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
      <article className="min-h-[320px] overflow-auto border-2 border-[#e2c56a] bg-[#fff8ea] p-6 text-[#1a1208] shadow-[6px_6px_0_rgba(45,41,64,0.12)]">
        <header className="no-print mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="display text-[11px] tracking-[0.35em] text-[#6b3cff]">STAR PLATINUM</p>
            <h2 className="text-xl font-black">{t("starTitle")}</h2>
            {result?.usedModels ? (
              <p className="text-[11px] font-bold text-black/60">
                {result.usedModels.generator.providerName} / {result.usedModels.generator.label}
              </p>
            ) : null}
            {result && boundLabel ? (
              <p className="mt-1 text-[11px] font-bold text-black/60">
                {t("boundLabel", { label: boundLabel })}
              </p>
            ) : null}
          </div>
          {result ? (
            <div className="flex flex-wrap gap-2">
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
        {result ? (
          <div className="resume-sheet print-resume">
            <Markdown
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="resume-link"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {result.resumeMarkdown}
            </Markdown>
          </div>
        ) : (
          <p className="text-sm leading-6 text-black/60">
            {busy ? progress || t("starEmptyBusy") : t("starEmpty")}
          </p>
        )}
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
          <p className="text-sm leading-6 text-black/60">{t("heavensEmpty")}</p>
        )}
      </article>
    </section>
  );
}
