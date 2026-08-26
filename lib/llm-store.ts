import { ObjectId, type Collection, type Filter } from "mongodb";
import { getDb } from "./db";
import {
  PROVIDER_KIND_META,
  type CatalogModel,
  type LlmRuntime,
  type LlmScope,
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
  scope?: LlmScope;
  createdAt: Date;
  updatedAt: Date;
};

export type ModelDoc = {
  _id?: ObjectId;
  userId: string;
  providerId: string;
  label: string;
  modelId: string;
  scope?: LlmScope;
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

export function docScope(doc: { scope?: LlmScope }): LlmScope {
  return doc.scope === "global" ? "global" : "personal";
}

export class LlmAccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

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
    scope: docScope(doc),
  };
}

function toPublicModel(doc: ModelDoc, provider: ProviderDoc): PublicModel {
  return {
    id: doc._id?.toHexString() ?? "",
    providerId: doc.providerId,
    providerName: provider.name,
    kind: provider.kind,
    label: doc.label,
    modelId: doc.modelId,
    scope: docScope(doc),
  };
}

async function providers(): Promise<Collection<ProviderDoc>> {
  return (await getDb()).collection<ProviderDoc>("llm_providers");
}

async function models(): Promise<Collection<ModelDoc>> {
  return (await getDb()).collection<ModelDoc>("llm_models");
}

function accessibleProviderFilter(userId: string): Filter<ProviderDoc> {
  return {
    $or: [{ scope: "global" }, { userId, scope: { $ne: "global" } }],
  };
}

/** Personal providers for a user (excludes global even if userId matches creator). */
function personalProviderFilter(userId: string): Filter<ProviderDoc> {
  return { userId, scope: { $ne: "global" } };
}

function accessibleModelFilter(userId: string): Filter<ModelDoc> {
  return {
    $or: [{ scope: "global" }, { userId, scope: { $ne: "global" } }],
  };
}

export async function ensureIndexes() {
  const modelCol = await models();
  await Promise.all([
    modelCol.createIndex({ userId: 1, providerId: 1, modelId: 1 }, { unique: true }),
    modelCol.createIndex({ scope: 1, providerId: 1, modelId: 1 }),
    (await providers()).createIndex({ userId: 1, createdAt: 1 }),
    (await providers()).createIndex({ scope: 1, createdAt: 1 }),
  ]);
}

export async function ensureSeed(userId: string) {
  await ensureIndexes();
  const providerCol = await providers();
  const anyPersonal = await providerCol.findOne(personalProviderFilter(userId), {
    projection: { _id: 1 },
  });
  if (anyPersonal) return;

  const now = new Date();
  let providerId: string | undefined;
  try {
    const inserted = await providerCol.insertOne({
      userId,
      name: "Mock demo",
      kind: "mock",
      baseUrl: "local://mock",
      apiKey: "",
      scope: "personal",
      createdAt: now,
      updatedAt: now,
    });
    providerId = inserted.insertedId.toHexString();
  } catch {
    providerId = (
      await providerCol.findOne({ userId, kind: "mock", scope: { $ne: "global" } })
    )?._id?.toHexString();
  }

  if (!providerId) return;

  try {
    await (await models()).insertOne({
      userId,
      providerId,
      label: "star-platinum-mock",
      modelId: "star-platinum-mock",
      scope: "personal",
      createdAt: now,
    });
  } catch {
    // duplicate from a parallel seed
  }
}

export async function getProviderDoc(id: string): Promise<ProviderDoc | null> {
  return (await providers()).findOne({ _id: new ObjectId(id) });
}

export async function getModelDoc(id: string): Promise<ModelDoc | null> {
  return (await models()).findOne({ _id: new ObjectId(id) });
}

export function assertCanWriteProvider(doc: ProviderDoc, userId: string, isAdmin: boolean) {
  const scope = docScope(doc);
  if (scope === "global") {
    if (!isAdmin) throw new LlmAccessError("Only admins can change global providers");
    return;
  }
  if (doc.userId !== userId) throw new LlmAccessError("Provider not found", 404);
}

