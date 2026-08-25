import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { runPageInJsEngine } from "./js-engine";

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

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

function cleanText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToText(html: string) {
  const $ = cheerio.load(`<div>${html}</div>`);
  $("script, style").remove();
  return cleanText($.root().text());
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json",
};

async function fetchAppleJob(url: URL): Promise<{
  title: string;
  company: string;
  text: string;
} | null> {
  const match = url.pathname.match(/\/details\/(\d+(?:-\d+)?)/i);
  if (!url.hostname.endsWith("apple.com") || !match) return null;

  const response = await fetch(`https://jobs.apple.com/api/v1/jobDetails/${match[1]}`, {
    headers: BROWSER_HEADERS,
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    res?: Record<string, unknown>;
  };
  const job = payload.res;
  if (!job) return null;

  const title = String(job.postingTitle ?? "");
  const locations = Array.isArray(job.locations)
    ? job.locations
        .map((item) => {
          const loc = item as { name?: string; city?: string; stateProvince?: string; countryName?: string };
          return [loc.city || loc.name, loc.stateProvince, loc.countryName].filter(Boolean).join(", ");
        })
        .filter(Boolean)
        .join(" / ")
    : "";
  const teams = Array.isArray(job.teamNames) ? job.teamNames.map(String).join(", ") : "";
  const level = [job.lowJobTitle, job.highJobTitle].filter(Boolean).map(String).join(" – ");

  const sections = [
    title,
    ["Company: Apple", locations && `Location: ${locations}`, teams && `Team: ${teams}`, level && `Level: ${level}`]
      .filter(Boolean)
      .join("\n"),
    job.jobSummary && `Summary\n${htmlToText(String(job.jobSummary))}`,
    job.description && `Description\n${htmlToText(String(job.description))}`,
    job.minimumQualifications &&
      `Minimum Qualifications\n${htmlToText(String(job.minimumQualifications))}`,
    job.preferredQualifications &&
      `Preferred Qualifications\n${htmlToText(String(job.preferredQualifications))}`,
  ].filter(Boolean);

  const text = sections.join("\n\n").trim();
  if (text.length < 40) return null;
  return { title: title || "Apple job", company: "Apple", text };
}

function extractJsonLdJob($: cheerio.CheerioAPI): {
  title: string;
  company: string;
  text: string;
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
        hiringOrganization?: { name?: string } | string;
        jobLocation?: { address?: { addressLocality?: string; addressRegion?: string } };
      }
    | undefined;

  if (!posting) return null;
  const company =
    typeof posting.hiringOrganization === "string"
      ? posting.hiringOrganization
      : posting.hiringOrganization?.name ?? "";
  const description = htmlToText(String(posting.description ?? ""));
  if (description.length < 40) return null;
  const loc = posting.jobLocation?.address;
  const place = [loc?.addressLocality, loc?.addressRegion].filter(Boolean).join(", ");
  const text = [`${posting.title ?? ""}`, company && `Company: ${company}`, place && `Location: ${place}`, description]
    .filter(Boolean)
    .join("\n\n");
  return { title: posting.title ?? "Job", company, text };
}

export async function fetchJobPage(rawUrl: string): Promise<{
  url: string;
  title: string;
  company: string;
  text: string;
}> {
  const url = await assertPublicHttpUrl(rawUrl);

  const apple = await fetchAppleJob(url);
  if (apple) {
    return { url: url.toString(), ...apple };
  }

  const response = await fetch(url, {
    redirect: "follow",
    headers: BROWSER_HEADERS,
  });
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status})`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  const jsonLd = extractJsonLdJob($);
  if (jsonLd) {
    return { url: url.toString(), ...jsonLd };
  }

  try {
    const rendered = await runPageInJsEngine(html, url.toString());
    if (rendered.text.length >= 40) {
      return {
        url: url.toString(),
        title: rendered.title,
        company:
          rendered.company ||
          $('meta[property="og:site_name"]').attr("content")?.trim() ||
          "",
        text: rendered.text,
      };
    }
  } catch {
    // Fall back to static extraction if JS engine fails
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
    text,
  };
}
