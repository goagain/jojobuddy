"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { readResponseJson } from "@/lib/http-json";

export function OpenInterviewButton({
  company,
  className = "btn",
}: {
  company: string;
  className?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = company.trim();
  if (!name) return null;

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/interviews/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: name }),
      });
      const payload = await readResponseJson<{ digest?: { id: string }; error?: string }>(response, "Interviews API");
      if (!response.ok || !payload.digest) throw new Error(payload.error ?? t("interviewsReadFail"));
      router.push(`/interviews/${payload.digest.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("interviewsReadFail"));
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={className} disabled={busy} onClick={() => void open()}>
        {busy ? t("interviewsCollecting") : t("interviewsOpenCompany")}
      </button>
      {error ? <span className="text-xs font-bold text-rose-700">{error}</span> : null}
    </span>
  );
}
