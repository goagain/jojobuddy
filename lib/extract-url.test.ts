import { describe, expect, it } from "vitest";
import { pickJobTextFromHtml } from "@/lib/job-adapters/text";
import { describeFetchError, isBotBlockedFetchStatus, locationFromJobText } from "@/lib/extract-url";
import * as cheerio from "cheerio";

describe("pickJobTextFromHtml", () => {
  it("prefers body when main is an empty shell", () => {
    const html = `<html><body><main></main><div class="job-body">${"Role overview. ".repeat(40)}</div></body></html>`;
    const $ = cheerio.load(html);
    expect(pickJobTextFromHtml($).length).toBeGreaterThan(200);
  });
});

describe("isBotBlockedFetchStatus", () => {
  it("flags common bot-wall statuses", () => {
    expect(isBotBlockedFetchStatus(401)).toBe(true);
    expect(isBotBlockedFetchStatus(403)).toBe(true);
    expect(isBotBlockedFetchStatus(429)).toBe(true);
  });

  it("does not flag missing pages or server errors", () => {
    expect(isBotBlockedFetchStatus(404)).toBe(false);
    expect(isBotBlockedFetchStatus(410)).toBe(false);
    expect(isBotBlockedFetchStatus(502)).toBe(false);
  });
});

describe("describeFetchError", () => {
  it("explains TLS altname mismatch", () => {
    const error = new Error("fetch failed", {
      cause: Object.assign(new Error("Hostname/IP does not match certificate's altnames"), {
        code: "ERR_TLS_CERT_ALTNAME_INVALID",
      }),
    });
    expect(describeFetchError(error)).toMatch(/TLS certificate mismatch/);
    expect(describeFetchError(error)).toMatch(/Local DNS/);
  });

  it("includes errno codes when present", () => {
    const error = new Error("fetch failed", {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }),
    });
    expect(describeFetchError(error)).toContain("ENOTFOUND");
  });
});

describe("locationFromJobText", () => {
  it("reads Location line from parsed job text", () => {
    const text = [
      "Software Engineer - Observability",
      "",
      "Company: Apple",
      "Location: Seattle, Washington, United States",
      "Team: Software and Services",
    ].join("\n");
    expect(locationFromJobText(text)).toBe("Seattle, Washington, United States");
  });

  it("returns empty when no Location line", () => {
    expect(locationFromJobText("Title\n\nCompany: Acme\n\nDescription")).toBe("");
  });
});
