"use client";

import type { JSX } from "react";
import { useEffect, useState } from "react";
import type {
  ApiConfigCreateRequest,
  ApiConfigRecord,
  ApiConfigTestResponse,
  ApiDraftKeyTestRequest,
  ApiDraftKeyTestResponse,
  ApiKeysDashboardResponse,
  ApiProviderId
} from "@mintbot/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backendFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type ApiKeyFieldDefinition = {
  provider: ApiProviderId;
  label: string;
  description: string;
  placeholder: string;
};

const API_KEY_FIELDS = [
  {
    provider: "opensea",
    label: "OpenSea API",
    description: "Paste the OpenSea key.",
    placeholder: "Paste OpenSea API key"
  },
  {
    provider: "etherscan",
    label: "Etherscan API",
    description: "Paste the Etherscan key.",
    placeholder: "Paste Etherscan API key"
  },
  {
    provider: "drpc",
    label: "dRPC API",
    description: "Paste the dRPC key.",
    placeholder: "Paste dRPC API key"
  },
  {
    provider: "openai",
    label: "OpenAI API",
    description: "Paste the OpenAI key.",
    placeholder: "sk-..."
  }
] as const satisfies ApiKeyFieldDefinition[];

function createDrafts(): Record<ApiProviderId, string> {
  return {
    opensea: "",
    etherscan: "",
    drpc: "",
    openai: ""
  };
}

function createDraftTests(): Record<ApiProviderId, ApiDraftKeyTestResponse | null> {
  return {
    opensea: null,
    etherscan: null,
    drpc: null,
    openai: null
  };
}

function createEditTargets(): Record<ApiProviderId, string | null> {
  return {
    opensea: null,
    etherscan: null,
    drpc: null,
    openai: null
  };
}

