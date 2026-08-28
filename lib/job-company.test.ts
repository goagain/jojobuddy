import { describe, expect, it } from "vitest";
import { companyNamesEquivalent, normalizeCompanyName } from "@/lib/job-company";
import { resolveJobCompany, resolveJobNumber, resolveJobPostedAt, resolveJobTitle } from "@/lib/job-fields";

describe("normalizeCompanyName", () => {
  it("strips common legal suffixes", () => {
    expect(normalizeCompanyName("Snap Inc.")).toBe("Snap");
    expect(normalizeCompanyName("Snap, Inc")).toBe("Snap");
    expect(normalizeCompanyName("Apple Inc.")).toBe("Apple");
    expect(normalizeCompanyName("Acme Corp")).toBe("Acme");
  });

  it("leaves short brand names unchanged", () => {
    expect(normalizeCompanyName("Snap")).toBe("Snap");
    expect(normalizeCompanyName("Apple")).toBe("Apple");
  });
});

describe("companyNamesEquivalent", () => {
  it("treats brand and legal entity as the same", () => {
    expect(companyNamesEquivalent("Snap", "Snap Inc.")).toBe(true);
  });
});

describe("resolveJobCompany", () => {
  it("prefers normalized AI company over adapter fallback", () => {
    expect(resolveJobCompany({ company: "Snap Inc.", title: "", jobNumber: "", postedAt: "", requirements: [], keywords: [], locations: [] }, "SNAP INC")).toBe("Snap");
  });
});

describe("resolveJobNumber", () => {
  it("prefers URL job number over AI", () => {
    expect(
      resolveJobNumber(
        { company: "", title: "", jobNumber: "999", postedAt: "", requirements: [], keywords: [], locations: [] },
        "https://jobs.apple.com/en-us/details/200678539-3337/engineer",
      ),
    ).toBe("200678539-3337");
  });
});

describe("resolveJobPostedAt", () => {
  it("prefers AI date over adapter fallback", () => {
    expect(
      resolveJobPostedAt(
        { company: "", title: "", jobNumber: "", postedAt: "2026-08-17T23:27:58.952Z", requirements: [], keywords: [], locations: [] },
        "2024-01-01T00:00:00.000Z",
      ),
    ).toBe("2026-08-17T23:27:58.952Z");
  });
});

describe("resolveJobTitle", () => {
  it("prefers AI title over page fallback", () => {
    expect(
      resolveJobTitle(
        { company: "", title: "Software Engineer", jobNumber: "", postedAt: "", requirements: [], keywords: [], locations: [] },
        "Old title",
      ),
    ).toBe("Software Engineer");
  });
});
