import type { Browser } from "playwright";
import { cleanText } from "./job-adapters/text";

export type PlaywrightPageSnapshot = {
  title: string;
  company: string;
  text: string;
};

/** Minimum visible JD length to treat Playwright render as successful. */
export const MIN_RENDERED_JOB_TEXT = 200;

const JOB_TEXT_HINTS =
  /qualification|responsibilit|requirement|what you(?:'|’)?ll do|about (the |this )?role|job description/i;

export function scoreJobSnapshot(snapshot: PlaywrightPageSnapshot): number {
  const text = snapshot.text;
  let score = text.length;
  if (JOB_TEXT_HINTS.test(text)) score += 500;
  if (/page not found/i.test(text)) score -= 10_000;
  if (/cookie|privacy policy|sign in|contact sales/i.test(text) && !JOB_TEXT_HINTS.test(text)) score -= 200;
  return score;
}

export function pickBestJobSnapshot(snapshots: PlaywrightPageSnapshot[]): PlaywrightPageSnapshot | null {
  const viable = snapshots.filter((snapshot) => snapshot.text.length >= MIN_RENDERED_JOB_TEXT);
  if (viable.length === 0) return null;
  return [...viable].sort((a, b) => scoreJobSnapshot(b) - scoreJobSnapshot(a))[0] ?? null;
}

async function captureDomSnapshot(
  evaluate: <T>(pageFunction: () => T) => Promise<T>,
): Promise<PlaywrightPageSnapshot> {
  const captured = await evaluate(() => {
    document
      .querySelectorAll(
        "script, style, noscript, nav, footer, header, form, svg, [role='dialog'], [aria-modal='true']",
      )
      .forEach((el) => el.remove());
    const selectors = [
      "main",
      "article",
      '[class*="job"]',
      '[class*="description"]',
      '[class*="position-detail"]',
      '[class*="position_detail"]',
      '[class*="positionDetail"]',
      '[class*="posting"]',
      "body",
    ];
    const candidates = selectors.map((selector) => {
      const el = document.querySelector(selector);
      return (el as HTMLElement | null)?.innerText?.trim() ?? "";
    });
    const text = candidates.sort((a, b) => b.length - a.length)[0] ?? "";
    const title =
      document.querySelector("h1")?.textContent?.trim() ||
      document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
      "";
    const company =
      document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim() || "";
    return { title, company, text, documentTitle: document.title };
  });

  return snapshotFromDomText({
    title: captured.title,
    documentTitle: captured.documentTitle,
    company: captured.company,
    bodyText: captured.text,
  });
}

let browserPromise: Promise<Browser> | null = null;

/** Whether headless Chromium fallback is enabled (default on). Set JOJOBUDDY_PLAYWRIGHT=0 to disable. */
export function playwrightEnabled() {
  const raw = process.env.JOJOBUDDY_PLAYWRIGHT?.trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export function extractJobTextFromInnerText(raw: string) {
  return cleanText(raw).slice(0, 20000);
}

export function pickJobTitle(title: string, documentTitle: string) {
  const fromMeta = title.trim();
  if (fromMeta) return fromMeta;
  return documentTitle.replace(/\s*[|\-–].*$/, "").trim() || "Untitled job";
}

/** Pull readable job text from a rendered DOM snapshot (pure helper for tests). */
export function snapshotFromDomText(input: {
  title?: string;
  documentTitle?: string;
  company?: string;
  bodyText: string;
}): PlaywrightPageSnapshot {
  const text = extractJobTextFromInnerText(input.bodyText);
  return {
    title: pickJobTitle(input.title ?? "", input.documentTitle ?? ""),
    company: (input.company ?? "").trim(),
    text,
  };
}

async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = await import("playwright");
    browserPromise = chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

export async function closePlaywrightBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close().catch(() => undefined);
}

/**
 * Load a job URL in headless Chromium and return visible text after client-side rendering.
 * Returns null when disabled, Chromium is missing, or the page stays empty.
 */
export async function renderJobPageWithPlaywright(
  url: string,
  timeoutMs = 30_000,
): Promise<PlaywrightPageSnapshot | null> {
  if (!playwrightEnabled()) return null;

  let page: Awaited<ReturnType<Browser["newPage"]>> | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(timeoutMs);

    await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
    await page.waitForTimeout(3_000);

    const snapshots: PlaywrightPageSnapshot[] = [];
    for (const frame of page.frames()) {
      try {
        snapshots.push(await captureDomSnapshot((fn) => frame.evaluate(fn)));
      } catch {
        // Ignore frames that are not ready or cannot be evaluated.
      }
    }

    const snapshot = pickBestJobSnapshot(snapshots);
    return snapshot;
  } catch {
    return null;
  } finally {
    await page?.close().catch(() => undefined);
  }
}