export function ApiPage({ dashboard }: { dashboard: ApiKeysDashboardResponse }): JSX.Element {
  const [data, setData] = useState<ApiKeysDashboardResponse>(dashboard);
  const [drafts, setDrafts] = useState<Record<ApiProviderId, string>>(createDrafts());
  const [draftTests, setDraftTests] = useState<Record<ApiProviderId, ApiDraftKeyTestResponse | null>>(createDraftTests());
  const [editTargets, setEditTargets] = useState<Record<ApiProviderId, string | null>>(createEditTargets());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    setData(dashboard);
  }, [dashboard]);

  async function refreshDashboard(nextFeedback?: string): Promise<ApiKeysDashboardResponse> {
    const next = await backendFetch<ApiKeysDashboardResponse>("/api-keys");
    setData(next);
    if (nextFeedback) {
      setFeedback(nextFeedback);
    }
    return next;
  }

  async function runAction<T>(key: string, action: () => Promise<T>): Promise<T | null> {
    setBusyKey(key);
    try {
      return await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to complete this API action.";
      setFeedback(message === "Internal server error" ? "Server could not complete that API request. Check backend logs or provider settings." : message);
      return null;
    } finally {
      setBusyKey(null);
    }
  }

  function updateDraft(provider: ApiProviderId, value: string): void {
    setDrafts((current) => ({
      ...current,
      [provider]: value
    }));
    setDraftTests((current) => ({
      ...current,
      [provider]: null
    }));
  }

  function startAdd(provider: ApiProviderId): void {
    setEditTargets((current) => ({
      ...current,
      [provider]: null
    }));
    setDrafts((current) => ({
      ...current,
      [provider]: ""
    }));
    setDraftTests((current) => ({
      ...current,
      [provider]: null
    }));
    setFeedback(`${providerLabel(provider)} is ready for a new key draft.`);
  }

  function startEdit(provider: ApiProviderId, configId: string): void {
    setEditTargets((current) => ({
      ...current,
      [provider]: configId
    }));
    setDrafts((current) => ({
      ...current,
      [provider]: ""
    }));
    setDraftTests((current) => ({
      ...current,
      [provider]: null
    }));
    setFeedback(`Paste a replacement ${providerLabel(provider)} key, test it, then save.`);
  }

  function getProviderConfigs(provider: ApiProviderId): ApiConfigRecord[] {
    return sortConfigs(data.configs.filter((entry) => entry.provider === provider));
  }

  function getStoredConfigs(provider: ApiProviderId): ApiConfigRecord[] {
    return sortConfigs(getProviderConfigs(provider).filter((entry) => entry.source === "database"));
  }

  async function handleSave(provider: ApiProviderId): Promise<void> {
    const value = drafts[provider].trim();
    const label = providerLabel(provider);
    const draftTest = draftTests[provider];
    const editTarget = editTargets[provider];
    const existingStoredConfigs = getStoredConfigs(provider);

    if (!value) {
      setFeedback(`Paste the ${label} key first.`);
      return;
    }

    if (!draftTest?.ok) {
      setFeedback(`Test the ${label} key successfully before saving it.`);
      return;
    }

    const existingCount = existingStoredConfigs.length;

    const saved = await runAction(`save-${provider}`, async () => {
      if (editTarget) {
        await backendFetch<ApiConfigRecord>(`/api-keys/configs/${editTarget}`, {
          method: "PATCH",
          body: JSON.stringify({
            value
          })
        });
      } else {
        const stored = await backendFetch<ApiConfigRecord>("/api-keys/configs", {
          method: "POST",
          body: JSON.stringify({
            provider,
            value
          } satisfies ApiConfigCreateRequest)
        });

        const alreadySaved = existingStoredConfigs.some((entry) => entry.id === stored.id);

        const next = await refreshDashboard(
          alreadySaved ? `${label} key is already saved.` : existingCount > 0 ? `${label} backup key saved.` : `${label} key saved.`
        );
        return next;
      }

      const next = await refreshDashboard(`${label} key updated.`);
      return next;
    });

    if (saved) {
      updateDraft(provider, "");
      setDraftTests((current) => ({
        ...current,
        [provider]: null
      }));
      setEditTargets((current) => ({
        ...current,
        [provider]: null
      }));
    }
  }

  async function handleTestDraft(provider: ApiProviderId): Promise<void> {
    const label = providerLabel(provider);
    const draftValue = drafts[provider].trim();
 
    if (!draftValue) {
      setFeedback(`Paste the ${label} key first.`);
      return;
    }

    const result = await runAction(`test-${provider}`, async () =>
      backendFetch<ApiDraftKeyTestResponse>("/api-keys/test-draft", {
        method: "POST",
        body: JSON.stringify({
          provider,
          value: draftValue
        } satisfies ApiDraftKeyTestRequest)
      })
    );

    if (!result) {
      return;
    }

    setDraftTests((current) => ({
      ...current,
      [provider]: result
    }));
    setFeedback(
      result.ok
        ? `${label} key is valid.`
        : `${label} key is invalid: ${result.health.failureReason ?? statusLabel(result.status)}`
    );
  }

  async function handleTestAll(provider: ApiProviderId): Promise<void> {
    const label = providerLabel(provider);
    const storedConfigs = getStoredConfigs(provider);

    if (!storedConfigs.length) {
      setFeedback(`Save at least one ${label} key first, then you can retest all saved keys.`);
      return;
    }

    await runAction(`test-all-${provider}`, async () => {
      for (const config of storedConfigs) {
        await backendFetch<ApiConfigTestResponse>(`/api-keys/configs/${config.id}/test`, {
          method: "POST"
        });
      }

      await refreshDashboard(`${label} ${storedConfigs.length} saved key${storedConfigs.length === 1 ? "" : "s"} tested.`);
    });
  }

  async function handleTestConfig(config: ApiConfigRecord): Promise<void> {
    const label = providerLabel(config.provider);
    await runAction(`test-config-${config.id}`, async () => {
      await backendFetch<ApiConfigTestResponse>(`/api-keys/configs/${config.id}/test`, {
        method: "POST"
      });
      await refreshDashboard(`${label} key tested.`);
    });
  }

  async function handleDeleteConfig(config: ApiConfigRecord): Promise<void> {
    const label = providerLabel(config.provider);

    if (!window.confirm(`Delete this saved ${label} key?`)) {
      return;
    }

    const removed = await runAction(`delete-config-${config.id}`, async () => {
      await backendFetch<{ removed: boolean }>(`/api-keys/configs/${config.id}`, {
        method: "DELETE"
      });

      const next = await refreshDashboard(`${label} key deleted.`);
      return next;
    });

    if (removed) {
      updateDraft(config.provider, "");
      setDraftTests((current) => ({
        ...current,
        [config.provider]: null
      }));
      setEditTargets((current) => ({
        ...current,
        [config.provider]: current[config.provider] === config.id ? null : current[config.provider]
      }));
    }
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-[#d4b07a]/18 bg-[#14110f] text-[#f7f2e9] shadow-[0_24px_60px_rgba(16,11,7,0.42)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(214,176,122,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(181,119,83,0.14),transparent_32%),linear-gradient(180deg,rgba(22,18,15,0.98),rgba(11,9,8,0.98))]" />
        <div className="relative space-y-3 p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#dcc39b]/80">API Keys</p>
          <h1 className="max-w-3xl text-2xl font-semibold tracking-tight text-[#fffaf2] md:text-3xl">Store keys and stay ahead of provider limits.</h1>
          <p className="max-w-3xl text-sm leading-6 text-stone-300">
            Paste a key, test it first, then save it. Saving another tested key for the same provider adds it as a backup while the backend handles health checks,
            failover, recovery, and automation behavior.
          </p>
          <div className="rounded-[1.2rem] border border-[#d4b07a]/10 bg-[#f3e3c5]/[0.05] px-4 py-3 text-sm text-stone-300">
            {feedback ??
              "Tip: providers with strict quotas should have a spare key ready. Test the draft first, save only passing keys, and add another passing key later if you want a backup."}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {API_KEY_FIELDS.map((definition) => {
          const providerConfigs = getProviderConfigs(definition.provider);
          const storedConfigs = providerConfigs.filter((entry) => entry.source === "database");
          const observedConfig = storedConfigs[0] ?? providerConfigs[0] ?? null;

          return (
            <ProviderKeyCard
              key={definition.provider}
              busyKey={busyKey}
              definition={definition}
              editTargetId={editTargets[definition.provider]}
              draftValue={drafts[definition.provider]}
              draftTest={draftTests[definition.provider]}
              observedConfig={observedConfig}
              storedConfigs={storedConfigs}
              onAdd={startAdd}
              onDeleteConfig={handleDeleteConfig}
              onDraftChange={updateDraft}
              onEditConfig={startEdit}
              onSave={handleSave}
              onTest={handleTestDraft}
              onTestAll={handleTestAll}
              onTestConfig={handleTestConfig}
            />
          );
        })}
      </section>
    </div>
  );
}

