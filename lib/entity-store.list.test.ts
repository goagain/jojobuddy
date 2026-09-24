import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const { profileAggregate, jobAggregate } = vi.hoisted(() => ({
  profileAggregate: vi.fn(),
  jobAggregate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({
    collection: (name: string) => {
      if (name === "profiles") {
        return {
          aggregate: (pipeline: unknown[]) => {
            profileAggregate(pipeline);
            return {
              toArray: async () => [
                {
                  _id: new ObjectId("64a000000000000000000001"),
                  name: "主档案",
                  personName: "张三",
                  headline: "工程师",
                  experienceCount: 3,
                  sourceCount: 2,
                  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
                },
              ],
            };
          },
        };
      }
      if (name === "job_descriptions") {
        return {
          aggregate: (pipeline: unknown[]) => {
            jobAggregate(pipeline);
            return {
              toArray: async () => [
                {
                  _id: new ObjectId("64a000000000000000000002"),
                  title: "Backend",
                  company: "Acme",
                  location: "Remote",
                  jobNumber: "J-1",
                  sourceKind: "paste",
                  excerptSource: "Need Node and Mongo experience ".repeat(20),
                  createdAt: new Date("2026-01-01T00:00:00.000Z"),
                  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
                },
              ],
            };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  })),
}));

vi.mock("@/lib/craft-store", () => ({
  deleteCraftsForProfile: vi.fn(),
  deleteCraftsForJob: vi.fn(),
  deleteCraftsForJobs: vi.fn(),
}));

describe("list summaries stay projected", () => {
  beforeEach(() => {
    profileAggregate.mockClear();
    jobAggregate.mockClear();
  });

  it("listProfiles aggregates identity counts instead of loading full resumes", async () => {
    const { listProfiles } = await import("./entity-store");
    const profiles = await listProfiles("user-1");

    expect(profileAggregate).toHaveBeenCalledTimes(1);
    const pipeline = profileAggregate.mock.calls[0][0] as Record<string, unknown>[];
    expect(pipeline[0]).toEqual({ $match: { userId: "user-1" } });
    expect(pipeline[1]).toEqual({ $sort: { updatedAt: -1 } });
    const project = pipeline[2].$project as Record<string, unknown>;
    expect(project.resume).toBeUndefined();
    expect(project.sources).toBeUndefined();
    expect(project.personName).toBe("$resume.identity.name");
    expect(project.experienceCount).toEqual({ $size: { $ifNull: ["$resume.experiences", []] } });

    expect(profiles).toEqual([
      {
        id: "64a000000000000000000001",
        name: "主档案",
        personName: "张三",
        headline: "工程师",
        experienceCount: 3,
        sourceCount: 2,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });

  it("listJobs projects a short excerpt instead of full job text", async () => {
    const { listJobs } = await import("./entity-store");
    const jobs = await listJobs("user-1");

    expect(jobAggregate).toHaveBeenCalledTimes(1);
    const pipeline = jobAggregate.mock.calls[0][0] as Record<string, unknown>[];
    const project = pipeline[2].$project as Record<string, unknown>;
    expect(project.sourceText).toBeUndefined();
    expect(project.parsedText).toBeUndefined();
    expect(JSON.stringify(project.excerptSource)).toContain("$substrCP");

    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("64a000000000000000000002");
    expect(jobs[0].title).toBe("Backend");
    expect(jobs[0].excerpt.length).toBeLessThanOrEqual(161);
    expect(jobs[0].excerpt.endsWith("…")).toBe(true);
  });
});
