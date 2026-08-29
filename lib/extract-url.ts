import { lookup, Resolver } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { fetchViaJobAdapters } from "./job-adapters";
import { cleanText, htmlToText } from "./job-adapters/text";
import { normalizePostedAt } from "./parse-posted-at";
import { renderJobPageWithPlaywright } from "./playwright-page";

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);
const PUBLIC_DNS_SERVERS = ["1.1.1.1", "8.8.8.8"];

function isPrivateIp(ip: string) {
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) {
    return true;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https job URLs are supported");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("This address cannot be fetched");
  }
  if (isIP(host) && isPrivateIp(host)) {
    throw new Error("This address cannot be fetched");
  }
  if (!isIP(host)) {
    const records = await lookup(host, { all: true });
    if (records.some((record) => isPrivateIp(record.address))) {
      throw new Error("This address cannot be fetched");
    }
  }
  return url;
}

export function locationFromJobText(text: string): string {
  const match = text.match(/^Location:\s*(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function formatJobLocation(jobLocation: unknown): string {
  if (!jobLocation) return "";
  const items = Array.isArray(jobLocation) ? jobLocation : [jobLocation];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const loc = item as {
        address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string };
        name?: string;
      };
      if (loc.address) {
        return [loc.address.addressLocality, loc.address.addressRegion, loc.address.addressCountry]
          .filter(Boolean)
          .join(", ");
      }
      return loc.name ?? "";
    })
    .filter(Boolean)
    .join(" / ");
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** HTTP statuses where a headless browser may succeed after plain fetch is blocked. */
export function isBotBlockedFetchStatus(status: number) {
  return status === 401 || status === 403 || status === 429;
}

export function describeFetchError(error: unknown): string {
  const err = error instanceof Error ? error : new Error(String(error));
  const cause = (err as Error & { cause?: NodeJS.ErrnoException }).cause;
  const code = cause?.code ?? (err as NodeJS.ErrnoException).code;
  const reason = cause?.message ?? err.message;
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID" || /certificate|altnames/i.test(reason)) {
    return `TLS certificate mismatch (${reason}). Local DNS may be resolving the host to the wrong IP.`;
  }
  if (code) return `${reason} [${code}]`;
  return reason || "fetch failed";
}

async function resolvePublicIpv4(hostname: string): Promise<string[]> {
  const resolver = new Resolver();
  resolver.setServers(PUBLIC_DNS_SERVERS);
  const ips = await resolver.resolve4(hostname);
  return ips.filter((ip) => !isPrivateIp(ip));
}

function httpsGetViaIp(
  url: URL,
  ip: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: "https:",
        hostname: ip,
        servername: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { ...headers, Host: url.hostname },
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Request timed out"));
    });
    req.end();
  });
}

async function fetchText(url: URL, headers: Record<string, string> = BROWSER_HEADERS): Promise<{
  status: number;
  body: string;
}> {
  try {
    const response = await fetch(url, { redirect: "follow", headers });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    if (url.protocol !== "https:" || isIP(url.hostname)) {
      throw new Error(`Cannot fetch ${url.hostname}: ${describeFetchError(error)}`);
    }

    // Broken local DNS (e.g. UniFi) can point a host at the wrong CDN IP → TLS altname errors.
    let ips: string[];
    try {
      ips = await resolvePublicIpv4(url.hostname);
    } catch {
      throw new Error(`Cannot fetch ${url.hostname}: ${describeFetchError(error)}`);
    }
    if (ips.length === 0) {
      throw new Error(`Cannot fetch ${url.hostname}: ${describeFetchError(error)}`);
    }

    let lastError: unknown = error;
    for (const ip of ips.slice(0, 3)) {
      try {
        return await httpsGetViaIp(url, ip, headers);
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }
    throw new Error(`Cannot fetch ${url.hostname}: ${describeFetchError(lastError)}`);
  }
}

function extractJsonLdJob($: cheerio.CheerioAPI): {
  title: string;
  company: string;
  location: string;
  text: string;
  postedAt?: string;
} | null {
  const blocks: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      blocks.push(JSON.parse($(el).contents().text()));
    } catch {
      // ignore broken json-ld
    }
  });

  const flat = blocks.flatMap((block) => {
    if (Array.isArray(block)) return block;
    if (block && typeof block === "object" && "@graph" in block) {
      const graph = (block as Record<string, unknown>)["@graph"];
      return Array.isArray(graph) ? graph : [block];
    }
    return [block];
  });

  const posting = flat.find((item) => {
    if (!item || typeof item !== "object") return false;
    const type = String((item as { "@type"?: unknown })["@type"] ?? "");
    return type.toLowerCase().includes("jobposting");
  }) as
    | {
        title?: string;
        description?: string;
        datePosted?: string;
        hiringOrganization?: { name?: string } | string;
        jobLocation?: unknown;
      }
    | undefined;

  if (!posting) return null;
  const company =
    typeof posting.hiringOrganization === "string"
      ? posting.hiringOrganization
      : posting.hiringOrganization?.name ?? "";
  const description = htmlToText(String(posting.description ?? ""));
  if (description.length < 40) return null;
  const place = formatJobLocation(posting.jobLocation);
  const text = [`${posting.title ?? ""}`, company && `Company: ${company}`, place && `Location: ${place}`, description]
    .filter(Boolean)
    .join("\n\n");
  return {
    title: posting.title ?? "Job",
    company,
    location: place,
    text,
    postedAt: normalizePostedAt(posting.datePosted),
  };
}

