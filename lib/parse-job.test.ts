import { describe, expect, it } from "vitest";
import { extractJobInsightsHeuristic, normalizeJobInsights } from "@/lib/parse-job";
import { formatJobLocations, resolveJobLocation } from "@/lib/job-location";

describe("extractJobInsightsHeuristic", () => {
  it("extracts Apple-style qualification sections", () => {
    const text = [
      "Software Engineer - Observability",
      "",
      "Company: Apple",
      "",
      "Summary",
      "Build observability tools.",
      "",
      "Minimum Qualifications",
      "BS in CS or equivalent experience",
      "5+ years backend development in Go or Rust",
      "",
      "Preferred Qualifications",
      "Experience with Prometheus and Kubernetes",
      "Familiarity with OpenTelemetry",
    ].join("\n");

    const { requirements, keywords } = extractJobInsightsHeuristic(text);
    expect(requirements.some((item) => /BS in CS/i.test(item))).toBe(true);
    expect(requirements.some((item) => /Prometheus/i.test(item))).toBe(true);
    expect(keywords.map((item) => item.toLowerCase())).toEqual(
      expect.arrayContaining(["prometheus", "kubernetes", "opentelemetry", "go", "rust"]),
    );
  });

  it("falls back to description bullets when no qualification section exists", () => {
    const text = [
      "Backend Engineer",
      "",
      "Description",
      "Design APIs in Go on Kubernetes",
      "Improve CI/CD pipelines with Terraform",
    ].join("\n");

    const { requirements, keywords } = extractJobInsightsHeuristic(text);
    expect(requirements.length).toBeGreaterThan(0);
    expect(keywords.map((item) => item.toLowerCase())).toEqual(
      expect.arrayContaining(["go", "kubernetes", "terraform", "ci/cd"]),
    );
  });

  it("extracts cities from Location lines", () => {
    const text = [
      "Backend Engineer",
      "Company: Example Corp",
      "",
      "Location: Austin, Texas, United States / Seattle, Washington, United States",
      "",
      "Minimum Qualifications",
      "5+ years experience with distributed systems",
    ].join("\n");

    const { locations } = extractJobInsightsHeuristic(text);
    expect(locations).toEqual(["Austin", "Seattle"]);
  });
});

describe("normalizeJobInsights", () => {
  it("normalizes AI location output to city names", () => {
    const insights = normalizeJobInsights({
      requirements: ["Go experience"],
      keywords: ["kubernetes"],
      locations: [
        "Seattle, Washington, United States",
        "Austin, Texas",
        "Seattle",
      ],
    });
    expect(insights.locations).toEqual(["Seattle", "Austin"]);
    expect(formatJobLocations(insights.locations)).toBe("Seattle / Austin");
  });
});

describe("resolveJobLocation", () => {
  it("prefers AI cities over adapter fallback", () => {
    expect(
      resolveJobLocation(
        { locations: ["Denver", "Austin"] },
        "Seattle, Washington, United States",
      ),
    ).toBe("Denver / Austin");
  });

  it("falls back to adapter location when AI returns none", () => {
    expect(
      resolveJobLocation(
        { locations: [] },
        "Seattle, Washington, United States / Austin, Texas",
      ),
    ).toBe("Seattle / Austin");
  });
});