function ProviderKeyCard({
  definition,
  editTargetId,
  draftTest,
  observedConfig,
  storedConfigs,
  draftValue,
  busyKey,
  onAdd,
  onEditConfig,
  onTestConfig,
  onDeleteConfig,
  onDraftChange,
  onSave,
  onTest,
  onTestAll
}: {
  definition: ApiKeyFieldDefinition;
  editTargetId: string | null;
  draftTest: ApiDraftKeyTestResponse | null;
  observedConfig: ApiConfigRecord | null;
  storedConfigs: ApiConfigRecord[];
  draftValue: string;
  busyKey: string | null;
  onAdd: (provider: ApiProviderId) => void;
  onEditConfig: (provider: ApiProviderId, configId: string) => void;
  onTestConfig: (config: ApiConfigRecord) => Promise<void>;
  onDeleteConfig: (config: ApiConfigRecord) => Promise<void>;
  onDraftChange: (provider: ApiProviderId, value: string) => void;
  onSave: (provider: ApiProviderId) => Promise<void>;
  onTest: (provider: ApiProviderId) => Promise<void>;
  onTestAll: (provider: ApiProviderId) => Promise<void>;
}): JSX.Element {
  const storedConfig = storedConfigs[0] ?? null;
  const storedCount = storedConfigs.length;
  const saveBusy = busyKey === `save-${definition.provider}`;
  const testBusy = busyKey === `test-${definition.provider}`;
  const testAllBusy = busyKey === `test-all-${definition.provider}`;
  const hasDraft = Boolean(draftValue.trim());
  const testedDraftValid = Boolean(draftTest?.ok && draftValue.trim());
  const showMetaPanel = Boolean(
    draftTest ||
      storedConfig ||
      observedConfig?.health.lastCheckedAt ||
      observedConfig?.health.failureReason ||
      (observedConfig?.source === "environment" && !storedConfig) ||
      storedCount > 1
  );

  return (
    <Card className="rounded-[1.75rem] border-[#d4b07a]/10 bg-[#11100e] text-[#f7f2e9] shadow-[0_18px_40px_rgba(18,12,8,0.3)]">
      <CardHeader className="px-5 pb-2 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-lg text-[#fffaf2]">{definition.label}</CardTitle>
            <p className="text-[13px] leading-5 text-stone-400">{definition.description}</p>
          </div>
          <StatusBadge label={observedConfig ? statusLabel(observedConfig.status) : "Standby"} tone={observedConfig ? statusTone(observedConfig.status) : "neutral"} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5">
        {editTargetId ? (
          <div className="rounded-[1rem] border border-[#d4b07a]/12 bg-[#231d19] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[#e4cfad]">
            Edit mode active. Test the replacement key, then click Save.
          </div>
        ) : null}
        {showMetaPanel ? (
          <div className="rounded-[1.2rem] border border-[#d4b07a]/10 bg-[#f5ead8]/[0.04] px-4 py-3 text-sm text-stone-300">
            {draftTest ? (
              <p className={cn("font-medium", draftTest.ok ? "text-emerald-200" : "text-rose-200")}>
                Key is {draftTest.ok ? "valid" : "invalid"}
                {draftTest.health.latencyMs ? ` | ${draftTest.health.latencyMs}ms` : ""}
              </p>
            ) : null}
            {draftTest?.health.failureReason ? <p className="mt-2 text-rose-200">{draftTest.health.failureReason}</p> : null}
            {storedConfig ? (
              <p className={draftTest ? "mt-2" : ""}>
                Saved keys: <span className="text-[#fffaf2]">{storedCount}</span>
              </p>
            ) : null}
            {storedConfigs.length ? (
              <div className="mt-2 space-y-2">
                {storedConfigs.map((config, index) => (
                  <div
                    key={config.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border bg-[#0d0b09] px-3 py-2",
                      editTargetId === config.id ? "border-[#d7b07b]/35 bg-[#17120f]" : "border-[#d4b07a]/10"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.16em] text-stone-500">{index === 0 ? "Primary" : `Backup ${index}`}</p>
                      <p className="truncate font-mono text-xs text-[#fffaf2]">{config.secretMask}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge label={statusLabel(config.status)} tone={statusTone(config.status)} />
                      <InlineAction label="Edit" onClick={() => onEditConfig(definition.provider, config.id)} />
                      <InlineAction busy={busyKey === `test-config-${config.id}`} label="Test" onClick={() => void onTestConfig(config)} />
                      <InlineAction busy={busyKey === `delete-config-${config.id}`} label="Delete" tone="danger" onClick={() => void onDeleteConfig(config)} />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {observedConfig?.health.lastCheckedAt || observedConfig ? (
              <p className={storedConfig || draftTest ? "mt-2" : ""}>
                Last check: <span className="text-[#fffaf2]">{formatDateTime(observedConfig?.health.lastCheckedAt)}</span>
                {" | "}
                Latency: <span className="text-[#fffaf2]">{formatLatency(observedConfig?.health.latencyMs)}</span>
              </p>
            ) : null}
            {observedConfig?.source === "environment" && !storedConfig ? (
              <p className="mt-2 text-slate-400">This provider is currently supplied by an environment key. Saving here will create a local stored key.</p>
            ) : null}
            {storedCount > 0 ? (
              <p className="mt-2 text-amber-200">Use Add for another backup key. Each saved key can be edited, tested, or deleted on its own.</p>
            ) : null}
            {observedConfig?.health.failureReason ? <p className="mt-2 text-rose-200">{observedConfig.health.failureReason}</p> : null}
          </div>
        ) : null}

        <Input
          className="h-11 border-[#d4b07a]/10 bg-[#0b0908] text-[#fffaf2] placeholder:text-stone-500"
          placeholder={storedConfig ? `Paste another ${definition.label} key to add a backup` : definition.placeholder}
          type="password"
          value={draftValue}
          onChange={(event) => onDraftChange(definition.provider, event.target.value)}
        />

        <div className="flex flex-wrap gap-3">
          <Button
            className="h-10 border border-[#d4b07a]/10 bg-[#1b1714] px-5 text-[#f3eadf] hover:bg-[#25201c]"
            disabled={saveBusy || testBusy || testAllBusy}
            type="button"
            variant="ghost"
            onClick={() => onAdd(definition.provider)}
          >
            Add
          </Button>
          <Button
            className="h-10 border border-[#d4b07a]/10 bg-[#1b1714] px-5 text-[#f3eadf] hover:bg-[#25201c]"
            disabled={!hasDraft || testBusy || saveBusy}
            type="button"
            variant="ghost"
            onClick={() => void onTest(definition.provider)}
          >
            {testBusy ? "Testing..." : "Test"}
          </Button>
          <Button
            className="h-10 bg-[#d7b07b] px-5 text-[#221812] hover:bg-[#e5c190]"
            disabled={!draftValue.trim() || !testedDraftValid || saveBusy}
            type="button"
            onClick={() => void onSave(definition.provider)}
          >
            {saveBusy ? "Saving..." : "Save"}
          </Button>
          {storedCount > 0 ? (
            <Button
              className="h-10 border border-[#d4b07a]/10 bg-[#1b1714] px-5 text-[#f3eadf] hover:bg-[#25201c]"
              disabled={testAllBusy || saveBusy}
              type="button"
              variant="ghost"
              onClick={() => void onTestAll(definition.provider)}
            >
              {testAllBusy ? "Testing..." : "Test All"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function InlineAction({
  label,
  onClick,
  tone = "default",
  busy = false
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  busy?: boolean;
}): JSX.Element {
  return (
    <button
      className={cn(
        "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition",
        tone === "default" && "border-[#d4b07a]/12 bg-[#1c1714] text-[#efe3d1] hover:bg-[#28211d]",
        tone === "danger" && "border-[#b97867]/24 bg-[#41241e] text-[#f2c1b7] hover:bg-[#55322b]",
        busy && "cursor-not-allowed opacity-60"
      )}
      disabled={busy}
      type="button"
      onClick={onClick}
    >
      {busy ? "..." : label}
    </button>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
        tone === "success" && "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
        tone === "warning" && "border-[#d7b07b]/20 bg-[#d7b07b]/12 text-[#f4dfbd]",
        tone === "danger" && "border-[#b97867]/24 bg-[#b97867]/12 text-[#f2c1b7]",
        tone === "info" && "border-[#c59a67]/20 bg-[#c59a67]/12 text-[#f1d8b4]",
        tone === "neutral" && "border-[#d4b07a]/14 bg-[#f3e3c5]/[0.05] text-[#eadbc4]"
      )}
    >
      {label}
    </span>
  );
}

function providerLabel(provider: ApiProviderId): string {
  return API_KEY_FIELDS.find((entry) => entry.provider === provider)?.label.replace(" API", "") ?? provider;
}

function sortConfigs(configs: ApiConfigRecord[]): ApiConfigRecord[] {
  return [...configs].sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === "database" ? -1 : 1;
    }

    if (left.isBackup !== right.isBackup) {
      return left.isBackup ? 1 : -1;
    }

    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
  });
}

function statusLabel(status: ApiConfigRecord["status"]): string {
  switch (status) {
    case "invalid-key":
      return "Invalid Key";
    case "rate-limited":
      return "Rate Limited";
    case "failover-active":
      return "Failover";
    case "backup":
      return "Backup";
    case "active":
      return "Active";
    default:
      return "Offline";
  }
}

function statusTone(status: ApiConfigRecord["status"]): "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "active":
      return "success";
    case "backup":
      return "info";
    case "failover-active":
      return "warning";
    case "rate-limited":
      return "warning";
    case "invalid-key":
      return "danger";
    default:
      return "danger";
  }
}

function formatLatency(value?: number | null): string {
  return value ? `${value}ms` : "Not checked";
}
