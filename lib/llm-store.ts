import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./db";
import {
  PROVIDER_KIND_META,
  type CatalogModel,
  type LlmRuntime,
  type ProviderKind,
  type PublicModel,
  type PublicProvider,
} from "./llm-types";

export type ProviderDoc = {
  _id?: ObjectId;
  userId: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ModelDoc = {
  _id?: ObjectId;
  userId: string;
  providerId: string;
  label: string;
  modelId: string;
  createdAt: Date;
};

const ANTHROPIC_CATALOG = [
  "claude-opus-4-1",
  "claude-opus-4-20250514",
  "claude-sonnet-4-5",
  "claude-sonnet-4-20250514",
  "claude-haiku-4-5",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest",
  "claude-3-opus-latest",
];

function maskKey(apiKey: string): string {
  if (!apiKey) return "No key needed";
  if (apiKey.length <= 8) return "••••";
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}

function toPublicProvider(doc: ProviderDoc): PublicProvider {
  if (!doc._id) throw new Error("Provider record is missing id");
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    kind: doc.kind,
    baseUrl: doc.baseUrl,
    hasApiKey: Boolean(doc.apiKey),
    apiKeyMasked: maskKey(doc.apiKey),
  };
}

async function providers(): Promise<Collection<ProviderDoc>> {
  return (await getDb()).collection<ProviderDoc>("llm_providers");
}

async function models(): Promise<Collection<ModelDoc>> {
  return (await getDb()).collection<ModelDoc>("llm_models");
}

export async function ensureIndexes() {
  const modelCol = await models();
  await Promise.all([
    modelCol.createIndex({ userId: 1, providerId: 1, modelId: 1 }, { unique: true }),
    (await providers()).createIndex({ userId: 1, createdAt: 1 }),
  ]);
}

export async function ensureSeed(userId: string) {
  await ensureIndexes();
  const providerCol = await providers();
  const now = new Date();
  const existing = await providerCol.findOne({ userId, kind: "mock" });
  let providerId = existing?._id?.toHexString();

  if (!providerId) {
    try {
      const inserted = await providerCol.insertOne({
        userId,
        name: "Mock demo",
        kind: "mock",
        baseUrl: "local://mock",
        apiKey: "",
        createdAt: now,
        updatedAt: now,
      });
      providerId = inserted.insertedId.toHexString();
    } catch {
      providerId = (await providerCol.findOne({ userId, kind: "mock" }))?._id?.toHexString();
    }
  }

  if (!providerId) return;

  const modelCol = await models();
  const modelExists = await modelCol.findOne({
    userId,
    providerId,
    modelId: "star-platinum-mock",
  });
  if (modelExists) return;

  try {
    await modelCol.insertOne({
      userId,
      providerId,
      label: "star-platinum-mock",
      modelId: "star-platinum-mock",
      createdAt: now,
    });
  } catch {
    // duplicate from a parallel seed
  }
}

export async function listProviders(userId: string): Promise<PublicProvider[]> {
  await ensureSeed(userId);
  const docs = await (await providers()).find({ userId }).sort({ createdAt: 1 }).toArray();
  return docs.map(toPublicProvider);
}

export async function createProvider(
  userId: string,
  input: {
    name: string;
    kind: ProviderKind;
    baseUrl?: string;
    apiKey?: string;
  },
): Promise<PublicProvider> {
  const now = new Date();
  const doc: Omit<ProviderDoc, "_id"> = {
    userId,
    name: input.name.trim(),
    kind: input.kind,
    baseUrl: (input.baseUrl || PROVIDER_KIND_META[input.kind].defaultBaseUrl).trim(),
    apiKey: input.apiKey?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
  };
  const result = await (await providers()).insertOne(doc);
  if (!result.insertedId) throw new Error("Failed to save provider");
  return toPublicProvider({ ...doc, _id: result.insertedId });
}

export async function updateProvider(
  userId: string,
  id: string,
  patch: { name?: string; baseUrl?: string; apiKey?: string },
): Promise<PublicProvider | null> {
  const _id = new ObjectId(id);
  const $set: Partial<ProviderDoc> = { updatedAt: new Date() };
  if (patch.name !== undefined) $set.name = patch.name.trim();
  if (patch.baseUrl !== undefined) $set.baseUrl = patch.baseUrl.trim();
  if (patch.apiKey !== undefined && patch.apiKey !== "") $set.apiKey = patch.apiKey.trim();

  const result = await (await providers()).findOneAndUpdate(
    { _id, userId },
    { $set },
    { returnDocument: "after" },
  );
  return result ? toPublicProvider(result) : null;
}

export async function deleteProvider(userId: string, id: string): Promise<boolean> {
  const result = await (await providers()).deleteOne({ _id: new ObjectId(id), userId });
  await (await models()).deleteMany({ userId, providerId: id });
  return result.deletedCount > 0;
}

