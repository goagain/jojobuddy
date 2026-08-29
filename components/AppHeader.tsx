"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/Logo";
import { useI18n } from "@/components/LocaleProvider";
import type { MessageKey } from "@/lib/i18n";

const LINK_DEFS: {
  href: string;
  key: MessageKey;
  match: (path: string) => boolean;
}[] = [
  { href: "/", key: "navWorkbench", match: (path) => path === "/" },
  { href: "/profiles", key: "navProfiles", match: (path) => path.startsWith("/profiles") },
  { href: "/jobs", key: "navJobs", match: (path) => path.startsWith("/jobs") },
  { href: "/settings", key: "navSettings", match: (path) => path.startsWith("/settings") },
];

const EXTERNAL_LINKS = [
  {
    href: "https://github.com/goagain/jojobuddy",
    key: "navGitHub" as const,
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.584 2 12.217c0 4.506 2.865 8.33 6.839 9.679.5.092.682-.222.682-.49 0-.242-.009-.877-.014-1.72-2.782.617-3.369-1.368-3.369-1.368-.454-1.178-1.11-1.491-1.11-1.491-.908-.635.069-.622.069-.622 1.003.072 1.531 1.05 1.531 1.05.892 1.562 2.341 1.111 2.91.85.092-.661.35-1.111.636-1.367-2.22-.258-4.555-1.137-4.555-5.062 0-1.118.39-2.033 1.029-2.75-.103-.258-.446-1.297.098-2.702 0 0 .84-.275 2.75 1.05A9.35 9.35 0 0 1 12 6.946a9.35 9.35 0 0 1 2.504.344c1.909-1.325 2.748-1.05 2.748-1.05.546 1.405.202 2.444.1 2.702.64.717 1.028 1.632 1.028 2.75 0 3.935-2.339 4.801-4.566 5.054.359.316.679.942.679 1.899 0 1.371-.012 2.477-.012 2.813 0 .27.18.586.688.487C19.138 20.543 22 16.72 22 12.217 22 6.584 17.523 2 12 2Z" />
      </svg>
    ),
  },
  {
    href: "https://github.com/sponsors/goagain",
    key: "navSponsor" as const,
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    ),
  },
];

export function AppHeader({
  status,
  user: userProp,
  className = "",
}: {
  status?: { ok: boolean; hint: string };
  user?: { name: string; email: string; image?: string } | null;
  className?: string;
}) {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  const [user, setUser] = useState(userProp ?? null);

  useEffect(() => {
    if (userProp) {
      setUser(userProp);
      return;
    }
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((payload) => {
        setUser(payload.user ?? null);
        if (!payload.user) {
          window.location.href = `/login?next=${encodeURIComponent(pathname || "/")}`;
        }
      })
      .catch(() => setUser(null));
  }, [userProp, pathname]);

  return (
    <header className={`no-print mb-6 flex flex-wrap items-end justify-between gap-4 border-b-4 border-[#e2c56a] pb-4 ${className}`}>
      <div>
        <p className="text-[11px] font-black tracking-[0.45em] kicker-gold">{t("brandTagline")}</p>
        <Link href="/" aria-label="JoJobuddy" className="inline-block text-[#2d2940]">
          <BrandMark />
        </Link>
        <p className="mt-1 text-sm muted">{t("brandSub")}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <nav className="flex flex-wrap justify-end gap-2">
          {LINK_DEFS.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`border-2 px-3 py-1 text-sm font-black ${
                  active
                    ? "border-[#2d2940] bg-[#f6e7b8] text-[#2d2940]"
                    : "border-[#c9bdf0] bg-white text-[#5b45d6]"
                }`}
              >
                {t(link.key)}
              </Link>
            );
          })}
          {EXTERNAL_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 border-2 border-[#c9bdf0] bg-white px-3 py-1 text-sm font-black text-[#5b45d6]"
            >
              {link.icon}
              {t(link.key)}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1 text-xs font-black" aria-label={t("language")}>
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
        {status ? (
          <p className={`text-xs ${status.ok ? "text-emerald-700" : "text-rose-700"}`}>
            {status.hint}
          </p>
        ) : null}
        {user ? (
          <div className="flex items-center gap-2 text-xs">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-6 w-6 rounded-full border border-[#d7cfe4]" />
            ) : null}
            <span className="max-w-[160px] truncate font-bold">{user.name || user.email}</span>
            <button
              type="button"
              className="btn-danger"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
            >
              {t("logout")}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