export function assertCanWriteModel(doc: ModelDoc, userId: string, isAdmin: boolean) {
  const scope = docScope(doc);
  if (scope === "global") {
    if (!isAdmin) throw new LlmAccessError("Only admins can change global models");
    return;
  }
  if (doc.userId !== userId) throw new LlmAccessError("Model not found", 404);
}

export async function listProviders(userId: string): Promise<PublicProvider[]> {
  await ensureSeed(userId);
  const docs = await (await providers())
    .find(accessibleProviderFilter(userId))
    .sort({ createdAt: 1 })
    .toArray();
  // Deduplicate if admin owns a global row that also matches personal filter loosely
  const seen = new Set<string>();
  const ordered: ProviderDoc[] = [];
  for (const doc of docs) {
    const id = doc._id?.toHexString();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(doc);
  }
  // Show global first, then personal
  ordered.sort((a, b) => {
    const sa = docScope(a) === "global" ? 0 : 1;
    const sb = docScope(b) === "global" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return ordered.map(toPublicProvider);
}

export async function createProvider(
  userId: string,
  input: {
    name: string;
    kind: ProviderKind;
    baseUrl?: string;
    apiKey?: string;
    scope?: LlmScope;
  },
  isAdmin: boolean,
): Promise<PublicProvider> {
  const scope: LlmScope = input.scope === "global" ? "global" : "personal";
  if (scope === "global" && !isAdmin) {
    throw new LlmAccessError("Only admins can create global providers");
  }
  const now = new Date();
  const doc: Omit<ProviderDoc, "_id"> = {
    userId,
    name: input.name.trim(),
    kind: input.kind,
    baseUrl: (input.baseUrl || PROVIDER_KIND_META[input.kind].defaultBaseUrl).trim(),
    apiKey: input.apiKey?.trim() ?? "",
    scope,
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
  patch: { name?: string; baseUrl?: string; apiKey?: string; scope?: LlmScope },
  isAdmin: boolean,
): Promise<PublicProvider | null> {
  const existing = await getProviderDoc(id);
  if (!existing) return null;
  assertCanWriteProvider(existing, userId, isAdmin);

  if (patch.scope !== undefined) {
    if (!isAdmin) throw new LlmAccessError("Only admins can change provider scope");
    const next = patch.scope === "global" ? "global" : "personal";
    const _id = new ObjectId(id);
    const result = await (await providers()).findOneAndUpdate(
      { _id },
      { $set: { scope: next, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    // Cascade: all models under this provider follow provider scope
    await (await models()).updateMany({ providerId: id }, { $set: { scope: next } });
    return result ? toPublicProvider(result) : null;
  }

  const _id = new ObjectId(id);
  const $set: Partial<ProviderDoc> = { updatedAt: new Date() };
  if (patch.name !== undefined) $set.name = patch.name.trim();
  if (patch.baseUrl !== undefined) $set.baseUrl = patch.baseUrl.trim();
  if (patch.apiKey !== undefined && patch.apiKey !== "") $set.apiKey = patch.apiKey.trim();

  const result = await (await providers()).findOneAndUpdate({ _id }, { $set }, { returnDocument: "after" });
  return result ? toPublicProvider(result) : null;
}

export async function deleteProvider(userId: string, id: string, isAdmin: boolean): Promise<boolean> {
  const existing = await getProviderDoc(id);
  if (!existing) return false;
  assertCanWriteProvider(existing, userId, isAdmin);

  const result = await (await providers()).deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount > 0) {
    await (await models()).deleteMany({ providerId: id });
  }
  return result.deletedCount > 0;
}

export async function listModels(userId: string): Promise<PublicModel[]> {
  await ensureSeed(userId);
  const [providerDocs, modelDocs] = await Promise.all([
    (await providers()).find(accessibleProviderFilter(userId)).toArray(),
    (await models()).find(accessibleModelFilter(userId)).sort({ createdAt: 1 }).toArray(),
  ]);
  const providerMap = new Map(
    providerDocs.flatMap((doc) => (doc._id ? [[doc._id.toHexString(), doc] as const] : [])),
  );

  // Global models may sit on a personal provider owned by an admin — still load that provider.
  const missingProviderIds = [
    ...new Set(
      modelDocs
        .filter((doc) => docScope(doc) === "global" && !providerMap.has(doc.providerId))
        .map((doc) => doc.providerId),
    ),
  ];
  if (missingProviderIds.length > 0) {
    const extras = await (await providers())
      .find({ _id: { $in: missingProviderIds.map((id) => new ObjectId(id)) } })
      .toArray();
    for (const doc of extras) {
      if (doc._id) providerMap.set(doc._id.toHexString(), doc);
    }
  }

  const listed = modelDocs.flatMap((doc) => {
    const provider = providerMap.get(doc.providerId);
    if (!provider) return [];
    return [toPublicModel(doc, provider)];
  });

  listed.sort((a, b) => {
    const sa = a.scope === "global" ? 0 : 1;
    const sb = b.scope === "global" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.label.localeCompare(b.label);
  });
  return listed;
}

export async function updateModelScope(
  userId: string,
  id: string,
  scope: LlmScope,
  isAdmin: boolean,
): Promise<PublicModel | null> {
  if (!isAdmin) throw new LlmAccessError("Only admins can change model sharing");
  const existing = await getModelDoc(id);
  if (!existing) return null;
  assertCanWriteModel(existing, userId, isAdmin);

  const next = scope === "global" ? "global" : "personal";
  const provider = await getProviderDoc(existing.providerId);
  if (!provider) throw new Error("Provider not found");

  // Sharing a model requires the provider credentials to be usable; keep provider as-is
  // (resolveRuntime loads provider by id for global models even if provider is personal).

  const result = await (await models()).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { scope: next } },
    { returnDocument: "after" },
  );
  return result ? toPublicModel(result, provider) : null;
}

export async function addModels(
  userId: string,
  providerId: string,
  items: { label: string; modelId: string }[],
  isAdmin: boolean,
): Promise<PublicModel[]> {
  const provider = await getProviderDoc(providerId);
  if (!provider) throw new Error("Provider not found");
  assertCanWriteProvider(provider, userId, isAdmin);

  const scope = docScope(provider);
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
        scope,
        createdAt: now,
      });
      created.push(
        toPublicModel(
          {
            _id: result.insertedId,
            userId,
            providerId,
            label,
            modelId,
            scope,
            createdAt: now,
          },
          provider,
        ),
      );
    } catch {
      // duplicate providerId + modelId
    }
  }

  return created;
}

