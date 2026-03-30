"use client";

import type { ChangeEvent, JSX } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ApiKeyRecord, ApiKeysDashboardResponse, ApiKeyTestResponse, ApiKeyTestResult } from "@mintbot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backendFetch } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

type ActivityItem = {
  id: string;
  key: ApiKeyRecord["key"];
  label: string;
  action: "saved" | "reverted";
  timestamp: string;
};

const ACTIVITY_STORAGE_KEY = "mintbot-api-key-activity";

export function ApiPage({ dashboard }: { dashboard: ApiKeysDashboardResponse }): JSX.Element {
  const [entries, setEntries] = useState<ApiKeyRecord[]>(dashboard.entries);
  const [selectedKey, setSelectedKey] = useState<ApiKeyRecord["key"] | null>(dashboard.entries[0]?.key ?? null);
  const [draftValue, setDraftValue] = useState("");
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [testResults, setTestResults] = useState<Record<ApiKeyRecord["key"], ApiKeyTestResult>>({} as Record<ApiKeyRecord["key"], ApiKeyTestResult>);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [isTesting, startTestingTransition] = useTransition();

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

  useEffect(() => {
    const selectedEntry = entries.find((entry) => entry.key === selectedKey);
    setDraftValue("");
    setDraftEnabled(selectedEntry?.enabled ?? true);
  }, [entries, selectedKey]);

  const summary = useMemo(() => summarize(entries), [entries]);
  const selectedEntry = entries.find((entry) => entry.key === selectedKey) ?? entries[0] ?? null;
  const selectedTest = selectedEntry ? testResults[selectedEntry.key] : undefined;
  const testSummary = useMemo(() => summarizeTests(testResults), [testResults]);

  async function refreshEntries(): Promise<void> {
    const next = await backendFetch<ApiKeysDashboardResponse>("/api-keys");
    setEntries(next.entries);
    setTestResults({} as Record<ApiKeyRecord["key"], ApiKeyTestResult>);
    setLastTestedAt(null);
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

    startSaveTransition(async () => {
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

    startSaveTransition(async () => {
      try {
        await backendFetch<{ removed: boolean }>(`/api-keys/${selectedEntry.key}`, {
          method: "DELETE"
        });

        await refreshEntries();
        recordActivity({ key: selectedEntry.key, label: selectedEntry.label, action: "reverted" });
        setFeedback(`${selectedEntry.label} reverted.`);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to revert this API key.");
      }
    });
  }

  function handleTestAll(): void {
    startTestingTransition(async () => {
      try {
        const response = await backendFetch<ApiKeyTestResponse>("/api-keys/test", {
          method: "POST"
        });

        setTestResults(
          response.results.reduce(
            (accumulator, result) => {
              accumulator[result.key] = result;
              return accumulator;
            },
            {} as Record<ApiKeyRecord["key"], ApiKeyTestResult>
          )
        );
        setLastTestedAt(response.testedAt);
        setFeedback(`Tested all keys: ${response.summary.valid} valid, ${response.summary.invalid} invalid, ${response.summary.skipped} skipped.`);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to test API keys.");
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
      <Card>
        <CardHeader className="gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <CardTitle>API key command center</CardTitle>
            <CardDescription className="mt-2">
              Keep provider credentials clean in one place, test them together, and remove bad entries fast. RPC endpoint
              routing still stays on the RPC page.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={isTesting || isSaving} type="button" onClick={handleTestAll}>
              {isTesting ? "Testing keys..." : "Test all keys"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Managed keys" value={String(summary.total)} tone="default" />
            <SummaryCard label="Configured" value={String(summary.configured)} tone="success" />
            <SummaryCard label="Invalid after test" value={String(testSummary.invalid)} tone={testSummary.invalid ? "destructive" : "default"} />
            <SummaryCard label="Last tested" value={lastTestedAt ? formatDateTime(lastTestedAt) : "Not run"} tone="default" />
          </div>
          <p className="text-sm text-muted-foreground">
            {feedback ?? "Run a full key test whenever you want to spot invalid providers before cleaning them up."}
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Managed keys</CardTitle>
            <CardDescription>All known provider keys are listed here. No search needed for this smaller, high-signal set.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {entries.map((entry) => {
              const active = selectedEntry?.key === entry.key;
              const test = testResults[entry.key];
              const status = getOperationalStatus(entry);

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
                      <Badge variant={test ? badgeVariantForTest(test.status) : status.variant}>{test ? titleCase(test.status) : status.label}</Badge>
                    </div>
                  </div>

                  <p className="mt-4 text-sm text-muted-foreground">
                    {entry.valueHint} • Source: {titleCase(entry.source)}
                    {test ? ` • ${test.message}` : ""}
                  </p>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedEntry?.label ?? "Select a key"}</CardTitle>
            <CardDescription>
              {selectedEntry
                ? "Create an encrypted override, disable the key, or revert it. Test all keys after changes to confirm the provider is actually usable."
                : "Choose a key from the list to edit it."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedEntry ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <DetailRow label="Env name" value={selectedEntry.key} mono />
                  <DetailRow label="Current source" value={titleCase(selectedEntry.source)} />
                  <DetailRow label="Provider" value={titleCase(selectedEntry.provider)} />
                  <DetailRow label="Last updated" value={selectedEntry.updatedAt ? formatDateTime(selectedEntry.updatedAt) : "Not changed in dashboard"} />
                </div>

                <div className="rounded-3xl border border-border bg-muted/35 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Validation status</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selectedTest ? selectedTest.message : "Not tested yet. Use the button above to test every key together."}
                      </p>
                    </div>
                    <Badge variant={selectedTest ? badgeVariantForTest(selectedTest.status) : "default"}>
                      {selectedTest ? titleCase(selectedTest.status) : "Untested"}
                    </Badge>
                  </div>
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
                    <Button disabled={isSaving || isTesting} type="button" onClick={handleSave}>
                      {isSaving ? "Saving..." : "Save override"}
                    </Button>
                    <Button disabled={isSaving || isTesting} type="button" variant="secondary" onClick={handleRevert}>
                      Revert to env/default
                    </Button>
                    <Button disabled={isSaving || isTesting} type="button" variant="ghost" onClick={copyKeyName}>
                      Copy env name
                    </Button>
                  </div>
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

      <Card>
        <CardHeader>
          <CardTitle>Local activity trail</CardTitle>
          <CardDescription>This browser remembers your recent key saves and reverts so you can track what changed.</CardDescription>
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

function summarizeTests(testResults: Record<string, ApiKeyTestResult>): { invalid: number } {
  return {
    invalid: Object.values(testResults).filter((entry) => entry.status === "invalid").length
  };
}

function getOperationalStatus(entry: ApiKeyRecord): { label: string; variant: "success" | "warning" | "default" } {
  if (!entry.enabled) {
    return { label: "Disabled", variant: "warning" };
  }

  if (entry.hasValue) {
    return { label: "Active", variant: "success" };
  }

  return { label: "Waiting", variant: "warning" };
}

function badgeVariantForTest(status: ApiKeyTestResult["status"]): "success" | "warning" | "destructive" {
  if (status === "valid") {
    return "success";
  }

  if (status === "invalid") {
    return "destructive";
  }

  return "warning";
}

function SummaryCard({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "default" | "success" | "warning" | "destructive";
}): JSX.Element {
  return (
    <div className="rounded-3xl border border-border bg-muted/45 p-4">
      <Badge variant={tone}>{label}</Badge>
      <p className="mt-4 text-3xl font-semibold text-foreground">{value}</p>
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
