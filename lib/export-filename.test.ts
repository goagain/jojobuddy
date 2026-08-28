import { describe, expect, it } from "vitest";
import { buildResumeExportStem } from "@/lib/export-filename";

describe("buildResumeExportStem", () => {
  it("joins name, title, job id, and company", () => {
    expect(
      buildResumeExportStem({
        personName: "Jane Doe",
        jobTitle: "Software Engineer",
        jobId: "674a1b2c3d4e5f6789012345",
        company: "Acme Corp",
      }),
    ).toBe("Jane Doe - Software Engineer - 674a1b2c3d4e5f6789012345 - Acme Corp");
  });

  it("omits job id when missing", () => {
    expect(
      buildResumeExportStem({
        personName: "Jane Doe",
        jobTitle: "Software Engineer",
        company: "Acme Corp",
      }),
    ).toBe("Jane Doe - Software Engineer - Acme Corp");
  });

  it("sanitizes invalid filename characters", () => {
    expect(
      buildResumeExportStem({
        personName: "Jane/Doe",
        jobTitle: "Engineer: Platform",
        jobId: "abc123",
        company: "Acme|Corp",
      }),
    ).toBe("Jane Doe - Engineer Platform - abc123 - Acme Corp");
  });
});
