import { describe, expect, it } from "vitest";
import { extractJobInsightsHeuristic, normalizeJobInsights } from "@/lib/parse-job";

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
});
