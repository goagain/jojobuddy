import { describe, expect, it } from "vitest";
import { isInvalidJobFetchError } from "@/lib/refresh-jobs";

describe("isInvalidJobFetchError", () => {
  it("treats 404/410 fetch failures as invalid", () => {
    expect(isInvalidJobFetchError(new Error("Fetch failed (404)"))).toBe(true);
    expect(isInvalidJobFetchError(new Error("Fetch failed (410)"))).toBe(true);
  });

  it("treats empty pages and bad URLs as invalid", () => {
    expect(
      isInvalidJobFetchError(
        new Error(
          "Almost no readable text on the page. Some ATS sites hide JD text in front-end JSON.",
        ),
      ),
    ).toBe(true);
    expect(isInvalidJobFetchError(new Error("Invalid URL"))).toBe(true);
  });

  it("does not treat transient server errors as invalid", () => {
    expect(isInvalidJobFetchError(new Error("Fetch failed (502)"))).toBe(false);
    expect(isInvalidJobFetchError(new Error("Fetch failed (503)"))).toBe(false);
    expect(isInvalidJobFetchError(new Error("network timeout"))).toBe(false);
  });
});
