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

export function AppHeader({
  status,
  user: userProp,
}: {
  status?: { ok: boolean; hint: string };
  user?: { name: string; email: string; image?: string } | null;
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
    <header className="no-print mb-6 flex flex-wrap items-end justify-between gap-4 border-b-4 border-[#e2c56a] pb-4">
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
