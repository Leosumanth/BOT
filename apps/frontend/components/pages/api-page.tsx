"use client";

import type { JSX } from "react";
import { useEffect, useState } from "react";
import type { ApiConfigCreateRequest, ApiConfigRecord, ApiConfigTestResponse, ApiConfigUpdateRequest, ApiKeysDashboardResponse, ApiProviderId } from "@mintbot/shared";
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

export function ApiPage({ dashboard }: { dashboard: ApiKeysDashboardResponse }): JSX.Element {
  const [data, setData] = useState<ApiKeysDashboardResponse>(dashboard);
  const [drafts, setDrafts] = useState<Record<ApiProviderId, string>>(createDrafts());
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
      setFeedback(error instanceof Error ? error.message : "Unable to complete this API action.");
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

    if (!value) {
      setFeedback(`Paste the ${label} key first.`);
      return;
    }

    const storedConfigs = getStoredConfigs(provider);
    const storedConfig = storedConfigs[0] ?? null;

    const saved = await runAction(`save-${provider}`, async () => {
      if (storedConfig) {
        await backendFetch<ApiConfigRecord>(`/api-keys/configs/${storedConfig.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            value
          } satisfies ApiConfigUpdateRequest)
        });
      } else {
        await backendFetch<ApiConfigRecord>("/api-keys/configs", {
          method: "POST",
          body: JSON.stringify({
            provider,
            value
          } satisfies ApiConfigCreateRequest)
        });
      }

      const next = await refreshDashboard(`${label} key ${storedConfig ? "updated" : "saved"}.`);
      return next;
    });

    if (saved) {
      updateDraft(provider, "");
    }
  }

  async function handleTest(provider: ApiProviderId): Promise<void> {
    const label = providerLabel(provider);
    const target = getStoredConfigs(provider)[0] ?? getProviderConfigs(provider)[0] ?? null;

    if (!target) {
      setFeedback(`Save the ${label} key before testing.`);
      return;
    }

    await runAction(`test-${provider}`, async () => {
      await backendFetch<ApiConfigTestResponse>(`/api-keys/configs/${target.id}/test`, {
        method: "POST"
      });
      await refreshDashboard(`${label} key tested.`);
    });
  }

  async function handleDelete(provider: ApiProviderId): Promise<void> {
    const label = providerLabel(provider);
    const storedConfigs = getStoredConfigs(provider);

    if (!storedConfigs.length) {
      setFeedback(`No saved ${label} key to delete.`);
      return;
    }

    if (!window.confirm(`Delete the saved ${label} key${storedConfigs.length > 1 ? "s" : ""}?`)) {
      return;
    }

    const removed = await runAction(`delete-${provider}`, async () => {
      for (const config of storedConfigs) {
        await backendFetch<{ removed: boolean }>(`/api-keys/configs/${config.id}`, {
          method: "DELETE"
        });
      }

      const next = await refreshDashboard(`${label} key deleted.`);
      return next;
    });

    if (removed) {
      updateDraft(provider, "");
    }
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-cyan-400/20 bg-[#07111d] text-white shadow-[0_24px_60px_rgba(3,9,24,0.48)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_30%),linear-gradient(180deg,rgba(8,15,28,0.96),rgba(4,8,18,0.98))]" />
        <div className="relative space-y-3 p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200/75">API Keys</p>
          <h1 className="max-w-3xl text-2xl font-semibold tracking-tight text-white md:text-3xl">Store keys and stay ahead of provider limits.</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-300">
            Save a key, run a quick test, and let the backend handle health checks, failover, recovery, and automation behavior.
          </p>
          <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-slate-300">
            {feedback ??
              "Tip: providers with strict quotas should have a spare key ready. Test after saving, rotate keys before limits are exhausted, and let backend checks watch latency and rate-limit pressure."}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {API_KEY_FIELDS.map((definition) => {
          const providerConfigs = getProviderConfigs(definition.provider);
          const storedConfigs = providerConfigs.filter((entry) => entry.source === "database");
          const storedConfig = storedConfigs[0] ?? null;
          const observedConfig = storedConfig ?? providerConfigs[0] ?? null;

          return (
            <ProviderKeyCard
              key={definition.provider}
              busyKey={busyKey}
              definition={definition}
              draftValue={drafts[definition.provider]}
              observedConfig={observedConfig}
              storedConfig={storedConfig}
              storedCount={storedConfigs.length}
              onDelete={handleDelete}
              onDraftChange={updateDraft}
              onSave={handleSave}
              onTest={handleTest}
            />
          );
        })}
      </section>
    </div>
  );
}

function ProviderKeyCard({
  definition,
  storedConfig,
  observedConfig,
  storedCount,
  draftValue,
  busyKey,
  onDraftChange,
  onSave,
  onTest,
  onDelete
}: {
  definition: ApiKeyFieldDefinition;
  storedConfig: ApiConfigRecord | null;
  observedConfig: ApiConfigRecord | null;
  storedCount: number;
  draftValue: string;
  busyKey: string | null;
  onDraftChange: (provider: ApiProviderId, value: string) => void;
  onSave: (provider: ApiProviderId) => Promise<void>;
  onTest: (provider: ApiProviderId) => Promise<void>;
  onDelete: (provider: ApiProviderId) => Promise<void>;
}): JSX.Element {
  const saveBusy = busyKey === `save-${definition.provider}`;
  const testBusy = busyKey === `test-${definition.provider}`;
  const deleteBusy = busyKey === `delete-${definition.provider}`;
  const showMetaPanel = Boolean(
    storedConfig ||
      observedConfig?.health.lastCheckedAt ||
      observedConfig?.health.failureReason ||
      (observedConfig?.source === "environment" && !storedConfig) ||
      storedCount > 1
  );

  return (
    <Card className="rounded-[1.75rem] border-white/10 bg-[#07111d] text-white shadow-[0_18px_40px_rgba(2,8,20,0.36)]">
      <CardHeader className="px-5 pb-2 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-lg text-white">{definition.label}</CardTitle>
            <p className="text-[13px] leading-5 text-slate-400">{definition.description}</p>
          </div>
          <StatusBadge label={observedConfig ? statusLabel(observedConfig.status) : "Standby"} tone={observedConfig ? statusTone(observedConfig.status) : "neutral"} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5">
        {showMetaPanel ? (
          <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
            {storedConfig ? (
              <p>
                Stored key: <span className="font-mono text-white">{storedConfig.secretMask}</span>
              </p>
            ) : null}
            {observedConfig?.health.lastCheckedAt || observedConfig ? (
              <p className={storedConfig ? "mt-2" : ""}>
                Last check: <span className="text-white">{formatDateTime(observedConfig?.health.lastCheckedAt)}</span>
                {" | "}
                Latency: <span className="text-white">{formatLatency(observedConfig?.health.latencyMs)}</span>
              </p>
            ) : null}
            {observedConfig?.source === "environment" && !storedConfig ? (
              <p className="mt-2 text-slate-400">This provider is currently supplied by an environment key. Saving here will create a local stored key.</p>
            ) : null}
            {storedCount > 1 ? <p className="mt-2 text-amber-200">Multiple saved keys exist for this provider. Delete will clear all saved entries.</p> : null}
            {observedConfig?.health.failureReason ? <p className="mt-2 text-rose-200">{observedConfig.health.failureReason}</p> : null}
          </div>
        ) : null}

        <Input
          className="h-11 border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
          placeholder={storedConfig ? `Paste a new ${definition.label} key to replace the saved one` : definition.placeholder}
          type="password"
          value={draftValue}
          onChange={(event) => onDraftChange(definition.provider, event.target.value)}
        />

        <div className="flex flex-wrap gap-3">
          <Button
            className="h-10 bg-cyan-300 px-5 text-slate-950 hover:bg-cyan-200"
            disabled={!draftValue.trim() || saveBusy}
            type="button"
            onClick={() => void onSave(definition.provider)}
          >
            {saveBusy ? "Saving..." : "Save"}
          </Button>
          <Button
            className="h-10 border border-white/10 bg-white/5 px-5 text-white hover:bg-white/10"
            disabled={!observedConfig || testBusy}
            type="button"
            variant="ghost"
            onClick={() => void onTest(definition.provider)}
          >
            {testBusy ? "Testing..." : "Test"}
          </Button>
          <Button
            className="h-10 border border-rose-300/20 bg-rose-300/10 px-5 text-rose-100 hover:bg-rose-300/15"
            disabled={!storedConfig || deleteBusy}
            type="button"
            variant="ghost"
            onClick={() => void onDelete(definition.provider)}
          >
            {deleteBusy ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
        tone === "success" && "border-emerald-300/20 bg-emerald-300/12 text-emerald-100",
        tone === "warning" && "border-amber-300/20 bg-amber-300/12 text-amber-100",
        tone === "danger" && "border-rose-300/20 bg-rose-300/12 text-rose-100",
        tone === "info" && "border-cyan-300/20 bg-cyan-300/12 text-cyan-100",
        tone === "neutral" && "border-white/12 bg-white/[0.05] text-slate-200"
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
