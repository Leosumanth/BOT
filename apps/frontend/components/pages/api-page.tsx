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
      <Card className="overflow-hidden border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,246,255,0.96))] shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <CardHeader className="gap-5 border-b border-slate-200/80 pb-5 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <SecurityChip label="Encrypted storage" />
              <SecurityChip label="Hidden after save" />
            </div>
            <div>
              <CardTitle className="text-xl text-slate-950">Secure API Key Control</CardTitle>
            </div>
          </div>
          <Button
            className="min-w-[160px] rounded-2xl bg-slate-950 text-white hover:bg-slate-900"
            disabled={isBusy}
            type="button"
            onClick={handleTestAll}
          >
            {isTestingAll ? "Testing..." : "Test all keys"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Managed" toneClass="bg-slate-900" value={String(summary.managed)} />
            <SummaryCard label="Valid" toneClass="bg-emerald-500" value={String(summary.valid)} />
            <SummaryCard label="Not valid" toneClass="bg-rose-500" value={String(summary.invalid)} />
            <SummaryCard label="Untested" toneClass="bg-amber-500" value={String(summary.untested)} />
          </div>
          {feedback || lastTestedAt ? (
            <div className="rounded-2xl border border-slate-200 bg-white/75 px-4 py-3 text-sm text-slate-600">
              {feedback ?? `Last tested ${formatDateTime(lastTestedAt!)}`}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-slate-200/80 bg-white/95 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-slate-950">All keys</CardTitle>
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
                      ? "border-blue-500 bg-blue-50 shadow-[0_14px_30px_rgba(37,99,235,0.14)]"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  )}
                  type="button"
                  onClick={() => setSelectedKey(entry.key)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-950">{entry.label}</p>
                        <StatusPill label={status.label} tone={status.tone} />
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{entry.key}</p>
                      <p className="mt-2 text-xs text-slate-500">{getSourceLabel(entry)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/95 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
          <CardHeader className="gap-4 border-b border-slate-200/80 pb-5">
            {selectedEntry ? (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl text-slate-950">{selectedEntry.label}</CardTitle>
                  <p className="mt-2 font-mono text-xs text-slate-500">{selectedEntry.key}</p>
                </div>
                {selectedStatus ? <StatusPill label={selectedStatus.label} tone={selectedStatus.tone} /> : null}
              </div>
            ) : (
              <CardTitle className="text-xl text-slate-950">Select a key</CardTitle>
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
                <label className="space-y-2 text-sm font-medium text-slate-900">
                  <span>New value</span>
                  <Input
                    autoCapitalize="none"
                    autoComplete="new-password"
                    autoCorrect="off"
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 text-slate-950 placeholder:text-slate-400 focus-visible:ring-blue-500"
                    placeholder="Paste new value"
                    spellCheck={false}
                    type="password"
                    value={draftValue}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setDraftValue(event.target.value)}
                  />
                </label>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {selectedTest?.message ?? "Saved values are never shown again after storage."}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Button
                    className="h-12 rounded-2xl bg-slate-950 text-white hover:bg-slate-900"
                    disabled={isBusy}
                    type="button"
                    onClick={handleSave}
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    className="h-12 rounded-2xl border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                    disabled={isBusy}
                    type="button"
                    variant="outline"
                    onClick={handleTestOne}
                  >
                    {isTestingOne ? "Testing..." : "Test"}
                  </Button>
                  <Button
                    className="h-12 rounded-2xl"
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
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
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
  value,
}: {
  label: string;
  toneClass: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white/90 p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <span className={cn("h-2.5 w-2.5 rounded-full", toneClass)} />
        <span>{label}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-slate-950">{value}</p>
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
        tone === "valid" && "bg-emerald-50 text-emerald-700",
        tone === "warning" && "bg-amber-50 text-amber-700",
        tone === "invalid" && "bg-rose-50 text-rose-700"
      )}
    >
      {label}
    </span>
  );
}

function SecurityChip({ label }: { label: string }): JSX.Element {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/85 px-3 py-1 text-xs font-medium text-slate-600">
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
