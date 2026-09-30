import { describe, expect, it } from "vitest";
import type { LlmRuntime } from "@/lib/llm-types";
import type { MasterResume } from "@/lib/schema";
import { compactResume, parseFitScores, scoreBoardListings } from "@/lib/job-boards/fit";
import type { StoredBoardListing } from "@/lib/job-boards/types";

const runtime: LlmRuntime = {
  providerId: "p",
  providerName: "OpenAI",
  kind: "openai",
  modelId: "gpt-test",
  modelLabel: "test",
  baseUrl: "https://example.com/v1",
  apiKey: "test",
};

function listing(id: string, title: string): StoredBoardListing {
  return {
    id,
    title,
    url: `https://jobs.ashbyhq.com/openai/${id}`,
    family: "Applied AI Engineering",
    location: "San Francisco",
    level: "senior",
    roleFamily: "engineer",
    excerpt: "Build distributed systems.",
    facets: {},
  };
}

describe("fit scores", () => {
  it("keeps known ids and clamps the score", () => {
    const scores = parseFitScores(
      {
        scores: [
          { id: "keep", score: 140, reason: "Already does this work." },
          { id: "drop", score: 10, reason: "Unknown job" },
          { id: "low", score: -4, reason: "No overlap." },
        ],
      },
      new Set(["keep", "low"]),
    );
    expect(scores).toEqual([
      { id: "keep", score: 100, reason: "Already does this work." },
      { id: "low", score: 0, reason: "No overlap." },
    ]);
  });

  it("asks the model once per batch and stores the returned scores", async () => {
    const calls: string[] = [];
    const scored = await scoreBoardListings({
      resume: {
        identity: { name: "Ada", email: "ada@example.com", headline: "Backend engineer", summary: "Kubernetes", links: [] },
        skills: [{ category: "Infra", items: ["Kubernetes", "Go"] }],
        experiences: [],
        projects: [],
        education: [],
        certifications: [],
        languages: [],
        softSkills: [],
      } as MasterResume,
      listings: [listing("eng-new1", "Senior Software Engineer"), listing("sales-01", "Account Executive")],
      runtime,
      batchSize: 1,
      chatImpl: async (messages) => {
        const user = messages.find((message) => message.role === "user")?.content ?? "";
        calls.push(user);
        const id = user.match(/id: (\S+)/)?.[1];
        const score = id === "eng-new1" ? 94 : 22;
        return JSON.stringify({ scores: [{ id, score, reason: id === "eng-new1" ? "Backend match." : "Sales." }] });
      },
    });
    expect(calls).toHaveLength(2);
    expect(scored.map((item) => item.fitScore)).toEqual([94, 22]);
    expect(scored[0]?.fitReason).toBe("Backend match.");
    expect(
      compactResume({
        identity: { name: "", email: "", headline: "Backend engineer", links: [] },
        skills: [],
        experiences: [],
        projects: [],
        education: [],
        certifications: [],
        languages: [],
        softSkills: [],
      } as MasterResume),
    ).toContain("Backend engineer");
  });

  it("refuses the mock model", async () => {
    await expect(
      scoreBoardListings({
        resume: {
          identity: { name: "", email: "", links: [] },
          skills: [],
          experiences: [],
          projects: [],
          education: [],
          certifications: [],
          languages: [],
          softSkills: [],
        } as MasterResume,
        listings: [listing("eng-new1", "Engineer")],
        runtime: { ...runtime, kind: "mock" },
      }),
    ).rejects.toThrow(/real parse model/);
  });
});
