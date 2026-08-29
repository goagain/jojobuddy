import * as cheerio from "cheerio";

export function cleanText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToText(html: string) {
  const $ = cheerio.load(`<div>${html}</div>`);
  $("script, style").remove();
  return cleanText($.root().text());
}

/** Prefer the longest non-empty job container; empty `main` shells are common on SSR/SPA pages. */
export function pickLongestJobText(candidates: string[], maxLength = 20_000): string {
  let best = "";
  for (const candidate of candidates) {
    const text = cleanText(candidate);
    if (text.length > best.length) best = text;
  }
  return best.slice(0, maxLength);
}

const JOB_HTML_SELECTORS = [
  "main",
  "article",
  "[class*='job']",
  "[class*='description']",
  "[class*='position-detail']",
  "[class*='position_detail']",
  "[class*='positionDetail']",
  "body",
] as const;

export function pickJobTextFromHtml($: cheerio.CheerioAPI, maxLength = 20_000): string {
  return pickLongestJobText(
    JOB_HTML_SELECTORS.map((selector) => $(selector).first().text()),
    maxLength,
  );
}