async function fetchJobPageViaPlaywright(
  url: URL,
  companyFallback = "",
  postedAt?: string,
): Promise<{
  url: string;
  title: string;
  company: string;
  location: string;
  text: string;
  postedAt?: string;
} | null> {
  const playwrightPage = await renderJobPageWithPlaywright(url.toString());
  if (!playwrightPage || playwrightPage.text.length < 40) return null;
  return {
    url: url.toString(),
    title: playwrightPage.title,
    company: playwrightPage.company || companyFallback,
    location: locationFromJobText(playwrightPage.text),
    text: playwrightPage.text,
    postedAt,
  };
}

export async function fetchJobPage(rawUrl: string): Promise<{
  url: string;
  title: string;
  company: string;
  location: string;
  text: string;
  postedAt?: string;
}> {
  const url = await assertPublicHttpUrl(rawUrl);

  const adapted = await fetchViaJobAdapters(url, fetchText);
  if (adapted) {
    return {
      url: adapted.canonicalUrl ?? url.toString(),
      title: adapted.title,
      company: adapted.company,
      location: adapted.location,
      text: adapted.text,
      postedAt: adapted.postedAt,
    };
  }

  const { status, body: html } = await fetchText(url);
  if (status < 200 || status >= 300) {
    if (isBotBlockedFetchStatus(status)) {
      const playwrightPage = await fetchJobPageViaPlaywright(url);
      if (playwrightPage) return playwrightPage;
    }
    throw new Error(`Fetch failed (${status})`);
  }
  const $ = cheerio.load(html);

  const jsonLd = extractJsonLdJob($);
  if (jsonLd) {
    return { url: url.toString(), ...jsonLd };
  }

  const metaPostedAt = normalizePostedAt(
    $('meta[property="article:published_time"]').attr("content") ||
      $('meta[name="date"]').attr("content") ||
      $("time[datetime]").first().attr("datetime"),
  );

  const companyFallback = $('meta[property="og:site_name"]').attr("content")?.trim() || "";
  try {
    const playwrightPage = await fetchJobPageViaPlaywright(url, companyFallback, metaPostedAt);
    if (playwrightPage) return playwrightPage;
  } catch {
    // Fall back to static extraction if Playwright fails
  }

  $("script, style, noscript, svg, nav, footer, header, iframe, form").remove();

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").text().replace(/\s*[|\-–].*$/, "").trim();

  const company =
    $('meta[property="og:site_name"]').attr("content")?.trim() ||
    $('[class*="company"]').first().text().trim().slice(0, 80);

  const main = $("main, article, [class*='job'], [class*='description']").first();
  const body = (main.length ? main.text() : $("body").text()) || $.root().text();
  const text = cleanText(body).slice(0, 20000);

  if (text.length < 40) {
    throw new Error(
      "Almost no readable text on the page. Some ATS sites hide JD text in front-end JSON. Paste the JD or try a URL that shows the body.",
    );
  }

  return {
    url: url.toString(),
    title: title || "Untitled job",
    company: company || "",
    location: locationFromJobText(text),
    text,
    postedAt: metaPostedAt,
  };
}
