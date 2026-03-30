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

type ProviderId = "alchemy" | "quicknode" | "flashbots";

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
  const selectedStatus = selectedEntry ? getDisplayStatus(selectedEntry, selectedTest) : null;
  const summary = summarize(entries, testResults);
  const providerGroups = buildProviderGroups(entries, testResults);
  const isBusy = isSaving || isDeleting || isTestingOne || isTestingAll;

  async function refreshEntries(): Promise<void> {
    const next = await backendFetch<ApiKeysDashboardResponse>("/api-keys");
    setEntries(next.entries);
  }

  function clearTestResult(key: ApiKeyRecord["key"]): void {
    setTestResults((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
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
      clearTestResult(selectedEntry.key);
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
      clearTestResult(selectedEntry.key);
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
    <div className="space-y-4">
      <Card className="border-blue-100 bg-white shadow-panel">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <SummaryChip label="Managed" value={summary.managed} />
              <SummaryChip label="Valid" tone="valid" value={summary.valid} />
              <SummaryChip label="Not valid" tone="invalid" value={summary.invalid} />
              <SummaryChip label="Untested" tone="warning" value={summary.untested} />
            </div>
            <p className="text-sm text-muted-foreground">
              {feedback ?? (lastTestedAt ? `Last tested ${formatDateTime(lastTestedAt)}` : "Manage provider keys from one compact view.")}
            </p>
          </div>

          <Button className="rounded-full px-6" disabled={isBusy} type="button" onClick={handleTestAll}>
            {isTestingAll ? "Testing..." : "Test all keys"}
          </Button>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-4">
          {providerGroups.map((group) => (
            <Card key={group.id} className="border-blue-100 bg-white shadow-panel">
              <CardHeader className="border-b border-blue-100/80 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg text-foreground">{group.title}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{group.subtitle}</p>
                  </div>
                  <div className="flex gap-2">
                    <MiniBadge label={`V ${group.summary.valid}`} tone="valid" />
                    <MiniBadge label={`N ${group.summary.invalid}`} tone="invalid" />
                    <MiniBadge label={`U ${group.summary.untested}`} tone="warning" />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-2 p-3">
                {group.entries.map((entry) => {
                  const active = selectedEntry?.key === entry.key;
                  const status = getDisplayStatus(entry, testResults[entry.key]);

                  return (
                    <button
                      key={entry.key}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-[1.25rem] border px-4 py-3 text-left transition",
                        active
                          ? "border-blue-200 bg-[linear-gradient(135deg,#eef2ff,#fbfdff)] shadow-[0_12px_26px_rgba(54,72,185,0.10)]"
                          : "border-border bg-white hover:border-blue-100 hover:bg-muted/30"
                      )}
                      type="button"
                      onClick={() => setSelectedKey(entry.key)}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{entry.label}</p>
                          <StatusPill label={status.label} tone={status.tone} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[entry.chain ? chainLabel(entry.chain) : null, entry.transport ? entry.transport.toUpperCase() : null, getSourceLabel(entry)]
                            .filter(Boolean)
                            .join(" • ")}
                        </p>
                      </div>
                      <span className="truncate font-mono text-[11px] text-muted-foreground">{entry.key}</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="xl:sticky xl:top-28 xl:self-start">
          <Card className="border-blue-100 bg-white shadow-panel">
            <CardHeader className="border-b border-blue-100/80 pb-4">
              {selectedEntry ? (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg text-foreground">{selectedEntry.label}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{providerLabel(selectedEntry.provider)}</p>
                  </div>
                  {selectedStatus ? <StatusPill label={selectedStatus.label} tone={selectedStatus.tone} /> : null}
                </div>
              ) : (
                <CardTitle className="text-lg text-foreground">Select a key</CardTitle>
              )}
            </CardHeader>

            <CardContent className="space-y-4 p-5">
              {selectedEntry ? (
                <>
                  <label className="space-y-2 text-sm font-medium text-foreground">
                    <span>New value</span>
                    <Input
                      autoCapitalize="none"
                      autoComplete="new-password"
                      autoCorrect="off"
                      className="h-11 rounded-2xl border-blue-100 bg-white text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                      placeholder={selectedEntry.kind === "url" ? "Paste provider URL" : "Paste secret key"}
                      spellCheck={false}
                      type="password"
                      value={draftValue}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setDraftValue(event.target.value)}
                    />
                  </label>

                  <div className="rounded-[1.25rem] border border-blue-100 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
                    {selectedTest?.message ?? "Saved values stay encrypted and are never shown back in the UI."}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button className="h-11 rounded-full" disabled={isBusy} type="button" onClick={handleSave}>
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                    <Button className="h-11 rounded-full" disabled={isBusy} type="button" variant="outline" onClick={handleTestOne}>
                      {isTestingOne ? "Testing..." : "Test"}
                    </Button>
                  </div>

                  <Button
                    className="h-11 w-full rounded-full"
                    disabled={isBusy || selectedEntry.source !== "database"}
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    {isDeleting ? "Deleting..." : "Delete saved"}
                  </Button>
                </>
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-border p-5 text-sm text-muted-foreground">
                  Pick a key from the left to edit it.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
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

function summarizeGroup(
  entries: ApiKeyRecord[],
  testResults: Record<ApiKeyRecord["key"], ApiKeyTestResult>
): {
  valid: number;
  invalid: number;
  untested: number;
} {
  return entries.reduce(
    (accumulator, entry) => {
      const status = getDisplayStatus(entry, testResults[entry.key]);

      if (status.tone === "valid") {
        accumulator.valid += 1;
      } else if (status.tone === "invalid") {
        accumulator.invalid += 1;
      } else {
        accumulator.untested += 1;
      }

      return accumulator;
    },
    { valid: 0, invalid: 0, untested: 0 }
  );
}

function buildProviderGroups(
  entries: ApiKeyRecord[],
  testResults: Record<ApiKeyRecord["key"], ApiKeyTestResult>
): Array<{
  id: ProviderId;
  title: string;
  subtitle: string;
  entries: ApiKeyRecord[];
  summary: { valid: number; invalid: number; untested: number };
}> {
  const groups = [
    {
      id: "alchemy" as const,
      title: "Alchemy",
      subtitle: "Ethereum and Base routes using Alchemy.",
      entries: entries.filter((entry) => entry.provider === "alchemy")
    },
    {
      id: "quicknode" as const,
      title: "QuickNode",
      subtitle: "Ethereum and Base routes using QuickNode.",
      entries: entries.filter((entry) => entry.provider === "quicknode")
    },
    {
      id: "flashbots" as const,
      title: "Flashbots",
      subtitle: "Relay and auth keys for private flow.",
      entries: entries.filter((entry) => entry.provider === "flashbots")
    }
  ];

  return groups
    .filter((group) => group.entries.length > 0)
    .map((group) => ({
      ...group,
      summary: summarizeGroup(group.entries, testResults)
    }));
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

function SummaryChip({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: number;
  tone?: "default" | "valid" | "warning" | "invalid";
}): JSX.Element {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium",
        tone === "default" && "border-blue-100 bg-white text-foreground",
        tone === "valid" && "border-teal-100 bg-teal-50 text-teal-700",
        tone === "warning" && "border-blue-100 bg-blue-50 text-blue-700",
        tone === "invalid" && "border-rose-100 bg-rose-50 text-rose-700"
      )}
    >
      <span>{label}</span>
      <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-foreground">{value}</span>
    </div>
  );
}

function MiniBadge({
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

function providerLabel(provider: ApiKeyRecord["provider"]): string {
  switch (provider) {
    case "alchemy":
      return "Alchemy";
    case "quicknode":
      return "QuickNode";
    case "flashbots":
      return "Flashbots";
    default:
      return provider;
  }
}

function chainLabel(chain: ApiKeyRecord["chain"]): string {
  if (chain === "ethereum") {
    return "Ethereum";
  }

  if (chain === "base") {
    return "Base";
  }

  return chain ?? "Network";
}

function getSourceLabel(entry: ApiKeyRecord): string {
  switch (entry.source) {
    case "database":
      return "Saved override";
    case "env":
      return "Environment";
    case "default":
      return "Default";
    case "unset":
      return "Not configured";
    default:
      return "Unknown";
  }
}
