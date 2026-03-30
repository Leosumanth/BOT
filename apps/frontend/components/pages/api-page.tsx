"use client";

import type { ChangeEvent, JSX } from "react";
import { useEffect, useState } from "react";
import type { ApiKeyRecord, ApiKeysDashboardResponse, ApiKeyTestResponse, ApiKeyTestResult } from "@mintbot/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backendFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ApiPage({ dashboard }: { dashboard: ApiKeysDashboardResponse }): JSX.Element {
  const [entries, setEntries] = useState<ApiKeyRecord[]>(dashboard.entries);
  const [selectedKey, setSelectedKey] = useState<ApiKeyRecord["key"] | null>(dashboard.entries[0]?.key ?? null);
  const [draftValue, setDraftValue] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<ApiKeyRecord["key"], ApiKeyTestResult>>({} as Record<ApiKeyRecord["key"], ApiKeyTestResult>);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTestingOne, setIsTestingOne] = useState(false);
  const [isTestingAll, setIsTestingAll] = useState(false);

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
    setDraftValue("");
  }, [selectedKey]);

  const selectedEntry = entries.find((entry) => entry.key === selectedKey) ?? entries[0] ?? null;
  const selectedTest = selectedEntry ? testResults[selectedEntry.key] : undefined;
  const isBusy = isSaving || isDeleting || isTestingOne || isTestingAll;
  const summary = summarize(entries, testResults);
  const selectedStatus = selectedEntry ? getDisplayStatus(selectedEntry, selectedTest) : null;

  async function refreshEntries(): Promise<void> {
    const next = await backendFetch<ApiKeysDashboardResponse>("/api-keys");
    setEntries(next.entries);
  }

  async function handleSave(): Promise<void> {
    if (!selectedEntry) {
      return;
    }

    if (!draftValue.trim()) {
      setFeedback("Enter an API key before saving.");
      return;
    }

    setIsSaving(true);
    try {
      await backendFetch<ApiKeyRecord>(`/api-keys/${selectedEntry.key}`, {
        method: "PATCH",
        body: JSON.stringify({
          value: draftValue.trim(),
          enabled: true
        })
      });

      await refreshEntries();
      setDraftValue("");
      setFeedback(`${selectedEntry.label} saved.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to save this API key.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!selectedEntry || selectedEntry.source !== "database") {
      return;
    }

    if (!window.confirm(`Delete the saved key for ${selectedEntry.label}?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await backendFetch<{ removed: boolean }>(`/api-keys/${selectedEntry.key}`, {
        method: "DELETE"
      });

      await refreshEntries();
      setDraftValue("");
      setFeedback(`${selectedEntry.label} deleted.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to delete this API key.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleTestOne(): Promise<void> {
    if (!selectedEntry) {
      return;
    }

    setIsTestingOne(true);
    try {
      const result = await backendFetch<ApiKeyTestResult>(`/api-keys/${selectedEntry.key}/test`, {
        method: "POST"
      });

      setTestResults((current) => ({
        ...current,
        [result.key]: result
      }));
      setLastTestedAt(result.testedAt);
      setFeedback(`${selectedEntry.label}: ${result.status === "invalid" ? "not valid" : result.status}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to test this API key.");
    } finally {
      setIsTestingOne(false);
    }
  }

  async function handleTestAll(): Promise<void> {
    setIsTestingAll(true);
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
      setFeedback(`Tested all keys: ${response.summary.valid} valid, ${response.summary.invalid} not valid.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to test API keys.");
    } finally {
      setIsTestingAll(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-blue-100 bg-white shadow-panel">
        <CardContent className="p-6 md:p-8">
          <div className="rounded-[2rem] border border-blue-100 bg-[radial-gradient(circle_at_18%_20%,rgba(89,95,255,0.12),transparent_22%),radial-gradient(circle_at_78%_28%,rgba(77,235,210,0.18),transparent_24%),linear-gradient(135deg,#ffffff_0%,#f7fbff_100%)] p-6 md:p-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">API Key Command Center</p>
                <CardTitle className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Manage keys safely, test them fast, and keep broken providers out.
                </CardTitle>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Keys stay encrypted, hidden after save, and easy to review from one screen.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <SecurityChip label="Encrypted" />
                <SecurityChip label="Hidden after save" />
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Managed" toneClass="bg-[#3648b9]" value={String(summary.managed)} />
                <SummaryCard label="Valid" toneClass="bg-[#2cc7b5]" value={String(summary.valid)} />
                <SummaryCard label="Not valid" toneClass="bg-[#ef476f]" value={String(summary.invalid)} />
                <SummaryCard label="Untested" toneClass="bg-[#f4a62a]" value={String(summary.untested)} />
              </div>
              <Button className="min-w-[170px] rounded-full px-6" disabled={isBusy} type="button" onClick={handleTestAll}>
                {isTestingAll ? "Testing..." : "Test all keys"}
              </Button>
            </div>

            {feedback || lastTestedAt ? (
              <div className="mt-6 rounded-2xl border border-blue-100 bg-white/80 px-4 py-3 text-sm text-muted-foreground">
                {feedback ?? `Last tested ${formatDateTime(lastTestedAt!)}`}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-blue-100 bg-white/95 shadow-panel">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-foreground">All keys</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
            {entries.map((entry) => {
              const active = selectedEntry?.key === entry.key;
              const status = getDisplayStatus(entry, testResults[entry.key]);

              return (
                <button
                  key={entry.key}
                  className={cn(
                    "w-full rounded-[1.5rem] border px-4 py-4 text-left transition",
                    active
                      ? "border-blue-200 bg-[linear-gradient(135deg,#eef2ff,#fbfdff)] shadow-[0_18px_40px_rgba(54,72,185,0.10)]"
                      : "border-border bg-white hover:border-blue-100 hover:bg-muted/40"
                  )}
                  type="button"
                  onClick={() => setSelectedKey(entry.key)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{entry.label}</p>
                        <StatusPill label={status.label} tone={status.tone} />
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{entry.key}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{getSourceLabel(entry)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-blue-100 bg-white/95 shadow-panel">
          <CardHeader className="gap-4 border-b border-blue-100 pb-5">
            {selectedEntry ? (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl text-foreground">{selectedEntry.label}</CardTitle>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">{selectedEntry.key}</p>
                </div>
                {selectedStatus ? <StatusPill label={selectedStatus.label} tone={selectedStatus.tone} /> : null}
              </div>
            ) : (
              <CardTitle className="text-xl text-foreground">Select a key</CardTitle>
            )}

            {selectedEntry ? (
              <div className="flex flex-wrap gap-2">
                <SecurityChip label={getSourceLabel(selectedEntry)} />
                {selectedEntry.source === "database" ? <SecurityChip label="Delete available" /> : null}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            {selectedEntry ? (
              <>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>New value</span>
                  <Input
                    autoCapitalize="none"
                    autoComplete="new-password"
                    autoCorrect="off"
                    className="h-12 rounded-2xl border-blue-100 bg-white text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                    placeholder="Paste new value"
                    spellCheck={false}
                    type="password"
                    value={draftValue}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setDraftValue(event.target.value)}
                  />
                </label>

                <div className="rounded-2xl border border-blue-100 bg-[linear-gradient(135deg,#ffffff,#f7fbff)] px-4 py-3 text-sm text-muted-foreground">
                  {selectedTest?.message ?? "Saved values are never shown again after storage."}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Button className="h-12 rounded-full" disabled={isBusy} type="button" onClick={handleSave}>
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button className="h-12 rounded-full" disabled={isBusy} type="button" variant="outline" onClick={handleTestOne}>
                    {isTestingOne ? "Testing..." : "Test"}
                  </Button>
                  <Button
                    className="h-12 rounded-full"
                    disabled={isBusy || selectedEntry.source !== "database"}
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    {isDeleting ? "Deleting..." : "Delete saved"}
                  </Button>
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
    </div>
  );
}

function summarize(
  entries: ApiKeyRecord[],
  testResults: Record<ApiKeyRecord["key"], ApiKeyTestResult>
): {
  managed: number;
  valid: number;
  invalid: number;
  untested: number;
} {
  let valid = 0;
  let invalid = 0;
  let untested = 0;

  for (const entry of entries) {
    const test = testResults[entry.key];

    if (test?.status === "valid") {
      valid += 1;
      continue;
    }

    if (test?.status === "invalid") {
      invalid += 1;
      continue;
    }

    if (!entry.hasValue) {
      invalid += 1;
      continue;
    }

    untested += 1;
  }

  return {
    managed: entries.length,
    valid,
    invalid,
    untested
  };
}

function getDisplayStatus(
  entry: ApiKeyRecord,
  test?: ApiKeyTestResult
): { label: string; tone: "valid" | "warning" | "invalid" } {
  if (test?.status === "valid") {
    return { label: "Valid", tone: "valid" };
  }

  if (test?.status === "invalid") {
    return { label: "Not valid", tone: "invalid" };
  }

  if (test?.status === "skipped") {
    return { label: "Skipped", tone: "warning" };
  }

  if (!entry.hasValue) {
    return { label: "Not valid", tone: "invalid" };
  }

  return { label: "Untested", tone: "warning" };
}

function SummaryCard({
  label,
  toneClass,
  value
}: {
  label: string;
  toneClass: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-[1.5rem] border border-white/80 bg-white/86 p-5 backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className={cn("h-2.5 w-2.5 rounded-full", toneClass)} />
        <span>{label}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function StatusPill({
  label,
  tone
}: {
  label: string;
  tone: "valid" | "warning" | "invalid";
}): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "valid" && "bg-teal-50 text-teal-700",
        tone === "warning" && "bg-blue-50 text-blue-700",
        tone === "invalid" && "bg-rose-50 text-rose-700"
      )}
    >
      {label}
    </span>
  );
}

function SecurityChip({ label }: { label: string }): JSX.Element {
  return (
    <span className="inline-flex items-center rounded-full border border-blue-100 bg-white/90 px-3 py-1 text-xs font-medium text-primary">
      {label}
    </span>
  );
}

function getSourceLabel(entry: ApiKeyRecord): string {
  switch (entry.source) {
    case "database":
      return "Saved in dashboard";
    case "env":
      return "Using environment value";
    case "default":
      return "Using default value";
    case "unset":
      return "Not configured";
    default:
      return "Unknown source";
  }
}
