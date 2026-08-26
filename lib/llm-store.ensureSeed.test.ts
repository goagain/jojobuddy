import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

type ProviderDoc = {
  _id: ObjectId;
  userId: string;
  name: string;
  kind: string;
  baseUrl: string;
  apiKey: string;
  scope?: "global" | "personal";
  createdAt: Date;
  updatedAt: Date;
};

type ModelDoc = {
  _id: ObjectId;
  userId: string;
  providerId: string;
  label: string;
  modelId: string;
  scope?: "global" | "personal";
  createdAt: Date;
};

const providerDocs: ProviderDoc[] = [];
const modelDocs: ModelDoc[] = [];

function sameId(left: unknown, right: unknown) {
  if (left instanceof ObjectId && right instanceof ObjectId) {
    return left.equals(right);
  }
  return left === right;
}

function matchesValue(docValue: unknown, expected: unknown): boolean {
  if (expected && typeof expected === "object" && !(expected instanceof ObjectId) && !Array.isArray(expected)) {
    const ops = expected as Record<string, unknown>;
    if ("$ne" in ops) return !sameId(docValue, ops.$ne) && docValue !== ops.$ne;
    if ("$in" in ops && Array.isArray(ops.$in)) {
      return ops.$in.some((item) => sameId(docValue, item));
    }
    if ("$exists" in ops) {
      const exists = docValue !== undefined;
      return ops.$exists ? exists : !exists;
    }
    if ("$gt" in ops && docValue instanceof Date && ops.$gt instanceof Date) {
      return docValue.getTime() > ops.$gt.getTime();
    }
  }
  return sameId(docValue, expected);
}

function matches(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  const { $or, ...rest } = filter;
  const restOk = Object.entries(rest).every(([key, value]) => matchesValue(doc[key], value));
  if (!restOk) return false;
  if (Array.isArray($or)) {
    return ($or as Record<string, unknown>[]).some((branch) => matches(doc, branch));
  }
  return true;
}

function makeCollection<T extends { _id: ObjectId }>(store: T[]) {
  return {
    createIndex: vi.fn(async () => "ok"),
    findOne: vi.fn(async (filter: Record<string, unknown> = {}) => {
      return store.find((doc) => matches(doc as unknown as Record<string, unknown>, filter)) ?? null;
    }),
    findOneAndUpdate: vi.fn(
      async (filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) => {
        const doc = store.find((item) =>
          matches(item as unknown as Record<string, unknown>, filter),
        );
        if (!doc) return null;
        Object.assign(doc, update.$set ?? {});
        return doc;
      },
    ),
    insertOne: vi.fn(async (doc: Omit<T, "_id"> & { _id?: ObjectId }) => {
      const _id = doc._id ?? new ObjectId();
      store.push({ ...doc, _id } as T);
      return { insertedId: _id };
    }),
    deleteOne: vi.fn(async (filter: Record<string, unknown>) => {
      const index = store.findIndex((doc) =>
        matches(doc as unknown as Record<string, unknown>, filter),
      );
      if (index < 0) return { deletedCount: 0 };
      store.splice(index, 1);
      return { deletedCount: 1 };
    }),
    deleteMany: vi.fn(async (filter: Record<string, unknown>) => {
      let deletedCount = 0;
      for (let i = store.length - 1; i >= 0; i -= 1) {
        if (matches(store[i] as unknown as Record<string, unknown>, filter)) {
          store.splice(i, 1);
          deletedCount += 1;
        }
      }
      return { deletedCount };
    }),
    updateMany: vi.fn(async (filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) => {
      let modifiedCount = 0;
      for (const doc of store) {
        if (matches(doc as unknown as Record<string, unknown>, filter)) {
          Object.assign(doc, update.$set ?? {});
          modifiedCount += 1;
        }
      }
      return { modifiedCount };
    }),
    find: vi.fn((filter: Record<string, unknown> = {}) => {
      const filtered = () =>
        store.filter((doc) => matches(doc as unknown as Record<string, unknown>, filter));
      return {
        sort: () => ({
          toArray: async () => filtered(),
        }),
        toArray: async () => filtered(),
      };
    }),
  };
}

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({
    collection: (name: string) => {
      if (name === "llm_providers") return makeCollection(providerDocs);
      if (name === "llm_models") return makeCollection(modelDocs);
      throw new Error(`unexpected collection ${name}`);
    },
  })),
}));

