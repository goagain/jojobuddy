import { describe, expect, it } from "vitest";
import { describeFetchError, locationFromJobText } from "@/lib/extract-url";

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
