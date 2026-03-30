"use client";

import type { ChangeEvent, JSX } from "react";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { ApiKeyRecord, ApiKeysDashboardResponse } from "@mintbot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backendFetch } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

type ConsoleTab = "overview" | "keys" | "activity";
type ActivityItem = {
  id: string;
  key: ApiKeyRecord["key"];
  label: string;
  action: "saved" | "reverted";
  timestamp: string;
};

const ACTIVITY_STORAGE_KEY = "mintbot-api-key-activity";
const tabs: Array<{ key: ConsoleTab; label: string; description: string }> = [
  { key: "overview", label: "Overview", description: "Provider readiness and runtime coverage." },
  { key: "keys", label: "Managed keys", description: "Search, filter, edit, disable, and revert overrides." },
  { key: "activity", label: "Activity", description: "Recent key changes from this browser session." }
];

export function ApiPage({ dashboard }: { dashboard: ApiKeysDashboardResponse }): JSX.Element {
  const [entries, setEntries] = useState<ApiKeyRecord[]>(dashboard.entries);
  const [selectedKey, setSelectedKey] = useState<ApiKeyRecord["key"] | null>(dashboard.entries[0]?.key ?? null);
  const [tab, setTab] = useState<ConsoleTab>("overview");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | ApiKeyRecord["source"]>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ApiKeyRecord["category"]>("all");
  const [draftValue, setDraftValue] = useState("");
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setEntries(dashboard.entries);
  }, [dashboard.entries]);

  useEffect(() => {
    if (!selectedKey && entries[0]) {
      setSelectedKey(entries[0].key);
      return;
    }

    if (selectedKey && !entries.some((entry) => entry.key === selectedKey)) {
      setSelectedKey(entries[0]?.key ?? null);
    }
  }, [entries, selectedKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const saved = window.localStorage.getItem(ACTIVITY_STORAGE_KEY);
      if (saved) {
        setActivity(JSON.parse(saved) as ActivityItem[]);
      }
    } catch {
      setActivity([]);
    }
  }, []);

  const summary = useMemo(() => summarize(entries), [entries]);
  const filteredEntries = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return entries.filter((entry) => {
      if (sourceFilter !== "all" && entry.source !== sourceFilter) {
        return false;
      }

      if (categoryFilter !== "all" && entry.category !== categoryFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [entry.key, entry.label, entry.provider, entry.description, entry.chain, entry.transport]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [categoryFilter, deferredSearch, entries, sourceFilter]);

  const selectedEntry = entries.find((entry) => entry.key === selectedKey) ?? filteredEntries[0] ?? entries[0] ?? null;

  useEffect(() => {
    if (!selectedEntry) {
      setDraftValue("");
      setDraftEnabled(true);
      return;
    }

    setDraftValue("");
    setDraftEnabled(selectedEntry.enabled);
  }, [selectedEntry?.key, selectedEntry?.enabled]);

  async function refreshEntries(): Promise<void> {
    const next = await backendFetch<ApiKeysDashboardResponse>("/api-keys");
    setEntries(next.entries);
  }

  function recordActivity(item: Omit<ActivityItem, "id" | "timestamp">): void {
    const nextEntry: ActivityItem = {
      ...item,
      id: `${item.key}-${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    setActivity((current) => {
      const next = [nextEntry, ...current].slice(0, 12);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }

  function handleSave(): void {
    if (!selectedEntry) {
      return;
    }

    if (selectedEntry.source !== "database" && draftEnabled && !draftValue.trim()) {
      setFeedback("Enter a new value before saving a dashboard override.");
      return;
    }

    if (!draftEnabled && !window.confirm(`Disable ${selectedEntry.label}? This will stop using it until you re-enable or revert.`)) {
      return;
    }

    startTransition(async () => {
      try {
        await backendFetch<ApiKeyRecord>(`/api-keys/${selectedEntry.key}`, {
          method: "PATCH",
          body: JSON.stringify({
            value: draftValue.trim() || undefined,
            enabled: draftEnabled
          })
        });

        await refreshEntries();
        recordActivity({ key: selectedEntry.key, label: selectedEntry.label, action: "saved" });
        setDraftValue("");
        setFeedback(draftEnabled ? `${selectedEntry.label} saved.` : `${selectedEntry.label} disabled.`);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to save this API key.");
      }
    });
  }

  function handleRevert(): void {
    if (!selectedEntry) {
      return;
    }

    if (
      !window.confirm(
        `Revert ${selectedEntry.label} to its env/default value? Any dashboard override for this key will be removed.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await backendFetch<{ removed: boolean }>(`/api-keys/${selectedEntry.key}`, {
          method: "DELETE"
        });

        await refreshEntries();
        recordActivity({ key: selectedEntry.key, label: selectedEntry.label, action: "reverted" });
        setDraftValue("");
        setFeedback(`${selectedEntry.label} reverted.`);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to revert this API key.");
      }
    });
  }

  async function copyKeyName(): Promise<void> {
    if (!selectedEntry || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedEntry.key);
      setFeedback(`${selectedEntry.key} copied.`);
    } catch {
      setFeedback("Unable to copy the key name.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>API key command center</CardTitle>
            <CardDescription>
              Manage provider credentials in one place. RPC endpoint routing stays on the RPC page, but the keys powering
              those providers live here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Managed keys" value={String(summary.total)} tone="default" />
            <SummaryCard label="Configured" value={String(summary.configured)} tone="success" />
            <SummaryCard label="DB overrides" value={String(summary.databaseOverrides)} tone="default" />
            <SummaryCard label="Disabled" value={String(summary.disabled)} tone="warning" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runtime impact</CardTitle>
            <CardDescription>Quick read on how ready the active provider credentials are right now.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ImpactRow label="RPC profiles configured" value={`${summary.rpcConfigured}/8`} tone={summary.rpcConfigured >= 4 ? "success" : "warning"} />
            <ImpactRow label="Flashbots bundle path" value={summary.flashbotsReady ? "Ready" : "Needs attention"} tone={summary.flashbotsReady ? "success" : "warning"} />
            <ImpactRow label="Environment-backed keys" value={String(summary.envBacked)} tone="default" />
            <ImpactRow label="Last refresh" value={formatDateTime(summary.lastRefreshedAt)} tone="default" />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-wrap gap-3">
        {tabs.map((item) => (
          <button
            key={item.key}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition",
              tab === item.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"
            )}
            type="button"
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </section>

      {tab === "overview" ? (
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Provider readiness</CardTitle>
              <CardDescription>How complete each provider footprint is across the keys this app knows how to manage.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {buildProviderSummaries(entries).map((provider) => (
                <div key={provider.provider} className="rounded-3xl border border-border bg-muted/45 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{provider.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{provider.description}</p>
                    </div>
                    <Badge variant={provider.ready ? "success" : "warning"}>{provider.ready ? "Ready" : "Partial"}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <MiniStat label="Configured" value={`${provider.configured}/${provider.total}`} />
                    <MiniStat label="Disabled" value={String(provider.disabled)} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Coverage map</CardTitle>
              <CardDescription>Which chain and transport combinations currently have usable provider keys behind them.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {buildCoverageRows(entries).map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-2xl border border-border bg-muted/45 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.description}</p>
                  </div>
                  <Badge variant={row.ready ? "success" : "warning"}>{row.ready ? "Configured" : "Missing"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {tab === "keys" ? (
        <section className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
          <Card>
            <CardHeader>
              <CardTitle>Managed keys</CardTitle>
              <CardDescription>Search by provider, chain, transport, or env name and focus the editor on one credential at a time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Input placeholder="Search keys..." value={search} onChange={(event) => setSearch(event.target.value)} />
                <select
                  className="flex h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value as "all" | ApiKeyRecord["category"])}
                >
                  <option value="all">All categories</option>
                  <option value="rpc">RPC</option>
                  <option value="flashbots">Flashbots</option>
                </select>
                <select
                  className="flex h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm"
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value as "all" | ApiKeyRecord["source"])}
                >
                  <option value="all">All sources</option>
                  <option value="database">Database override</option>
                  <option value="env">Environment</option>
                  <option value="default">Default</option>
                  <option value="unset">Unset</option>
                </select>
              </div>

              <div className="space-y-3">
                {filteredEntries.length ? (
                  filteredEntries.map((entry) => {
                    const active = selectedEntry?.key === entry.key;
                    return (
                      <button
                        key={entry.key}
                        className={cn(
                          "w-full rounded-3xl border px-4 py-4 text-left transition",
                          active ? "border-primary bg-primary/8 shadow-panel" : "border-border bg-muted/35 hover:bg-muted/55"
                        )}
                        type="button"
                        onClick={() => setSelectedKey(entry.key)}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{entry.label}</p>
                            <p className="mt-1 font-mono text-xs text-muted-foreground">{entry.key}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge>{titleCase(entry.provider)}</Badge>
                            <Badge variant={entry.enabled && entry.hasValue ? "success" : "warning"}>
                              {entry.enabled && entry.hasValue ? "Active" : entry.enabled ? "Waiting" : "Disabled"}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <TinyChip label={entry.category} />
                          {entry.chain ? <TinyChip label={entry.chain} /> : null}
                          {entry.transport ? <TinyChip label={entry.transport.toUpperCase()} /> : null}
                          <TinyChip label={`Source: ${entry.source}`} />
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    No keys match the current search and filters.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{selectedEntry?.label ?? "Select a key"}</CardTitle>
              <CardDescription>
                {selectedEntry
                  ? "Create an encrypted dashboard override, disable the key, or revert back to env/default behavior."
                  : "Choose a key from the list to edit it."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {selectedEntry ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <DetailRow label="Env name" value={selectedEntry.key} mono />
                    <DetailRow label="Current source" value={titleCase(selectedEntry.source)} />
                    <DetailRow label="Category" value={titleCase(selectedEntry.category)} />
                    <DetailRow label="Provider" value={titleCase(selectedEntry.provider)} />
                    <DetailRow label="Current value" value={selectedEntry.valueHint} />
                    <DetailRow label="Last updated" value={selectedEntry.updatedAt ? formatDateTime(selectedEntry.updatedAt) : "Not changed in dashboard"} />
                  </div>

                  <div className="rounded-3xl border border-border bg-muted/35 p-5">
                    <p className="text-sm font-semibold text-foreground">What this key controls</p>
                    <p className="mt-2 text-sm text-muted-foreground">{selectedEntry.description}</p>
                    {selectedEntry.linkedPage ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Endpoint routing stays on{" "}
                        <Link className="font-medium text-foreground underline decoration-border underline-offset-4" href={selectedEntry.linkedPage}>
                          {selectedEntry.linkedPage}
                        </Link>
                        .
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    <label className="space-y-2 text-sm font-medium text-foreground">
                      New override value
                      <Input
                        placeholder={selectedEntry.kind === "secret" ? "Paste a new secret value" : "https://..."}
                        type={selectedEntry.kind === "secret" ? "password" : "text"}
                        value={draftValue}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setDraftValue(event.target.value)}
                      />
                    </label>

                    <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground">
                      <input checked={draftEnabled} type="checkbox" onChange={(event) => setDraftEnabled(event.target.checked)} />
                      Keep this key enabled
                    </label>

                    <div className="flex flex-wrap gap-3">
                      <Button disabled={isPending} type="button" onClick={handleSave}>
                        {isPending ? "Saving..." : "Save override"}
                      </Button>
                      <Button disabled={isPending} type="button" variant="secondary" onClick={handleRevert}>
                        Revert to env/default
                      </Button>
                      <Button disabled={isPending} type="button" variant="ghost" onClick={copyKeyName}>
                        Copy env name
                      </Button>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {feedback ?? "Saved secrets stay masked. Paste a fresh value only when you want to replace the current override."}
                    </p>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                  No key selected yet.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {tab === "activity" ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Local activity trail</CardTitle>
              <CardDescription>This browser remembers your recent key saves and reverts to make admin work easier to follow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activity.length ? (
                activity.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/35 px-4 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{item.key}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant={item.action === "saved" ? "success" : "warning"}>{item.action === "saved" ? "Saved" : "Reverted"}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(item.timestamp)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                  No API key changes have been recorded in this browser yet.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function summarize(entries: ApiKeyRecord[]): ApiKeysDashboardResponse["summary"] {
  return {
    total: entries.length,
    configured: entries.filter((entry) => entry.enabled && entry.hasValue).length,
    databaseOverrides: entries.filter((entry) => entry.source === "database").length,
    envBacked: entries.filter((entry) => entry.source === "env").length,
    disabled: entries.filter((entry) => !entry.enabled).length,
    rpcConfigured: entries.filter((entry) => entry.category === "rpc" && entry.enabled && entry.hasValue).length,
    flashbotsReady: entries
      .filter((entry) => entry.category === "flashbots")
      .every((entry) => entry.enabled && entry.hasValue),
    lastRefreshedAt: new Date().toISOString()
  };
}

function buildProviderSummaries(entries: ApiKeyRecord[]): Array<{
  provider: ApiKeyRecord["provider"];
  label: string;
  description: string;
  total: number;
  configured: number;
  disabled: number;
  ready: boolean;
}> {
  return [
    {
      provider: "alchemy",
      label: "Alchemy",
      description: "Primary provider slots for Ethereum and Base, across HTTP and WebSocket.",
      total: entries.filter((entry) => entry.provider === "alchemy").length,
      configured: entries.filter((entry) => entry.provider === "alchemy" && entry.enabled && entry.hasValue).length,
      disabled: entries.filter((entry) => entry.provider === "alchemy" && !entry.enabled).length,
      ready: entries.filter((entry) => entry.provider === "alchemy").every((entry) => entry.enabled && entry.hasValue)
    },
    {
      provider: "quicknode",
      label: "QuickNode",
      description: "Failover provider slots used by the router to keep RPC coverage resilient.",
      total: entries.filter((entry) => entry.provider === "quicknode").length,
      configured: entries.filter((entry) => entry.provider === "quicknode" && entry.enabled && entry.hasValue).length,
      disabled: entries.filter((entry) => entry.provider === "quicknode" && !entry.enabled).length,
      ready: entries.filter((entry) => entry.provider === "quicknode").every((entry) => entry.enabled && entry.hasValue)
    },
    {
      provider: "flashbots",
      label: "Flashbots",
      description: "Private relay credentials used when tasks request bundle submission.",
      total: entries.filter((entry) => entry.provider === "flashbots").length,
      configured: entries.filter((entry) => entry.provider === "flashbots" && entry.enabled && entry.hasValue).length,
      disabled: entries.filter((entry) => entry.provider === "flashbots" && !entry.enabled).length,
      ready: entries.filter((entry) => entry.provider === "flashbots").every((entry) => entry.enabled && entry.hasValue)
    }
  ];
}

function buildCoverageRows(entries: ApiKeyRecord[]): Array<{ label: string; description: string; ready: boolean }> {
  return [
    { label: "Ethereum HTTP", description: "At least one HTTP provider key is available for Ethereum.", ready: hasCoverage(entries, "ethereum", "http") },
    { label: "Ethereum WebSocket", description: "At least one WebSocket provider key is available for Ethereum.", ready: hasCoverage(entries, "ethereum", "ws") },
    { label: "Base HTTP", description: "At least one HTTP provider key is available for Base.", ready: hasCoverage(entries, "base", "http") },
    { label: "Base WebSocket", description: "At least one WebSocket provider key is available for Base.", ready: hasCoverage(entries, "base", "ws") },
    {
      label: "Flashbots bundle auth",
      description: "Relay URL and signing key are both present and enabled for private bundles.",
      ready: entries.filter((entry) => entry.category === "flashbots").every((entry) => entry.enabled && entry.hasValue)
    }
  ];
}

function hasCoverage(entries: ApiKeyRecord[], chain: ApiKeyRecord["chain"], transport: ApiKeyRecord["transport"]): boolean {
  return entries.some((entry) => entry.chain === chain && entry.transport === transport && entry.enabled && entry.hasValue);
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "default" | "success" | "warning" }): JSX.Element {
  return (
    <div className="rounded-3xl border border-border bg-muted/45 p-4">
      <Badge variant={tone === "success" ? "success" : tone === "warning" ? "warning" : "default"}>{label}</Badge>
      <p className="mt-4 text-3xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ImpactRow({ label, value, tone }: { label: string; value: string; tone: "default" | "success" | "warning" }): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/45 px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant={tone === "success" ? "success" : tone === "warning" ? "warning" : "default"}>{value}</Badge>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-sm font-semibold text-foreground", mono ? "font-mono" : "")}>{value}</p>
    </div>
  );
}

function TinyChip({ label }: { label: string }): JSX.Element {
  return <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground">{titleCase(label)}</span>;
}
