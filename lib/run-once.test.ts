import { describe, expect, it } from "vitest";
import { runOnce } from "./run-once";

describe("runOnce", () => {
  it("runs the function a single time for the same key", async () => {
    const key = `once-${Math.random()}`;
    let calls = 0;
    await Promise.all([
      runOnce(key, async () => {
        calls += 1;
      }),
      runOnce(key, async () => {
        calls += 1;
      }),
    ]);
    await runOnce(key, async () => {
      calls += 1;
    });
    expect(calls).toBe(1);
  });

  it("retries after a failure", async () => {
    const key = `retry-${Math.random()}`;
    let calls = 0;
    await expect(
      runOnce(key, async () => {
        calls += 1;
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    await runOnce(key, async () => {
      calls += 1;
    });
    expect(calls).toBe(2);
  });
});
