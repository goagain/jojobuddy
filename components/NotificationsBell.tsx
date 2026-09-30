"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";

type Notice = {
  id: string;
  title: string;
  company: string;
  score: number;
  url: string;
  boardId: string;
  read: boolean;
};

export function NotificationsBell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notice[]>([]);

  async function reload() {
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const payload = (await response.json()) as { unread?: number; notifications?: Notice[] };
    setUnread(payload.unread ?? 0);
    setItems(payload.notifications ?? []);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void reload();
    }, 30_000);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    const first = window.setTimeout(() => void reload(), 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setUnread(0);
      setItems((current) => current.map((item) => ({ ...item, read: true })));
    }
  }

  return (
    <div className="relative">
      <button type="button" className="btn relative" onClick={() => void toggle()} aria-expanded={open}>
        {t("notifications")}
        {unread > 0 ? (
          <span className="ml-1 inline-flex min-w-5 items-center justify-center border-2 border-[#2d2940] bg-[#e2c56a] px-1 text-[10px] text-[#2d2940]">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 border-2 border-[#2d2940] bg-white p-3 shadow-[4px_4px_0_#e2c56a]">
          <p className="mb-2 text-xs font-black tracking-widest kicker-gold">{t("notifications")}</p>
          {items.length === 0 ? (
            <p className="text-sm muted">{t("notificationsEmpty")}</p>
          ) : (
            <ul className="grid max-h-80 gap-2 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="block text-sm font-bold">
                    {item.company ? `${item.company} · ` : ""}
                    {item.title}
                    <span className="mt-0.5 block text-xs kicker-gold">
                      {t("boardsMatch", { score: item.score })}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
