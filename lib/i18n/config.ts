export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "jojo_locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh";
}
