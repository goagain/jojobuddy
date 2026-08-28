import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTikTokJobPayload, tikTokPositionId } from "@/lib/job-adapters/tiktok";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

describe("tikTokPositionId", () => {
  it("reads position id from referral detail URLs", () => {
    expect(
      tikTokPositionId(
        "https://lifeattiktok.com/referral/tiktok/position/7613184212766607621/detail?token=abc",
      ),
    ).toBe("7613184212766607621");
  });

  it("returns null for unrelated hosts", () => {
    expect(tikTokPositionId("https://jobs.apple.com/en-us/details/200606012")).toBeNull();
  });
});

describe("parseTikTokJobPayload", () => {
  it("extracts title, location, description, and requirements", () => {
    const body = readFileSync(join(fixtureDir, "tiktok-job-post.fixture.json"), "utf8");
    const parsed = parseTikTokJobPayload(body);
    expect(parsed?.title).toBe("Software Engineer, TikTok AIGC Agentic Workflow");
    expect(parsed?.company).toBe("TikTok");
    expect(parsed?.location).toBe("San Jose");
    expect(parsed?.text).toContain("Description");
    expect(parsed?.text).toContain("AIGC and effects submission pipelines");
    expect(parsed?.text).toContain("Requirements");
    expect(parsed?.text).toContain("Minimum Qualification");
  });
});