export async function listModels(userId: string): Promise<PublicModel[]> {
  await ensureSeed(userId);
  const [providerDocs, modelDocs] = await Promise.all([
    (await providers()).find({ userId }).toArray(),
    (await models()).find({ userId }).sort({ createdAt: 1 }).toArray(),
  ]);
  const providerMap = new Map(
    providerDocs.flatMap((doc) => (doc._id ? [[doc._id.toHexString(), doc] as const] : [])),
  );

  return modelDocs.flatMap((doc) => {
    const provider = providerMap.get(doc.providerId);
    if (!provider) return [];
    return [
      {
        id: doc._id?.toHexString() ?? "",
        providerId: doc.providerId,
        providerName: provider.name,
        kind: provider.kind,
        label: doc.label,
        modelId: doc.modelId,
      },
    ];
  });
}

export async function addModels(
  userId: string,
  providerId: string,
  items: { label: string; modelId: string }[],
): Promise<PublicModel[]> {
  const provider = await (await providers()).findOne({ _id: new ObjectId(providerId), userId });
  if (!provider) throw new Error("Provider not found");

  const col = await models();
  const now = new Date();
  const created: PublicModel[] = [];

  for (const item of items) {
    const modelId = item.modelId.trim();
    const label = (item.label || modelId).trim();
    if (!modelId) continue;
    try {
      const result = await col.insertOne({
        userId,
        providerId,
        label,
        modelId,
        createdAt: now,
      });
      created.push({
        id: result.insertedId.toHexString(),
        providerId,
        providerName: provider.name,
        kind: provider.kind,
        label,
        modelId,
      });
    } catch {
      // duplicate providerId + modelId
    }
  }

  return created;
}

export async function deleteModel(userId: string, id: string): Promise<boolean> {
  const result = await (await models()).deleteOne({ _id: new ObjectId(id), userId });
  return result.deletedCount > 0;
}

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export async function fetchCatalog(userId: string, providerId: string): Promise<CatalogModel[]> {
  const provider = await (await providers()).findOne({ _id: new ObjectId(providerId), userId });
  if (!provider) throw new Error("Provider not found");

  const imported = new Set(
    (await (await models()).find({ userId, providerId }).toArray()).map((doc) => doc.modelId),
  );

  const toCatalog = (names: string[]): CatalogModel[] =>
    names
      .filter(Boolean)
      .map((modelId) => ({
        modelId,
        label: modelId,
        imported: imported.has(modelId),
      }));

  if (provider.kind === "mock") {
    return toCatalog(["star-platinum-mock"]);
  }

  if (provider.kind === "anthropic") {
    return toCatalog(ANTHROPIC_CATALOG);
  }

  if (provider.kind === "ollama") {
    const response = await fetch(`${trimSlash(provider.baseUrl)}/api/tags`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Ollama models (${response.status})`);
    }
    const data = (await response.json()) as { models?: { name?: string }[] };
    return toCatalog(data.models?.map((item) => item.name ?? "") ?? []);
  }

  const base = trimSlash(provider.baseUrl);
  const modelsUrl = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
  const response = await fetch(modelsUrl, {
    cache: "no-store",
    headers: provider.apiKey
      ? { Authorization: `Bearer ${provider.apiKey}` }
      : undefined,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to fetch model list (${response.status}): ${detail.slice(0, 240)}`);
  }
  const data = (await response.json()) as { data?: { id?: string }[] };
  return toCatalog(data.data?.map((item) => item.id ?? "") ?? []);
}

export async function resolveRuntime(userId: string, modelRecordId: string): Promise<LlmRuntime> {
  await ensureSeed(userId);
  const model = await (await models()).findOne({ _id: new ObjectId(modelRecordId), userId });
  if (!model) throw new Error("Model not imported — add it in Settings first");

  const provider = await (await providers()).findOne({
    _id: new ObjectId(model.providerId),
    userId,
  });
  if (!provider) throw new Error("This model's provider was deleted");

  if (PROVIDER_KIND_META[provider.kind].needsKey && !provider.apiKey) {
    throw new Error(`${provider.name} has no API key`);
  }

  return {
    providerId: provider._id?.toHexString() ?? model.providerId,
    providerName: provider.name,
    kind: provider.kind,
    modelId: model.modelId,
    modelLabel: model.label,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  };
}

export async function pickParseRuntime(userId: string, preferredId?: string): Promise<LlmRuntime> {
  if (preferredId) return resolveRuntime(userId, preferredId);
  const listed = await listModels(userId);
  const preferred = listed.find((item) => item.kind !== "mock") ?? listed[0];
  if (!preferred) throw new Error("No models available — import some in Settings first");
  return resolveRuntime(userId, preferred.id);
}
