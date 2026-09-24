import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeFiles = [
  "lib/auth.ts",
  "lib/entity-store.ts",
  "lib/work-store.ts",
  "lib/craft-store.ts",
  "lib/llm-store.ts",
  "worker/index.ts",
];

const calls = [
  "await ensureAuthIndexes()",
  "await ensureWorkIndexes()",
  "await ensureEntityIndexes()",
  "await ensureCraftIndexes()",
  "await ensureIndexes()",
];

describe("index creation ownership", () => {
  it("web and worker runtime paths do not create indexes", () => {
    for (const file of runtimeFiles) {
      const source = readFileSync(file, "utf8");
      for (const call of calls) {
        expect(source, `${file} must not ${call}`).not.toContain(call);
      }
    }
  });

  it("migrate is the only runner that creates indexes", () => {
    const source = readFileSync("lib/migrate.ts", "utf8");
    expect(source).toContain("ensureAuthIndexes()");
    expect(source).toContain("ensureWorkIndexes()");
    expect(source).toContain("ensureEntityIndexes()");
    expect(source).toContain("ensureCraftIndexes()");
    expect(source).toContain("ensureLlmIndexes()");
  });
});
