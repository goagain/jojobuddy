"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import { formatHealthHint } from "@/lib/i18n";
import {
  PROVIDER_KIND_META,
  PROVIDER_KINDS,
  type CatalogModel,
  type ProviderKind,
  type PublicModel,
  type PublicProvider,
} from "@/lib/llm-types";

type Health = {
  ok: boolean;
  hint: string;
};

const EMPTY_FORM = {
  name: "Claude",
  kind: "anthropic" as ProviderKind,
  baseUrl: PROVIDER_KIND_META.anthropic.defaultBaseUrl,
  apiKey: "",
  asGlobal: false,
};

export default function SettingsPage() {
  const { t } = useI18n();
  const [health, setHealth] = useState<Health>({ ok: false, hint: "" });
  const [isRoot, setIsRoot] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<
    { id: string; email: string; name: string; isRoot: boolean; isAdmin: boolean }[]
  >([]);
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [keyPatch, setKeyPatch] = useState("");
  const [baseUrlPatch, setBaseUrlPatch] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = providers.find((item) => item.id === selectedId) ?? null;
  const selectedModels = models.filter((item) => item.providerId === selectedId);
  const canEditSelected = Boolean(selected && (selected.scope !== "global" || isAdmin));

  async function reload() {
    const response = await fetch("/api/health");
    const payload = await response.json();
    setHealth({ ok: Boolean(payload.ok), hint: formatHealthHint(t, payload) });
    const root = Boolean(payload.user?.isRoot);
    const admin = Boolean(payload.user?.isAdmin) || root;
    setIsRoot(root);
    setIsAdmin(admin);
    setProviders(payload.providers ?? []);
    setModels(payload.models ?? []);
    setSelectedId((current) => {
      if (current && payload.providers?.some((item: PublicProvider) => item.id === current)) {
        return current;
      }
      return payload.providers?.[0]?.id ?? null;
    });
    if (root) {
      const usersResponse = await fetch("/api/users");
      if (usersResponse.ok) {
        const usersPayload = await usersResponse.json();
        setUsers(usersPayload.users ?? []);
      }
    } else {
      setUsers([]);
    }
  }

  useEffect(() => {
    setHealth((prev) => (prev.hint ? prev : { ok: false, hint: t("connectingMongo") }));
    reload().catch(() => setHealth({ ok: false, hint: t("healthFail") }));
  }, [t]);

  useEffect(() => {
    if (!selected) {
      setBaseUrlPatch("");
      return;
    }
    setBaseUrlPatch(selected.baseUrl);
    setKeyPatch("");
    setCatalog([]);
    setPicked({});
  }, [selected?.id]);

  const selectedCount = useMemo(
    () => catalog.filter((item) => picked[item.modelId] && !item.imported).length,
    [catalog, picked],
  );

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("operationFail"));
    } finally {
      setBusy(null);
    }
  }

  async function addProvider() {
    await run("add-provider", async () => {
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          kind: form.kind,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          scope: isAdmin && form.asGlobal ? "global" : "personal",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("addFail"));
      setForm({
        ...EMPTY_FORM,
        name: PROVIDER_KIND_META[form.kind].label,
        kind: form.kind,
        baseUrl: PROVIDER_KIND_META[form.kind].defaultBaseUrl,
      });
      await reload();
      setSelectedId(payload.provider.id);
    });
  }

  async function saveProvider() {
    if (!selected || !canEditSelected) return;
    await run("save-provider", async () => {
      const response = await fetch(`/api/providers/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrlPatch,
          apiKey: keyPatch || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("saveFail"));
      setKeyPatch("");
      await reload();
    });
  }

  async function removeProvider(id: string) {
    const target = providers.find((item) => item.id === id);
    if (target?.scope === "global" && !isAdmin) return;
    if (!window.confirm(t("deleteProviderConfirm"))) return;
    await run("delete-provider", async () => {
      const response = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("deleteFail"));
      await reload();
    });
  }

  async function loadCatalog() {
    if (!selected || !canEditSelected) return;
    await run("catalog", async () => {
      const response = await fetch(`/api/providers/${selected.id}/catalog`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("fetchFail"));
      const next = (payload.models ?? []) as CatalogModel[];
      setCatalog(next);
      setPicked(
        Object.fromEntries(next.filter((item) => !item.imported).map((item) => [item.modelId, true])),
      );
    });
  }

  async function importPicked() {
    if (!selected || !canEditSelected) return;
    const modelsToImport = catalog
      .filter((item) => picked[item.modelId] && !item.imported)
      .map((item) => ({ modelId: item.modelId, label: item.label }));
    if (modelsToImport.length === 0) {
      setError(t("pickModelsFirst"));
      return;
    }
    await run("import", async () => {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: selected.id, models: modelsToImport }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("importFail"));
      await reload();
      await loadCatalog();
    });
  }

  async function addManualModel() {
    if (!selected || !canEditSelected || !manualModel.trim()) return;
    await run("manual", async () => {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: selected.id,
          models: [{ modelId: manualModel.trim(), label: manualModel.trim() }],
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("importFail"));
      setManualModel("");
      await reload();
    });
  }

  async function removeModel(id: string) {
    const target = models.find((item) => item.id === id);
    if (target?.scope === "global" && !isAdmin) return;
    if (!window.confirm(t("deleteModelConfirm"))) return;
    await run("delete-model", async () => {
      const response = await fetch(`/api/models/${id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("deleteFail"));
      await reload();
    });
  }

  async function setProviderScope(scope: "global" | "personal") {
    if (!selected || !isAdmin || !canEditSelected) return;
    const confirmMsg = scope === "global" ? t("shareProviderConfirm") : t("unshareProviderConfirm");
    if (!window.confirm(confirmMsg)) return;
    await run("scope-provider", async () => {
      const response = await fetch(`/api/providers/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("saveFail"));
      await reload();
    });
  }

  async function setModelScope(id: string, scope: "global" | "personal") {
    if (!isAdmin || !canEditSelected) return;
    await run("scope-model", async () => {
      const response = await fetch(`/api/models/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("saveFail"));
      await reload();
    });
  }

  async function toggleAdmin(userId: string, next: boolean) {
    await run("toggle-admin", async () => {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("saveFail"));
      await reload();
    });
  }

  return (
    <div className="min-h-screen px-4 py-5 md:px-6">
      <AppHeader status={health} />
      <p className="no-print mb-4 text-sm muted">{t("settingsKeyNote")}</p>
      {isRoot ? <p className="no-print mb-3 text-sm font-bold text-[#5b45d6]">{t("youAreRoot")}</p> : null}
      {!isRoot && isAdmin ? (
        <p className="no-print mb-3 text-sm font-bold text-[#5b45d6]">{t("youAreAdmin")}</p>
      ) : null}
      {error ? <p className="mb-3 text-sm font-bold text-rose-700">{error}</p> : null}

      {isRoot ? (
        <section className="panel mb-4">
          <p className="display text-[11px] tracking-[0.3em] kicker">USERS</p>
          <h2 className="mb-1 text-xl font-black">{t("usersTitle")}</h2>
          <p className="mb-3 text-sm muted">{t("usersHint")}</p>
          <div className="space-y-2">
            {users.filter((user) => !user.isRoot).length === 0 ? (
              <p className="text-sm muted">{t("noUsers")}</p>
            ) : (
              users
                .filter((user) => !user.isRoot)
                .map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-2 border-[#c9bdf0] bg-white px-3 py-2"
                  >
                    <span>
                      <span className="block text-sm font-black">{user.name || user.email}</span>
                      <span className="block text-[11px] muted">
                        {user.email} · {user.isAdmin ? t("roleAdmin") : t("roleUser")}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn text-xs"
                      disabled={Boolean(busy)}
                      onClick={() => void toggleAdmin(user.id, !user.isAdmin)}
                    >
                      {user.isAdmin ? t("revokeAdmin") : t("grantAdmin")}
                    </button>
                  </div>
                ))
            )}
          </div>
        </section>
      ) : null}

      <main className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.1fr)]">
        <section className="space-y-3">
          <article className="panel">
            <p className="display text-[11px] tracking-[0.3em] kicker">NEW PROVIDER</p>
            <h2 className="mb-3 text-xl font-black">{t("newProviderTitle")}</h2>
            <div className="grid gap-2">
              <label className="text-xs font-bold">
                {t("providerName")}
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder={t("providerNamePlaceholder")}
                  className="mt-1 w-full"
                />
              </label>
              <label className="text-xs font-bold">
                {t("providerKind")}
                <select
                  value={form.kind}
                  onChange={(event) => {
                    const kind = event.target.value as ProviderKind;
                    setForm((prev) => ({
                      ...prev,
                      kind,
                      name:
                        prev.name.trim() === "" ||
                        prev.name === PROVIDER_KIND_META[prev.kind].label
                          ? PROVIDER_KIND_META[kind].label
                          : prev.name,
                      baseUrl: PROVIDER_KIND_META[kind].defaultBaseUrl,
                    }));
                  }}
                  className="mt-1 w-full"
                >
                  {PROVIDER_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {PROVIDER_KIND_META[kind].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold">
                {t("baseUrl")}
                <input
                  value={form.baseUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                  className="mt-1 w-full"
                />
              </label>
              {PROVIDER_KIND_META[form.kind].needsKey ? (
                <label className="text-xs font-bold">
                  {t("apiKey")}
                  <input
                    type="password"
                    value={form.apiKey}
                    onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                    className="mt-1 w-full"
                  />
                </label>
              ) : (
                <p className="text-xs muted">{t("noKeyNeeded")}</p>
              )}
              {isAdmin ? (
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={form.asGlobal}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, asGlobal: event.target.checked }))
                    }
                  />
                  {t("shareAsGlobal")}
                </label>
              ) : null}
              <button
                type="button"
                disabled={Boolean(busy) || !form.name.trim()}
                onClick={addProvider}
                className="btn btn-violet mt-1 disabled:opacity-50"
              >
                {busy === "add-provider" ? t("writing") : t("saveToMongo")}
              </button>
            </div>
          </article>

          <article className="panel panel-gold">
            <p className="display text-[11px] tracking-[0.3em] kicker-gold">ARCHIVES</p>
            <h2 className="mb-3 text-xl font-black">{t("archivedApis")}</h2>
            <div className="space-y-2">
              {providers.length === 0 ? (
                <p className="text-sm muted">{t("noProviders")}</p>
              ) : (
                providers.map((provider) => {
                  const canDelete = provider.scope !== "global" || isAdmin;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => setSelectedId(provider.id)}
                      className={`flex w-full items-center justify-between border-2 px-3 py-2 text-left ${
                        provider.id === selectedId ? "choice-on" : "choice"
                      }`}
                    >
                      <span>
                        <span className="block text-sm font-black">
                          {provider.name}
                          <span className="ml-2 text-[10px] font-black tracking-wider opacity-70">
                            {provider.scope === "global" ? t("scopeGlobal") : t("scopePersonal")}
                          </span>
                        </span>
                        <span className="block text-[11px] opacity-70">
                          {PROVIDER_KIND_META[provider.kind].label} · {provider.apiKeyMasked}
                        </span>
                      </span>
                      {canDelete ? (
                        <span
                          role="button"
                          tabIndex={0}
                          className="text-xs font-bold"
                          onClick={(event) => {
                            event.stopPropagation();
                            void removeProvider(provider.id);
                          }}
                        >
                          {t("delete")}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </article>
        </section>

        <section className="space-y-3">
          {selected ? (
            <>
              {!canEditSelected ? (
                <article className="panel text-sm muted">{t("globalReadOnly")}</article>
              ) : null}

              <article className="border-2 border-[#efe0c0] bg-[#efe0c0] p-4 text-[#2a1b0c]">
                <p className="display text-[11px] tracking-[0.3em] text-[#7a3b16]">CREDENTIALS</p>
                <h2 className="mb-3 text-xl font-black">
                  {selected.name}
                  <span className="ml-2 text-xs font-black tracking-wider opacity-70">
                    {selected.scope === "global" ? t("scopeGlobal") : t("scopePersonal")}
                  </span>
                </h2>
                {canEditSelected ? (
                  <div className="grid gap-2">
                    <label className="text-xs font-bold">
                      {t("baseUrl")}
                      <input
                        value={baseUrlPatch}
                        onChange={(event) => setBaseUrlPatch(event.target.value)}
                        className="mt-1 w-full border-black bg-white text-black"
                      />
                    </label>
                    {PROVIDER_KIND_META[selected.kind].needsKey ? (
                      <label className="text-xs font-bold">
                        {t("updateApiKey", { masked: selected.apiKeyMasked })}
                        <input
                          type="password"
                          value={keyPatch}
                          onChange={(event) => setKeyPatch(event.target.value)}
                          className="mt-1 w-full border-black bg-white text-black"
                        />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={saveProvider}
                      className="btn btn-violet"
                    >
                      {busy === "save-provider" ? t("saving") : t("saveCreds")}
                    </button>
                    {isAdmin ? (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void setProviderScope(selected.scope === "global" ? "personal" : "global")
                        }
                        className="btn"
                      >
                        {busy === "scope-provider"
                          ? t("saving")
                          : selected.scope === "global"
                            ? t("unshareProvider")
                            : t("shareProvider")}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm">
                    {PROVIDER_KIND_META[selected.kind].label} · {selected.apiKeyMasked}
                  </p>
                )}
              </article>

              {canEditSelected ? (
                <article className="panel">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="display text-[11px] tracking-[0.3em] kicker">IMPORT</p>
                      <h2 className="text-xl font-black">{t("importModels")}</h2>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={loadCatalog}
                      className="btn btn-gold"
                    >
                      {busy === "catalog" ? t("fetchingCatalog") : t("fetchList")}
                    </button>
                  </div>
                  {catalog.length > 0 ? (
                    <div className="space-y-3">
                      <div className="model-list">
                        {catalog.map((item) => (
                          <label key={item.modelId} className="model-row">
                            <input
                              type="checkbox"
                              disabled={item.imported}
                              checked={item.imported || Boolean(picked[item.modelId])}
                              onChange={(event) =>
                                setPicked((prev) => ({
                                  ...prev,
                                  [item.modelId]: event.target.checked,
                                }))
                              }
                            />
                            <span title={item.label}>{item.label}</span>
                            <span className="muted">{item.imported ? t("imported") : ""}</span>
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(busy) || selectedCount === 0}
                        onClick={importPicked}
                        className="btn btn-gold"
                      >
                        {busy === "import"
                          ? t("importAction") + "…"
                          : t("importSelected", { count: selectedCount })}
                      </button>
                    </div>
                  ) : (
                    <p className="mb-3 text-sm muted">{t("importCatalogHint")}</p>
                  )}
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-bold">{t("manualImport")}</p>
                    <div className="field-row">
                      <input
                        value={manualModel}
                        onChange={(event) => setManualModel(event.target.value)}
                        placeholder={t("modelIdPlaceholder")}
                      />
                      <button
                        type="button"
                        disabled={Boolean(busy) || !manualModel.trim()}
                        onClick={addManualModel}
                        className="btn"
                      >
                        {t("importAction")}
                      </button>
                    </div>
                  </div>
                </article>
              ) : null}

              <article className="panel">
                <p className="display text-[11px] tracking-[0.3em] kicker-gold">STANDS</p>
                <h2 className="mb-3 text-xl font-black">
                  {t("importedCount", { count: selectedModels.length })}
                </h2>
                {isAdmin && canEditSelected ? (
                  <p className="mb-3 text-xs muted">{t("shareModelHint")}</p>
                ) : null}
                {selectedModels.length === 0 ? (
                  <p className="text-sm muted">{t("noModelsForProvider")}</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedModels.map((model) => (
                      <li
                        key={model.id}
                        className="flex items-center justify-between gap-3 nested px-3 py-2"
                      >
                        <span>
                          <span className="block text-sm font-black">
                            {model.label}
                            <span className="ml-2 text-[10px] font-black tracking-wider opacity-70">
                              {model.scope === "global" ? t("scopeGlobal") : t("scopePersonal")}
                            </span>
                          </span>
                          <span className="block font-mono text-[11px] muted">{model.modelId}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          {isAdmin && canEditSelected ? (
                            <button
                              type="button"
                              disabled={Boolean(busy)}
                              className="text-xs font-bold"
                              onClick={() =>
                                void setModelScope(
                                  model.id,
                                  model.scope === "global" ? "personal" : "global",
                                )
                              }
                            >
                              {model.scope === "global" ? t("unshareModel") : t("shareModel")}
                            </button>
                          ) : null}
                          {canEditSelected ? (
                            <button
                              type="button"
                              className="text-xs font-bold text-rose-700"
                              onClick={() => void removeModel(model.id)}
                            >
                              {t("remove")}
                            </button>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </>
          ) : (
            <article className="panel text-sm muted">{t("pickProviderFirst")}</article>
          )}
        </section>
      </main>
    </div>
  );
}
