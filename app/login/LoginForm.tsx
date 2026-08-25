"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/Logo";
import { useI18n } from "@/components/LocaleProvider";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { t, locale, setLocale } = useI18n();
  const next = search.get("next") || "/";
  const queryError = search.get("error");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(queryError);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((payload) => {
        setGoogleEnabled(Boolean(payload.googleEnabled));
        if (payload.user) router.replace(next.startsWith("/") ? next : "/");
      })
      .catch(() => undefined);
  }, [next, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login" ? { email, password } : { email, password, name },
        ),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("fail"));
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-[11px] font-black tracking-[0.45em] kicker-gold">{t("brandTagline")}</p>
          <div className="mt-2 flex justify-center">
            <BrandMark />
          </div>
          <p className="mt-2 text-sm muted">{t("loginTitle")}</p>
          <div className="mt-3 flex items-center justify-center gap-1 text-xs font-black" aria-label={t("language")}>
            <button
              type="button"
              className={`border-2 px-2 py-0.5 ${
                locale === "en" ? "border-[#2d2940] bg-[#f6e7b8]" : "border-[#c9bdf0] bg-white"
              }`}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
            <span className="opacity-40">|</span>
            <button
              type="button"
              className={`border-2 px-2 py-0.5 ${
                locale === "zh" ? "border-[#2d2940] bg-[#f6e7b8]" : "border-[#c9bdf0] bg-white"
              }`}
              onClick={() => setLocale("zh")}
            >
              中文
            </button>
          </div>
        </div>

        <section className="panel space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 border-2 px-3 py-2 text-sm font-black ${
                mode === "login" ? "border-[#2d2940] bg-[#f6e7b8]" : "border-[#c9bdf0] bg-white"
              }`}
              onClick={() => setMode("login")}
            >
              {t("loginTab")}
            </button>
            <button
              type="button"
              className={`flex-1 border-2 px-3 py-2 text-sm font-black ${
                mode === "register" ? "border-[#2d2940] bg-[#f6e7b8]" : "border-[#c9bdf0] bg-white"
              }`}
              onClick={() => setMode("register")}
            >
              {t("registerTab")}
            </button>
          </div>

          {googleEnabled ? (
            <a href={`/api/auth/google?next=${encodeURIComponent(next)}`} className="btn flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.26 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t("googleSignIn")}
            </a>
          ) : (
            <p className="text-xs muted">{t("googleNeedEnv")}</p>
          )}

          <div className="flex items-center gap-3 text-[11px] font-black tracking-widest muted">
            <span className="h-px flex-1 bg-[#d7cfe4]" />
            {t("emailDivider")}
            <span className="h-px flex-1 bg-[#d7cfe4]" />
          </div>

          <form className="space-y-3" onSubmit={submit}>
            {mode === "register" ? (
              <label className="field-label">
                {t("name")}
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("nameOptional")}
                />
              </label>
            ) : null}
            <label className="field-label">
              {t("email")}
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="field-label">
              {t("password")}
              <input
                type="password"
                required
                minLength={mode === "register" ? 8 : 1}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>
            {error ? <p className="text-sm font-bold text-rose-700">{error}</p> : null}
            <button type="submit" className="btn btn-violet w-full" disabled={busy}>
              {busy ? t("signingIn") : mode === "login" ? t("signIn") : t("createAccount")}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
