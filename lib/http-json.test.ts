import { describe, expect, it } from "vitest";
import { htmlJsonError, readResponseJson } from "@/lib/http-json";

describe("readResponseJson", () => {
  it("parses JSON bodies", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    await expect(readResponseJson(response)).resolves.toEqual({ ok: true });
  });

  it("explains HTML error pages", async () => {
    const response = new Response("<!DOCTYPE html><html><body>login</body></html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });
    await expect(readResponseJson(response, "OpenAI")).rejects.toThrow(/HTML page[\s\S]*base URL/);
  });
});

describe("htmlJsonError", () => {
  it("detects doctype pages", () => {
    expect(htmlJsonError("API", 200, "<!DOCTYPE html><html></html>").message).toMatch(/HTML page/);
  });
});
