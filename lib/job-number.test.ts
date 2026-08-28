import { describe, expect, it } from "vitest";
import { appleJobNumber, extractOfficialJobNumber } from "@/lib/job-number";

describe("appleJobNumber", () => {
  it("reads jobNumber from Apple details URLs", () => {
    expect(
      appleJobNumber(
        "https://jobs.apple.com/en-ca/details/200678539-3337/software-engineer-observability?team=SFTWR",
      ),
    ).toBe("200678539-3337");
  });

  it("reads position-only ids", () => {
    expect(appleJobNumber("https://jobs.apple.com/en-us/details/200606012")).toBe("200606012");
  });
});

describe("extractOfficialJobNumber", () => {
  it("prefers Apple jobNumber", () => {
    expect(
      extractOfficialJobNumber(
        "https://jobs.apple.com/en-ca/details/200678539-3337/software-engineer-observability",
      ),
    ).toBe("200678539-3337");
  });

  it("extracts LinkedIn ids", () => {
    expect(extractOfficialJobNumber("https://www.linkedin.com/jobs/view/1234567890")).toBe("1234567890");
  });

  it("returns null for pasted jobs without a URL", () => {
    expect(extractOfficialJobNumber(undefined)).toBeNull();
    expect(extractOfficialJobNumber("")).toBeNull();
  });
});
