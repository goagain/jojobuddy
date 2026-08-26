import { describe, expect, it } from "vitest";
import { describeFetchError } from "@/lib/extract-url";

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
