import { describe, expect, it } from "vitest";
import { buildResumeExportStem } from "@/lib/export-filename";

describe("buildResumeExportStem", () => {
  it("joins name, title, job number, and company", () => {
    expect(
      buildResumeExportStem({
        personName: "Jane Doe",
        jobTitle: "Software Engineer",
        jobNumber: "200678539-3337",
        company: "Apple",
      }),
    ).toBe("Jane Doe - Software Engineer - 200678539-3337 - Apple");
  });

  it("omits job number when missing", () => {
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
        jobNumber: "200678539-3337",
        company: "Acme|Corp",
      }),
    ).toBe("Jane Doe - Engineer Platform - 200678539-3337 - Acme Corp");
  });
});
