import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migrate entry", () => {
  it("does not use top-level await so tsx can run it as cjs in Docker", () => {
    const source = readFileSync("scripts/migrate.ts", "utf8");
    expect(source).toMatch(/async function main\(/);
    expect(source).toMatch(/void main\(\)/);
    expect(source).not.toMatch(/^await /m);
  });
});
