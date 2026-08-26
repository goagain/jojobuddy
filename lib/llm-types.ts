export const PROVIDER_KINDS = [
  "anthropic",
  "openai",
  "openai_compatible",
  "ollama",
  "mock",
] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const PROVIDER_KIND_META: Record<
  ProviderKind,
  { label: string; defaultBaseUrl: string; needsKey: boolean }
> = {
  openai: {
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    needsKey: true,
  },
  anthropic: {
    label: "Claude",
    defaultBaseUrl: "https://api.anthropic.com",
    needsKey: true,
  },
  ollama: {
    label: "Ollama",
    defaultBaseUrl: "http://127.0.0.1:11434",
    needsKey: false,
  },
  openai_compatible: {
    label: "OpenAI-compatible",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    needsKey: true,
  },
  mock: {
    label: "Mock demo",
    defaultBaseUrl: "local://mock",
    needsKey: false,
  },
};

export type LlmScope = "global" | "personal";

export type PublicProvider = {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  scope: LlmScope;
};

export type PublicModel = {
  id: string;
  providerId: string;
  providerName: string;
  kind: ProviderKind;
  label: string;
  modelId: string;
  scope: LlmScope;
};

export type CatalogModel = {
  modelId: string;
  label: string;
  imported: boolean;
};

export type LlmRuntime = {
  providerId: string;
  providerName: string;
  kind: ProviderKind;
  modelId: string;
  modelLabel: string;
  baseUrl: string;
  apiKey: string;
};

export type UsedModel = {
  providerName: string;
  kind: ProviderKind;
  label: string;
  modelId: string;
};
