"use client";

import type { ChangeEvent, FormEvent, JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  ApiConfigCreateRequest,
  ApiConfigRecord,
  ApiConfigTestResponse,
  ApiConfigUpdateRequest,
  ApiKeysDashboardResponse,
  ApiProviderId
} from "@mintbot/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backendFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type DrawerState = { mode: "create"; provider?: ApiProviderId } | { mode: "edit"; id: string } | null;

type ApiFormState = {
  provider: ApiProviderId;
  value: string;
};

const FALLBACK_PROVIDERS = [
  {
    provider: "opensea",
    label: "OpenSea",
    description: "Marketplace intelligence and drop awareness.",
    defaultEndpointUrl: "https://api.opensea.io/api/v2/collections/cryptopunks"
  },
  {
    provider: "etherscan",
    label: "Etherscan",
    description: "Explorer metadata and contract lookup.",
    defaultEndpointUrl: "https://api.etherscan.io/v2/api"
  },
  {
    provider: "drpc",
    label: "dRPC",
    description: "Authenticated RPC-service checks for automation support.",
    defaultEndpointUrl: "https://lb.drpc.live/ethereum"
  },
  {
    provider: "openai",
    label: "OpenAI",
    description: "AI-assisted automation and recovery support.",
    defaultEndpointUrl: "https://api.openai.com/v1/models"
  }
] as const satisfies Array<{
  provider: ApiProviderId;
  label: string;
  description: string;
  defaultEndpointUrl: string;
}>;

function createEmptyForm(provider: ApiProviderId = "opensea"): ApiFormState {
  return {
    provider,
    value: ""
  };
}