describe("ensureSeed", () => {
  beforeEach(() => {
    providerDocs.length = 0;
    modelDocs.length = 0;
    vi.resetModules();
  });

  it("creates Mock demo when the user has no personal providers", async () => {
    const { ensureSeed } = await import("@/lib/llm-store");
    await ensureSeed("user-a");

    expect(providerDocs).toHaveLength(1);
    expect(providerDocs[0]).toMatchObject({
      userId: "user-a",
      name: "Mock demo",
      kind: "mock",
      scope: "personal",
    });
    expect(modelDocs).toHaveLength(1);
    expect(modelDocs[0].scope).toBe("personal");
  });

  it("does not recreate Mock demo when another personal provider already exists", async () => {
    providerDocs.push({
      _id: new ObjectId(),
      userId: "user-a",
      name: "OpenAI",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      scope: "personal",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { ensureSeed } = await import("@/lib/llm-store");
    await ensureSeed("user-a");

    expect(providerDocs).toHaveLength(1);
    expect(providerDocs[0].kind).toBe("openai");
    expect(modelDocs).toHaveLength(0);
  });

  it("still seeds personal mock when only global providers exist", async () => {
    providerDocs.push({
      _id: new ObjectId(),
      userId: "admin",
      name: "Shared Claude",
      kind: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-admin",
      scope: "global",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { ensureSeed } = await import("@/lib/llm-store");
    await ensureSeed("user-a");

    expect(providerDocs.filter((doc) => doc.scope === "global")).toHaveLength(1);
    expect(providerDocs.filter((doc) => doc.userId === "user-a")).toHaveLength(1);
    expect(providerDocs.find((doc) => doc.userId === "user-a")?.kind).toBe("mock");
  });

  it("recreates Mock demo only after every personal provider is gone", async () => {
    const { ensureSeed, deleteProvider } = await import("@/lib/llm-store");

    await ensureSeed("user-a");
    const mockId = providerDocs[0]._id.toHexString();
    await deleteProvider("user-a", mockId, false);
    expect(providerDocs.filter((doc) => doc.userId === "user-a")).toHaveLength(0);

    await ensureSeed("user-a");
    expect(providerDocs.filter((doc) => doc.userId === "user-a" && doc.kind === "mock")).toHaveLength(
      1,
    );
  });
});

describe("global + personal models", () => {
  beforeEach(() => {
    providerDocs.length = 0;
    modelDocs.length = 0;
    vi.resetModules();
  });

  it("listModels merges global models for any user", async () => {
    const globalProviderId = new ObjectId();
    providerDocs.push({
      _id: globalProviderId,
      userId: "admin",
      name: "Shared",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-admin",
      scope: "global",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelDocs.push({
      _id: new ObjectId(),
      userId: "admin",
      providerId: globalProviderId.toHexString(),
      label: "gpt-global",
      modelId: "gpt-4o",
      scope: "global",
      createdAt: new Date(),
    });

    const { listModels } = await import("@/lib/llm-store");
    const listed = await listModels("user-b");
    expect(listed.some((item) => item.modelId === "gpt-4o" && item.scope === "global")).toBe(true);
    expect(listed.some((item) => item.kind === "mock" && item.scope === "personal")).toBe(true);
  });

  it("resolveRuntime allows non-owner to use a global model", async () => {
    const globalProviderId = new ObjectId();
    const globalModelId = new ObjectId();
    providerDocs.push({
      _id: globalProviderId,
      userId: "admin",
      name: "Shared",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-admin",
      scope: "global",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelDocs.push({
      _id: globalModelId,
      userId: "admin",
      providerId: globalProviderId.toHexString(),
      label: "gpt-global",
      modelId: "gpt-4o",
      scope: "global",
      createdAt: new Date(),
    });

    const { resolveRuntime } = await import("@/lib/llm-store");
    const runtime = await resolveRuntime("user-b", globalModelId.toHexString());
    expect(runtime.modelId).toBe("gpt-4o");
    expect(runtime.apiKey).toBe("sk-admin");
  });

  it("non-admin cannot delete a global provider", async () => {
    const globalProviderId = new ObjectId();
    providerDocs.push({
      _id: globalProviderId,
      userId: "admin",
      name: "Shared",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-admin",
      scope: "global",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { deleteProvider, LlmAccessError } = await import("@/lib/llm-store");
    await expect(deleteProvider("user-b", globalProviderId.toHexString(), false)).rejects.toBeInstanceOf(
      LlmAccessError,
    );
    expect(providerDocs).toHaveLength(1);
  });

  it("admin can create a global provider", async () => {
    const { createProvider } = await import("@/lib/llm-store");
    const provider = await createProvider(
      "admin",
      {
        name: "Team Claude",
        kind: "anthropic",
        apiKey: "sk-x",
        scope: "global",
      },
      true,
    );
    expect(provider.scope).toBe("global");
    expect(providerDocs[0].scope).toBe("global");
  });

  it("non-admin cannot create a global provider", async () => {
    const { createProvider, LlmAccessError } = await import("@/lib/llm-store");
    await expect(
      createProvider(
        "user-b",
        { name: "Hack", kind: "openai", scope: "global" },
        false,
      ),
    ).rejects.toBeInstanceOf(LlmAccessError);
  });

  it("admin can share one model while provider stays personal", async () => {
    const providerId = new ObjectId();
    const sharedModelId = new ObjectId();
    const privateModelId = new ObjectId();
    providerDocs.push({
      _id: providerId,
      userId: "admin",
      name: "Mine",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-admin",
      scope: "personal",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelDocs.push(
      {
        _id: sharedModelId,
        userId: "admin",
        providerId: providerId.toHexString(),
        label: "shared",
        modelId: "gpt-shared",
        scope: "personal",
        createdAt: new Date(),
      },
      {
        _id: privateModelId,
        userId: "admin",
        providerId: providerId.toHexString(),
        label: "private",
        modelId: "gpt-private",
        scope: "personal",
        createdAt: new Date(),
      },
    );

    const { updateModelScope, listModels, resolveRuntime } = await import("@/lib/llm-store");
    const updated = await updateModelScope("admin", sharedModelId.toHexString(), "global", true);
    expect(updated?.scope).toBe("global");
    expect(providerDocs[0].scope).toBe("personal");

    const listed = await listModels("user-b");
    expect(listed.some((item) => item.modelId === "gpt-shared" && item.scope === "global")).toBe(true);
    expect(listed.some((item) => item.modelId === "gpt-private")).toBe(false);

    const runtime = await resolveRuntime("user-b", sharedModelId.toHexString());
    expect(runtime.apiKey).toBe("sk-admin");
    expect(runtime.modelId).toBe("gpt-shared");
  });

  it("promoting a provider cascades all models to global", async () => {
    const providerId = new ObjectId();
    providerDocs.push({
      _id: providerId,
      userId: "admin",
      name: "Mine",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-admin",
      scope: "personal",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelDocs.push({
      _id: new ObjectId(),
      userId: "admin",
      providerId: providerId.toHexString(),
      label: "a",
      modelId: "a",
      scope: "personal",
      createdAt: new Date(),
    });

    const { updateProvider } = await import("@/lib/llm-store");
    const provider = await updateProvider("admin", providerId.toHexString(), { scope: "global" }, true);
    expect(provider?.scope).toBe("global");
    expect(modelDocs[0].scope).toBe("global");
  });

  it("non-admin cannot change model scope", async () => {
    const providerId = new ObjectId();
    const modelId = new ObjectId();
    providerDocs.push({
      _id: providerId,
      userId: "user-b",
      name: "Mine",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-b",
      scope: "personal",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelDocs.push({
      _id: modelId,
      userId: "user-b",
      providerId: providerId.toHexString(),
      label: "m",
      modelId: "m",
      scope: "personal",
      createdAt: new Date(),
    });

    const { updateModelScope, LlmAccessError } = await import("@/lib/llm-store");
    await expect(updateModelScope("user-b", modelId.toHexString(), "global", false)).rejects.toBeInstanceOf(
      LlmAccessError,
    );
  });
});
