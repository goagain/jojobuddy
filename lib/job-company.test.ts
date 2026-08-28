import { describe, expect, it } from "vitest";
import { companyNamesEquivalent, normalizeCompanyName } from "@/lib/job-company";
import { resolveJobCompany, resolveJobNumber, resolveJobTitle } from "@/lib/job-fields";

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
    expect(resolveJobCompany({ company: "Snap Inc.", title: "", jobNumber: "", requirements: [], keywords: [], locations: [] }, "SNAP INC")).toBe("Snap");
  });
});

describe("resolveJobNumber", () => {
  it("prefers URL job number over AI", () => {
    expect(
      resolveJobNumber(
        { company: "", title: "", jobNumber: "999", requirements: [], keywords: [], locations: [] },
        "https://jobs.apple.com/en-us/details/200678539-3337/engineer",
      ),
    ).toBe("200678539-3337");
  });
});

describe("resolveJobTitle", () => {
  it("prefers AI title over page fallback", () => {
    expect(
      resolveJobTitle(
        { company: "", title: "Software Engineer", jobNumber: "", requirements: [], keywords: [], locations: [] },
        "Old title",
      ),
    ).toBe("Software Engineer");
  });
});
