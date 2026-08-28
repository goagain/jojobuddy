import type { Locale } from "./i18n/config";

export function formatAddedAt(iso: string, locale: Locale) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleString(locale === "zh" ? "zh-CN" : "en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function localDatePart(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function matchesDateRange(iso: string | undefined, from: string, to: string) {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = localDatePart(iso);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export type RecentWindow = "" | "7" | "30" | "90" | "older90" | "unknown";

export function matchesRecentWindow(iso: string | undefined, window: RecentWindow) {
  if (!window) return true;
  if (window === "unknown") return !iso;
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  if (window === "older90") {
    cutoff.setDate(cutoff.getDate() - 90);
    return date < cutoff;
  }
  const days = Number(window);
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}
