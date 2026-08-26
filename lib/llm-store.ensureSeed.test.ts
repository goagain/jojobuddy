import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

type ProviderDoc = {
  _id: ObjectId;
  userId: string;
  name: string;
  kind: string;
  baseUrl: string;
  apiKey: string;
  createdAt: Date;
  updatedAt: Date;
};

type ModelDoc = {
  _id: ObjectId;
  userId: string;
  providerId: string;
  label: string;
  modelId: string;
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

function matches(doc: Record<string, unknown>, filter: Record<string, unknown>) {
  return Object.entries(filter).every(([key, value]) => sameId(doc[key], value));
}

function makeCollection<T extends { _id: ObjectId }>(store: T[]) {
  return {
    createIndex: vi.fn(async () => "ok"),
    findOne: vi.fn(async (filter: Record<string, unknown>) => {
      return store.find((doc) => matches(doc as unknown as Record<string, unknown>, filter)) ?? null;
    }),
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
    find: vi.fn((filter: Record<string, unknown> = {}) => ({
      sort: () => ({
        toArray: async () =>
          store.filter((doc) => matches(doc as unknown as Record<string, unknown>, filter)),
      }),
      toArray: async () =>
        store.filter((doc) => matches(doc as unknown as Record<string, unknown>, filter)),
    })),
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

  it("creates Mock demo when the user has no providers", async () => {
    const { ensureSeed } = await import("@/lib/llm-store");
    await ensureSeed("user-a");

    expect(providerDocs).toHaveLength(1);
    expect(providerDocs[0]).toMatchObject({
      userId: "user-a",
      name: "Mock demo",
      kind: "mock",
      baseUrl: "local://mock",
    });
    expect(modelDocs).toHaveLength(1);
    expect(modelDocs[0]).toMatchObject({
      userId: "user-a",
      providerId: providerDocs[0]._id.toHexString(),
      label: "star-platinum-mock",
      modelId: "star-platinum-mock",
    });
  });

  it("does not recreate Mock demo when another provider already exists", async () => {
    providerDocs.push({
      _id: new ObjectId(),
      userId: "user-a",
      name: "OpenAI",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { ensureSeed } = await import("@/lib/llm-store");
    await ensureSeed("user-a");

    expect(providerDocs).toHaveLength(1);
    expect(providerDocs[0].kind).toBe("openai");
    expect(modelDocs).toHaveLength(0);
  });

  it("does not recreate Mock demo after it was deleted while another provider remains", async () => {
    providerDocs.push({
      _id: new ObjectId(),
      userId: "user-a",
      name: "OpenAI",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { ensureSeed } = await import("@/lib/llm-store");
    await ensureSeed("user-a");
    await ensureSeed("user-a");

    expect(providerDocs.filter((doc) => doc.kind === "mock")).toHaveLength(0);
    expect(providerDocs).toHaveLength(1);
  });

  it("recreates Mock demo only after every provider is gone", async () => {
    const { ensureSeed, deleteProvider } = await import("@/lib/llm-store");

    await ensureSeed("user-a");
    const mockId = providerDocs[0]._id.toHexString();
    expect(providerDocs).toHaveLength(1);

    await deleteProvider("user-a", mockId);
    expect(providerDocs).toHaveLength(0);
    expect(modelDocs).toHaveLength(0);

    await ensureSeed("user-a");
    expect(providerDocs).toHaveLength(1);
    expect(providerDocs[0].kind).toBe("mock");
    expect(modelDocs).toHaveLength(1);
  });

  it("scopes seed per user", async () => {
    const { ensureSeed } = await import("@/lib/llm-store");

    providerDocs.push({
      _id: new ObjectId(),
      userId: "user-a",
      name: "OpenAI",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await ensureSeed("user-b");

    expect(providerDocs.filter((doc) => doc.userId === "user-a")).toHaveLength(1);
    expect(providerDocs.filter((doc) => doc.userId === "user-b")).toHaveLength(1);
    expect(providerDocs.find((doc) => doc.userId === "user-b")?.kind).toBe("mock");
  });
});