export async function deleteModel(userId: string, id: string, isAdmin: boolean): Promise<boolean> {
  const existing = await getModelDoc(id);
  if (!existing) return false;
  assertCanWriteModel(existing, userId, isAdmin);
  const result = await (await models()).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export async function fetchCatalog(
  userId: string,
  providerId: string,
  isAdmin: boolean,
): Promise<CatalogModel[]> {
  const provider = await getProviderDoc(providerId);
  if (!provider) throw new Error("Provider not found");

  // Read: any user may fetch catalog for accessible providers; write/import gated elsewhere
  const scope = docScope(provider);
  if (scope === "personal" && provider.userId !== userId) {
    throw new Error("Provider not found");
  }
  if (scope === "global" && !isAdmin) {
    // Non-admin can view imported list status but catalog fetch for import is admin-only in UI;
    // still allow read of catalog for transparency? Plan says non-admin read-only — hide import.
    // Allow fetch for display; import blocked by addModels.
  }

  const imported = new Set(
    (
      await (await models())
        .find({
          providerId,
          $or: [{ scope: "global" }, { userId, scope: { $ne: "global" } }, { userId, scope: { $exists: false } }],
        })
        .toArray()
    ).map((doc) => doc.modelId),
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
    headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : undefined,
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
  const model = await (await models()).findOne({
    _id: new ObjectId(modelRecordId),
    $or: [{ scope: "global" }, { userId }],
  });
  if (!model) throw new Error("Model not imported — add it in Settings first");

  // Global shared models may use a personal provider owned by the admin.
  const provider =
    docScope(model) === "global"
      ? await (await providers()).findOne({ _id: new ObjectId(model.providerId) })
      : await (await providers()).findOne({
          _id: new ObjectId(model.providerId),
          $or: [{ scope: "global" }, { userId }],
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