export function ApiPage({ dashboard }: { dashboard: ApiKeysDashboardResponse }): JSX.Element {
  const [data, setData] = useState<ApiKeysDashboardResponse>(dashboard);
  const [selectedId, setSelectedId] = useState<string | null>(dashboard.configs[0]?.id ?? null);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [form, setForm] = useState<ApiFormState>(createEmptyForm());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});

  useEffect(() => {
    setData(dashboard);
  }, [dashboard]);

  useEffect(() => {
    if (!selectedId && data.configs[0]) {
      setSelectedId(data.configs[0].id);
      return;
    }

    if (selectedId && !data.configs.some((config) => config.id === selectedId)) {
      setSelectedId(data.configs[0]?.id ?? null);
    }
  }, [data.configs, selectedId]);

  const selectedConfig = data.configs.find((entry) => entry.id === selectedId) ?? data.configs[0] ?? null;
  const providerCatalog = useMemo(() => FALLBACK_PROVIDERS.map((fallback) => ({ ...fallback })), []);
  const visibleProviders = useMemo(() => data.providers.filter((entry) => entry.configCount > 0), [data.providers]);

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

  function openCreate(provider?: ApiProviderId): void {
    setForm(createEmptyForm(provider ?? selectedConfig?.provider ?? "opensea"));
    setDrawer({ mode: "create", provider });
  }

  function openEdit(config: ApiConfigRecord): void {
    setForm({
      provider: config.provider,
      value: ""
    });
    setDrawer({ mode: "edit", id: config.id });
  }

  function closeDrawer(): void {
    setDrawer(null);
    setForm(createEmptyForm(selectedConfig?.provider ?? "opensea"));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const secret = form.value.trim();
    const providerName = providerLabel(form.provider);

    const saved = await runAction(drawer?.mode === "edit" ? `save-${drawer.id}` : "create-config", async () => {
      if (drawer?.mode === "edit") {
        await backendFetch<ApiConfigRecord>(`/api-keys/configs/${drawer.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            value: secret || undefined
          } satisfies ApiConfigUpdateRequest)
        });
        const next = await refreshDashboard(`${providerName} key updated.`);
        return { focusId: drawer.id, dashboard: next };
      }

      const created = await backendFetch<ApiConfigRecord>("/api-keys/configs", {
        method: "POST",
        body: JSON.stringify({
          provider: form.provider,
          value: secret
        } satisfies ApiConfigCreateRequest)
      });
      const next = await refreshDashboard(`${providerName} key added.`);
      return { focusId: created.id, dashboard: next };
    });

    if (saved) {
      setSelectedId(saved.focusId);
      closeDrawer();
    }
  }

  async function handleDelete(config: ApiConfigRecord): Promise<void> {
    if (config.source !== "database") {
      return;
    }

    if (!window.confirm(`Remove ${config.label} from the automation pool?`)) {
      return;
    }

    const removed = await runAction(`delete-${config.id}`, async () => {
      await backendFetch<{ removed: boolean }>(`/api-keys/configs/${config.id}`, {
        method: "DELETE"
      });
      return refreshDashboard(`${config.label} removed.`);
    });

    if (removed && selectedId === config.id) {
      setSelectedId(removed.configs[0]?.id ?? null);
    }
  }

  async function handleTest(config: ApiConfigRecord): Promise<void> {
    const result = await runAction(`test-${config.id}`, async () => {
      await backendFetch<ApiConfigTestResponse>(`/api-keys/configs/${config.id}/test`, {
        method: "POST"
      });
      return refreshDashboard(`${config.label} tested.`);
    });

    if (result) {
      setSelectedId(config.id);
    }
  }

  async function handleBenchmark(): Promise<void> {
    await runAction("benchmark", async () => {
      await backendFetch("/api-keys/maintenance/run", {
        method: "POST"
      });
      await refreshDashboard("Benchmark and maintenance run completed.");
    });
  }

  async function handleReveal(config: ApiConfigRecord): Promise<void> {
    const response = await runAction(`reveal-${config.id}`, async () =>
      backendFetch<{ id: string; value: string }>(`/api-keys/configs/${config.id}/secret`)
    );

    if (response) {
      setRevealedSecrets((current) => ({
        ...current,
        [config.id]: response.value
      }));
      setSelectedId(config.id);
    }
  }

  function handleHide(configId: string): void {
    setRevealedSecrets((current) => {
      const next = { ...current };
      delete next[configId];
      return next;
    });
  }

  async function handleCopy(config: ApiConfigRecord): Promise<void> {
    let value = revealedSecrets[config.id];
    if (!value) {
      const response = await runAction(`copy-${config.id}`, async () =>
        backendFetch<{ id: string; value: string }>(`/api-keys/configs/${config.id}/secret`)
      );

      if (!response) {
        return;
      }

      value = response.value;
      setRevealedSecrets((current) => ({
        ...current,
        [config.id]: response.value
      }));
    }

    await navigator.clipboard.writeText(value);
    setFeedback(`${config.label} copied.`);
  }

  function updateForm<K extends keyof ApiFormState>(key: K, value: ApiFormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <HeroSection data={data} feedback={feedback} busyKey={busyKey} onBenchmark={handleBenchmark} onCreate={openCreate} />

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="space-y-6">
          <ProviderGrid providers={visibleProviders} />
          <ConfigTable
            busyKey={busyKey}
            configs={data.configs}
            revealedSecrets={revealedSecrets}
            selectedId={selectedId}
            onCopy={handleCopy}
            onDelete={handleDelete}
            onEdit={openEdit}
            onHide={handleHide}
            onReveal={handleReveal}
            onSelect={setSelectedId}
            onTest={handleTest}
          />
        </div>

        <div className="space-y-6">
          <ReadinessCard data={data} onBenchmark={handleBenchmark} />
          <MaintenanceCard data={data} onBenchmark={handleBenchmark} />
          <ConfigDetail
            busyKey={busyKey}
            config={selectedConfig}
            revealedValue={selectedConfig ? revealedSecrets[selectedConfig.id] : undefined}
            onCopy={handleCopy}
            onDelete={handleDelete}
            onEdit={openEdit}
            onHide={handleHide}
            onReveal={handleReveal}
            onTest={handleTest}
          />
        </div>
      </section>

      <LogPanel logs={data.logs} />
      {drawer ? (
        <ConfigDrawer
          busyKey={busyKey}
          drawer={drawer}
          form={form}
          providerCatalog={providerCatalog}
          onClose={closeDrawer}
          onSubmit={handleSave}
          onUpdateForm={updateForm}
        />
      ) : null}
    </div>
  );
}

function HeroSection({
  data,
  feedback,
  busyKey,
  onBenchmark,
  onCreate
}: {
  data: ApiKeysDashboardResponse;
  feedback: string | null;
  busyKey: string | null;
  onBenchmark: () => Promise<void>;
  onCreate: (provider?: ApiProviderId) => void;
}): JSX.Element {
  const cards = [
    { label: "Configs", value: data.summary.totalConfigs },
    { label: "Active", value: data.summary.activeConfigs },
    { label: "Backups", value: data.summary.backupConfigs },
    { label: "Risk States", value: data.summary.invalidConfigs + data.summary.rateLimitedConfigs + data.summary.offlineConfigs },
    { label: "Failovers", value: data.summary.failoverActiveProviders }
  ];

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-[#07111d] text-white shadow-[0_30px_80px_rgba(3,9,24,0.55)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_26%),linear-gradient(180deg,rgba(8,15,28,0.96),rgba(4,8,18,0.98))]" />
      <div className="relative space-y-6 p-6 md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200/75">Autonomous API Control</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              External service APIs that benchmark themselves, fail over automatically, and stay mint-ready.
            </h1>
            <p className="text-sm leading-6 text-slate-300 md:text-base">
              This page manages only external service APIs. RPC routing stays on the dedicated RPC page while this dashboard focuses on keys, health,
              automation selection, pre-mint readiness, and recovery actions.
            </p>
            <p className="text-sm text-slate-400">
              {feedback ?? `${data.readiness.summary} Last refresh ${formatDateTime(data.summary.lastRefreshedAt)}.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              className="border border-cyan-300/20 bg-white/10 text-white hover:bg-white/15"
              disabled={busyKey === "benchmark"}
              type="button"
              variant="ghost"
              onClick={() => void onBenchmark()}
            >
              {busyKey === "benchmark" ? "Benchmarking..." : "Benchmark now"}
            </Button>
            <Button className="bg-cyan-300 text-slate-950 hover:bg-cyan-200" type="button" onClick={() => onCreate()}>
              Add API key
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <div key={card.label} className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProviderGrid({
  providers
}: {
  providers: ApiKeysDashboardResponse["providers"];
}): JSX.Element {
  return (
    <Card className="border-white/10 bg-[#07111d] text-white shadow-[0_20px_60px_rgba(2,8,20,0.45)]">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl text-white">Provider health matrix</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {providers.length ? (
          providers.map((provider) => (
            <div key={provider.provider} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{provider.label}</p>
                  <p className="mt-1 text-xs text-slate-400">{provider.description}</p>
                </div>
                <StatusBadge label={readinessLabel(provider.readiness)} tone={readinessTone(provider.readiness)} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Metric label="Active" value={provider.activeLabel ?? "None"} />
                <Metric label="Healthy" value={String(provider.healthyCount)} />
                <Metric label="Configs" value={String(provider.configCount)} />
                <Metric label="Latency" value={formatLatency(provider.averageLatencyMs)} />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-white/12 bg-white/[0.03] p-6 text-sm text-slate-300 md:col-span-2 2xl:col-span-4">
            Provider health will appear here after you add your first API key. Nothing is preloaded or evaluated until a real key exists.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfigTable({
  configs,
  selectedId,
  revealedSecrets,
  busyKey,
  onSelect,
  onEdit,
  onDelete,
  onTest,
  onReveal,
  onHide,
  onCopy
}: {
  configs: ApiConfigRecord[];
  selectedId: string | null;
  revealedSecrets: Record<string, string>;
  busyKey: string | null;
  onSelect: (id: string) => void;
  onEdit: (config: ApiConfigRecord) => void;
  onDelete: (config: ApiConfigRecord) => Promise<void>;
  onTest: (config: ApiConfigRecord) => Promise<void>;
  onReveal: (config: ApiConfigRecord) => Promise<void>;
  onHide: (id: string) => void;
  onCopy: (config: ApiConfigRecord) => Promise<void>;
}): JSX.Element {
  return (
    <Card className="border-white/10 bg-[#07111d] text-white shadow-[0_20px_60px_rgba(2,8,20,0.45)]">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl text-white">Stored API keys</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-[1040px] text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.2em] text-slate-400">
            <tr>
              <th className="pb-3 pr-4">Key</th>
              <th className="pb-3 pr-4">Secret</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3 pr-4">Role</th>
              <th className="pb-3 pr-4">Latency</th>
              <th className="pb-3 pr-4">Rate limit</th>
              <th className="pb-3 pr-4">Score</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {configs.length ? (
              configs.map((config) => {
                const revealed = revealedSecrets[config.id];
                return (
                  <tr
                    key={config.id}
                    className={cn(
                      "cursor-pointer border-t border-white/10 align-top transition",
                      selectedId === config.id ? "bg-cyan-300/8" : "hover:bg-white/[0.035]"
                    )}
                    onClick={() => onSelect(config.id)}
                  >
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-white">{config.label}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {providerLabel(config.provider)} | {config.source} | rank #{config.selection.rank}
                      </p>
                    </td>
                    <td className="py-4 pr-4 font-mono text-xs text-slate-300">{revealed ?? config.secretMask}</td>
                    <td className="py-4 pr-4">
                      <StatusBadge label={statusLabel(config.status)} tone={statusTone(config.status)} />
                    </td>
                    <td className="py-4 pr-4 text-slate-300">{config.isBackup ? `Backup P${config.priority}` : `Primary P${config.priority}`}</td>
                    <td className="py-4 pr-4 text-slate-300">{formatLatency(config.health.latencyMs)}</td>
                    <td className="py-4 pr-4 text-slate-300">{formatRateLimit(config)}</td>
                    <td className="py-4 pr-4 text-slate-300">{config.selection.value}</td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-2">
                        <MiniButton busy={busyKey === `test-${config.id}`} label="Test" onClick={() => void onTest(config)} />
                        <MiniButton label={revealed ? "Hide" : "Show"} onClick={() => (revealed ? onHide(config.id) : void onReveal(config))} />
                        <MiniButton label="Copy" onClick={() => void onCopy(config)} />
                        <MiniButton disabled={config.source !== "database"} label="Replace" onClick={() => onEdit(config)} />
                        <MiniButton disabled={config.source !== "database"} label="Delete" tone="danger" onClick={() => void onDelete(config)} />
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="py-8 text-sm text-slate-400" colSpan={8}>
                  No API keys are registered yet. Add your first provider key to start automated health tracking and failover.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ReadinessCard({ data, onBenchmark }: { data: ApiKeysDashboardResponse; onBenchmark: () => Promise<void> }): JSX.Element {
  const hasConfigs = data.configs.length > 0;
  return (
    <Card className="border-white/10 bg-[#07111d] text-white shadow-[0_20px_60px_rgba(2,8,20,0.45)]">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xl text-white">Pre-mint readiness</CardTitle>
          <StatusBadge label={hasConfigs ? readinessLabel(data.readiness.state) : "Standby"} tone={hasConfigs ? readinessTone(data.readiness.state) : "neutral"} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-300">
        {hasConfigs ? (
          <>
            <p>{data.readiness.summary}</p>
            <ul className="space-y-2">
              {data.readiness.blockers.map((entry) => (
                <li key={entry} className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-rose-100">
                  {entry}
                </li>
              ))}
              {data.readiness.warnings.map((entry) => (
                <li key={entry} className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-amber-100">
                  {entry}
                </li>
              ))}
              {!data.readiness.blockers.length && !data.readiness.warnings.length ? (
                <li className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-emerald-100">
                  All required providers are healthy, benchmarked, and ready for automation.
                </li>
              ) : null}
            </ul>
            <Button className="w-full bg-white/10 text-white hover:bg-white/15" type="button" variant="ghost" onClick={() => void onBenchmark()}>
              Refresh readiness now
            </Button>
          </>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-white/12 bg-white/[0.03] px-4 py-5 text-slate-300">
            Add your first external API key to enable live readiness checks, backup validation, and automation gating.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MaintenanceCard({ data, onBenchmark }: { data: ApiKeysDashboardResponse; onBenchmark: () => Promise<void> }): JSX.Element {
  const maintenance = data.maintenance;
  const hasConfigs = data.configs.length > 0;
  return (
    <Card className="border-white/10 bg-[#07111d] text-white shadow-[0_20px_60px_rgba(2,8,20,0.45)]">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xl text-white">Background maintenance</CardTitle>
          <StatusBadge
            label={hasConfigs ? maintenance.status : "Standby"}
            tone={hasConfigs ? (maintenance.status === "failed" ? "danger" : maintenance.status === "running" ? "warning" : "success") : "neutral"}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-300">
        {hasConfigs ? (
          <>
            <p>{maintenance.summary}</p>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Trigger" value={maintenance.trigger} />
              <Metric label="Checked" value={String(maintenance.checkedConfigs)} />
              <Metric label="Healthy" value={String(maintenance.healthyConfigs)} />
              <Metric label="Failovers" value={String(maintenance.failoversActivated)} />
              <Metric label="Warnings" value={String(maintenance.warnings)} />
              <Metric label="Completed" value={formatDateTime(maintenance.completedAt)} />
            </div>
            <Button className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200" type="button" onClick={() => void onBenchmark()}>
              Benchmark now
            </Button>
          </>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-white/12 bg-white/[0.03] px-4 py-5 text-slate-300">
            Background maintenance stays idle until at least one API key is registered.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfigDetail({
  config,
  revealedValue,
  busyKey,
  onEdit,
  onDelete,
  onTest,
  onReveal,
  onHide,
  onCopy
}: {
  config: ApiConfigRecord | null;
  revealedValue?: string;
  busyKey: string | null;
  onEdit: (config: ApiConfigRecord) => void;
  onDelete: (config: ApiConfigRecord) => Promise<void>;
  onTest: (config: ApiConfigRecord) => Promise<void>;
  onReveal: (config: ApiConfigRecord) => Promise<void>;
  onHide: (id: string) => void;
  onCopy: (config: ApiConfigRecord) => Promise<void>;
}): JSX.Element {
  return (
    <Card className="border-white/10 bg-[#07111d] text-white shadow-[0_20px_60px_rgba(2,8,20,0.45)]">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl text-white">{config ? config.label : "Select a key"}</CardTitle>
      </CardHeader>
      <CardContent>
        {config ? (
          <div className="space-y-5 text-sm text-slate-300">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={statusLabel(config.status)} tone={statusTone(config.status)} />
                <StatusBadge label={config.isBackup ? "Backup" : "Primary"} tone="info" />
                <StatusBadge label={config.source} tone="neutral" />
              </div>
              <p className="text-slate-400">{config.description}</p>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Masked secret</p>
              <p className="mt-3 break-all font-mono text-xs text-white">{revealedValue ?? config.secretMask}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <MiniButton busy={busyKey === `test-${config.id}`} label="Test" onClick={() => void onTest(config)} />
                <MiniButton label={revealedValue ? "Hide" : "Show"} onClick={() => (revealedValue ? onHide(config.id) : void onReveal(config))} />
                <MiniButton label="Copy" onClick={() => void onCopy(config)} />
                <MiniButton disabled={config.source !== "database"} label="Replace" onClick={() => onEdit(config)} />
                <MiniButton disabled={config.source !== "database"} label="Delete" tone="danger" onClick={() => void onDelete(config)} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Last checked" value={formatDateTime(config.health.lastCheckedAt)} />
              <Metric label="Latency" value={formatLatency(config.health.latencyMs)} />
              <Metric label="Rate limit" value={formatRateLimit(config)} />
              <Metric label="Selection score" value={`${config.selection.value} / #${config.selection.rank}`} />
              <Metric label="Failure count" value={String(config.memory.recentFailureCount)} />
              <Metric label="Failover frequency" value={String(config.memory.failoverFrequency)} />
              <Metric label="Recovery history" value={String(config.memory.recoverySuccessHistory)} />
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Automation decisions</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {config.selection.reasons.map((entry) => (
                  <li key={entry}>• {entry}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Failure classification</p>
              <p className="mt-3 text-white">{config.health.errorType ? errorLabel(config.health.errorType) : "No active error"}</p>
              <p className="mt-2 text-slate-400">{config.health.failureReason ?? "The latest probe completed without a failure."}</p>
              <p className="mt-3 break-all font-mono text-xs text-slate-500">{config.endpointUrl}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Pick a key from the table to inspect health, memory, recovery status, and secret controls.</p>
        )}
      </CardContent>
    </Card>
  );
}

function LogPanel({ logs }: { logs: ApiKeysDashboardResponse["logs"] }): JSX.Element {
  return (
    <Card className="border-white/10 bg-[#07111d] text-white shadow-[0_20px_60px_rgba(2,8,20,0.45)]">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl text-white">Automation decision log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {logs.length ? (
          logs.map((entry) => (
            <div key={entry.id} className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={entry.eventType} tone="info" />
                {entry.errorType ? <StatusBadge label={errorLabel(entry.errorType)} tone="danger" /> : null}
                <p className="text-xs text-slate-500">{formatDateTime(entry.timestamp)}</p>
              </div>
              <p className="mt-3 text-sm font-semibold text-white">{entry.apiName}</p>
              <p className="mt-1 text-sm text-slate-300">{entry.message}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                {entry.action} • {entry.result}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">Maintenance, failover, benchmark, and recovery decisions will appear here once the system starts observing configs.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ConfigDrawer({
  drawer,
  form,
  busyKey,
  providerCatalog,
  onClose,
  onSubmit,
  onUpdateForm
}: {
  drawer: DrawerState;
  form: ApiFormState;
  busyKey: string | null;
  providerCatalog: Array<{
    provider: ApiProviderId;
    label: string;
    description: string;
    defaultEndpointUrl: string;
  }>;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onUpdateForm: <K extends keyof ApiFormState>(key: K, value: ApiFormState[K]) => void;
}): JSX.Element {
  const selectedProvider = providerCatalog.find((entry) => entry.provider === form.provider);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#07111d] p-6 text-white shadow-[0_20px_60px_rgba(2,8,20,0.65)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{drawer?.mode === "edit" ? "Edit key" : "Add key"}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{drawer?.mode === "edit" ? "Replace stored API key" : "Add a supported API key"}</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
              Provider behavior is coded in the app. This drawer only stores the key. Labels, endpoints, priority, and failover defaults are managed automatically.
            </p>
          </div>
          <Button className="border border-white/10 bg-white/5 text-white hover:bg-white/10" type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <form className="mt-6 space-y-5" onSubmit={(event) => void onSubmit(event)}>
          <Field label="Provider">
            <select
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white"
              disabled={drawer?.mode === "edit"}
              value={form.provider}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const provider = event.target.value as ApiProviderId;
                onUpdateForm("provider", provider);
              }}
            >
              {providerCatalog.map((entry) => (
                <option key={entry.provider} value={entry.provider}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={drawer?.mode === "edit" ? "Replace key (optional)" : "API key"}>
            <Input
              className="border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
              placeholder={form.provider === "openai" ? "sk-..." : "Paste the provider key"}
              type="password"
              value={form.value}
              onChange={(event) => onUpdateForm("value", event.target.value)}
            />
          </Field>

          {selectedProvider ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-slate-300">
              <p className="font-medium text-white">{selectedProvider.label}</p>
              <p className="mt-2 text-slate-400">{selectedProvider.description}</p>
            </div>
          ) : null}

          <Button className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200" disabled={Boolean(busyKey)} type="submit">
            {busyKey ? "Saving..." : drawer?.mode === "edit" ? "Update key" : "Save key"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <label className="space-y-2 text-sm font-medium text-slate-300">
      <span>{label}</span>
      {children}
    </label>
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

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function MiniButton({
  label,
  onClick,
  busy = false,
  disabled = false,
  tone = "default"
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "default" | "danger";
}): JSX.Element {
  return (
    <button
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition",
        tone === "default" && "border-white/12 bg-white/[0.06] text-slate-200 hover:bg-white/[0.12]",
        tone === "danger" && "border-rose-300/18 bg-rose-300/10 text-rose-100 hover:bg-rose-300/16",
        (disabled || busy) && "cursor-not-allowed opacity-40"
      )}
      disabled={disabled || busy}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {busy ? "Working..." : label}
    </button>
  );
}

function providerLabel(provider: ApiProviderId): string {
  return FALLBACK_PROVIDERS.find((entry) => entry.provider === provider)?.label ?? provider;
}

function readinessLabel(state: ApiKeysDashboardResponse["readiness"]["state"]): string {
  return state === "ready" ? "Ready" : state === "warning" ? "Warning" : "Blocked";
}

function readinessTone(state: ApiKeysDashboardResponse["readiness"]["state"]): "success" | "warning" | "danger" {
  return state === "ready" ? "success" : state === "warning" ? "warning" : "danger";
}

function statusLabel(status: ApiConfigRecord["status"]): string {
  switch (status) {
    case "invalid-key":
      return "Invalid Key";
    case "rate-limited":
      return "Rate Limited";
    case "failover-active":
      return "Failover Active";
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

function errorLabel(errorType: NonNullable<ApiConfigRecord["health"]["errorType"]>): string {
  switch (errorType) {
    case "auth-error":
      return "Auth Error";
    case "invalid-response":
      return "Invalid Response";
    case "network-error":
      return "Network Error";
    case "rate-limited":
      return "Rate Limited";
    case "server-error":
      return "Server Error";
    case "timeout":
      return "Timeout";
    default:
      return "Unknown Error";
  }
}

function formatLatency(value?: number | null): string {
  return value ? `${value}ms` : "Not checked";
}

function formatPercent(value?: number | null): string {
  return value === null || value === undefined ? "0%" : `${Math.round(value)}%`;
}

function formatRateLimit(config: ApiConfigRecord): string {
  const snapshot = config.health.rateLimit;
  if (!snapshot.available) {
    return "Not reported";
  }

  if (snapshot.limit !== null && snapshot.remaining !== null) {
    return `${snapshot.remaining}/${snapshot.limit} left`;
  }

  return snapshot.resetAt ? `Resets ${formatDateTime(snapshot.resetAt)}` : "Tracked";
}
