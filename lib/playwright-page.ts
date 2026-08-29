import type { Browser } from "playwright";
import { cleanText } from "./job-adapters/text";

export type PlaywrightPageSnapshot = {
  title: string;
  company: string;
  text: string;
};

/** Minimum visible JD length to treat Playwright render as successful. */
export const MIN_RENDERED_JOB_TEXT = 200;

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
    await page
      .waitForFunction(
        () => (document.body?.innerText?.replace(/\s+/g, " ").trim().length ?? 0) > 400,
        { timeout: 12_000 },
      )
      .catch(async () => {
        await page!.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
        await page!.waitForTimeout(2_000);
      });

    const captured = await page.evaluate(() => {
      document
        .querySelectorAll(
          "script, style, noscript, nav, footer, header, iframe, form, svg, [role='dialog'], [aria-modal='true']",
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

    const snapshot = snapshotFromDomText({
      title: captured.title,
      documentTitle: captured.documentTitle,
      company: captured.company,
      bodyText: captured.text,
    });
    return snapshot.text.length >= MIN_RENDERED_JOB_TEXT ? snapshot : null;
  } catch {
    return null;
  } finally {
    await page?.close().catch(() => undefined);
  }
}
