"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import type { ProfileSummary } from "@/lib/entities";
import { formatHealthHint } from "@/lib/i18n";
import { SAMPLE_MASTER_RESUME } from "@/lib/sample-resume";

export default function ProfilesPage() {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [hint, setHint] = useState(() => t("reading"));
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [health, list] = await Promise.all([
      fetch("/api/health").then((response) => response.json()),
      fetch("/api/profiles").then((response) => response.json()),
    ]);
    setOk(Boolean(health.ok));
    setHint(formatHealthHint(t, health));
    setProfiles(list.profiles ?? []);
    if (list.error) setError(list.error);
  }

  useEffect(() => {
    reload().catch(() => setError(t("readProfilesFail")));
  }, [t]);

  async function seedSample() {
    setError(null);
    const response = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: t("sampleProfileName"),
        resume: SAMPLE_MASTER_RESUME,
        sources: [
          {
            id: crypto.randomUUID(),
            kind: "manual",
            text: t("sampleSourceNote"),
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? t("createFail"));
      return;
    }
    await reload();
  }

  async function remove(id: string) {
    if (!window.confirm(t("deleteProfileConfirm"))) return;
    await fetch(`/api/profiles/${id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader status={{ ok, hint }} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-[11px] tracking-[0.3em] kicker">PROFILES</p>
          <h1 className="text-3xl font-black">{t("profilesTitle")}</h1>
          <p className="mt-1 text-sm muted">{t("profilesDesc")}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={seedSample}>
            {t("loadSample")}
          </button>
          <Link href="/profiles/new" className="btn btn-violet">
            {t("newProfile")}
          </Link>
        </div>
      </div>
      {error ? <p className="mb-3 text-sm font-bold text-rose-700">{error}</p> : null}
      {profiles.length === 0 ? (
        <div className="panel text-sm muted">{t("profilesEmpty")}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => (
            <article key={profile.id} className="panel flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-black">{profile.name}</h2>
                <p className="text-sm muted">
                  {profile.personName || t("workbenchUnnamed")}
                  {profile.headline ? ` · ${profile.headline}` : ""}
                </p>
              </div>
              <p className="text-xs muted">
                {t("sourcesCount", { exp: profile.experienceCount, src: profile.sourceCount })}
              </p>
              <div className="mt-auto flex gap-2">
                <Link href={`/profiles/${profile.id}`} className="btn btn-gold">
                  {t("edit")}
                </Link>
                <button type="button" className="btn" onClick={() => void remove(profile.id)}>
                  {t("delete")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
