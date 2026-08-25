import { DEFAULT_LOCALE, type Locale, isLocale } from "./config";
import { en, type MessageKey, type Messages } from "./en";
import { zh } from "./zh";

const catalogs: Record<Locale, Messages> = { en, zh };

export function getMessages(locale: Locale): Messages {
  return catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
}

export function createTranslator(locale: Locale) {
  const messages = getMessages(locale);
  return function t(key: MessageKey, vars?: Record<string, string | number>) {
    let text: string = messages[key] ?? en[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

export function resolveLocale(raw: string | null | undefined): Locale {
  if (isLocale(raw)) return raw;
  return DEFAULT_LOCALE;
}

export function formatHealthHint(
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  payload: {
    hint?: string;
    hintCode?: string;
    hintVars?: Record<string, string | number | boolean | null | undefined>;
  },
) {
  if (payload.hintCode === "mongo_down") {
    return t("healthMongoDown", { error: String(payload.hintVars?.error ?? "unknown") });
  }
  if (payload.hintCode === "ok") {
    const vars = payload.hintVars ?? {};
    const worker = vars.workerOnline
      ? t("workerOnline", {
          queued: Number(vars.queued ?? 0),
          running: Number(vars.running ?? 0),
        })
      : t("workerOffline");
    return t("healthOk", {
      profiles: Number(vars.profiles ?? 0),
      jobs: Number(vars.jobs ?? 0),
      models: Number(vars.models ?? 0),
      worker,
    });
  }
  return payload.hint || t("healthFail");
}

export type { MessageKey, Messages };
export { en, zh };
