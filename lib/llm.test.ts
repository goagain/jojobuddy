import { afterEach, describe, expect, it, vi } from "vitest";
import { chat, extractJsonObject, usesMaxCompletionTokens } from "@/lib/llm";
import type { LlmRuntime } from "@/lib/llm-types";

function runtime(partial: Partial<LlmRuntime> & Pick<LlmRuntime, "kind" | "modelId">): LlmRuntime {
  return {
    providerId: "p1",
    providerName: partial.providerName ?? "Test",
    kind: partial.kind,
    modelId: partial.modelId,
    modelLabel: partial.modelLabel ?? partial.modelId,
    baseUrl: partial.baseUrl ?? "https://api.openai.com/v1",
    apiKey: partial.apiKey ?? "sk-test",
  };
}

describe("usesMaxCompletionTokens", () => {
  it("always true for official openai kind", () => {
    expect(usesMaxCompletionTokens("openai", "gpt-4o")).toBe(true);
    expect(usesMaxCompletionTokens("openai", "gpt-3.5-turbo")).toBe(true);
  });

  it("detects newer models on openai_compatible gateways", () => {
    expect(usesMaxCompletionTokens("openai_compatible", "gpt-5-mini")).toBe(true);
    expect(usesMaxCompletionTokens("openai_compatible", "GPT-5")).toBe(true);
    expect(usesMaxCompletionTokens("openai_compatible", "o3-mini")).toBe(true);
    expect(usesMaxCompletionTokens("openai_compatible", "gpt-4.1")).toBe(true);
    expect(usesMaxCompletionTokens("openai_compatible", "openai/gpt-5-mini")).toBe(true);
  });

  it("keeps max_tokens for classic compatible models", () => {
    expect(usesMaxCompletionTokens("openai_compatible", "gpt-4o")).toBe(false);
    expect(usesMaxCompletionTokens("openai_compatible", "deepseek-chat")).toBe(false);
    expect(usesMaxCompletionTokens("openai_compatible", "qwen2.5")).toBe(false);
  });
});

describe("chat OpenAI body", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubOk(content = "{}") {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        ({
          ok: true,
          json: async () => ({ choices: [{ message: { content } }] }),
          text: async () => "",
        }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function requestBody(fetchMock: ReturnType<typeof stubOk>) {
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    return JSON.parse(String(init?.body)) as Record<string, unknown>;
  }

  it("sends max_completion_tokens=10000 for openai kind and omits temperature", async () => {
    const fetchMock = stubOk('{"ok":true}');
    await chat({
      runtime: runtime({ kind: "openai", modelId: "gpt-5-mini" }),
      json: true,
      messages: [{ role: "user", content: "hi" }],
    });

    const body = requestBody(fetchMock);
    expect(body.max_completion_tokens).toBe(10000);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("sends max_tokens=10000 for classic openai_compatible models and omits temperature", async () => {
    const fetchMock = stubOk("{}");
    await chat({
      runtime: runtime({
        kind: "openai_compatible",
        modelId: "deepseek-chat",
        baseUrl: "https://api.deepseek.com",
      }),
      messages: [{ role: "user", content: "hi" }],
    });

    const body = requestBody(fetchMock);
    expect(body.max_tokens).toBe(10000);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it("sends max_completion_tokens on compatible gateways for gpt-5", async () => {
    const fetchMock = stubOk("{}");
    await chat({
      runtime: runtime({
        kind: "openai_compatible",
        modelId: "openai/gpt-5-mini",
        baseUrl: "https://openrouter.ai/api/v1",
      }),
      messages: [{ role: "user", content: "hi" }],
    });

    const body = requestBody(fetchMock);
    expect(body.max_completion_tokens).toBe(10000);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it("surfaces provider errors with truncated detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => `{"error":{"message":"${"x".repeat(500)}"}}`,
        json: async () => ({}),
      })),
    );

    await expect(
      chat({
        runtime: runtime({ kind: "openai", modelId: "gpt-5-mini", providerName: "OpenAI" }),
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow(/OpenAI failed \(400\):/);
  });
});

describe("extractJsonObject", () => {
  it("parses fenced and raw JSON objects", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('prefix {"b":2} suffix')).toEqual({ b: 2 });
  });

  it("throws when no object is present", () => {
    expect(() => extractJsonObject("no json here")).toThrow(/parseable JSON/);
  });
});
