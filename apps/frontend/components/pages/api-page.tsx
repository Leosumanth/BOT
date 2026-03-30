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

type SectionId = "ethereum" | "base" | "flashbots";

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
  const isBusy = isSaving || isDeleting || isTestingOne || isTestingAll;
  const summary = summarize(entries, testResults);
  const sections = buildSections(entries);

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
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-panel">
        <div className="grid gap-6 border-b border-blue-100 bg-[radial-gradient(circle_at_16%_18%,rgba(77,235,210,0.18),transparent_20%),radial-gradient(circle_at_84%_22%,rgba(70,82,220,0.16),transparent_24%),linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] px-6 py-7 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <HeroChip label="Encrypted storage" />
              <HeroChip label="Values hidden after save" />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">API Security Hub</p>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                One place to keep provider keys clean, private, and working.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Review everything fast, replace broken keys, and keep saved secrets hidden from the UI.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryTile label="Managed" toneClass="bg-[#3648b9]" value={String(summary.managed)} />
            <SummaryTile label="Valid" toneClass="bg-[#2cc7b5]" value={String(summary.valid)} />
            <SummaryTile label="Not valid" toneClass="bg-[#ef476f]" value={String(summary.invalid)} />
            <SummaryTile label="Untested" toneClass="bg-[#f4a62a]" value={String(summary.untested)} />
          </div>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="rounded-2xl border border-blue-100 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
            {feedback ?? (lastTestedAt ? `Last tested ${formatDateTime(lastTestedAt)}` : "Select a key to save, test, or delete its stored override.")}
          </div>
          <Button className="rounded-full px-6" disabled={isBusy} size="lg" type="button" onClick={handleTestAll}>
            {isTestingAll ? "Testing..." : "Test all keys"}
          </Button>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-5">
          {sections.map((section) => (
            <Card key={section.id} className="overflow-hidden border-blue-100 bg-white shadow-panel">
              <CardHeader className="border-b border-blue-100/80 bg-[linear-gradient(180deg,rgba(248,251,255,0.9),rgba(255,255,255,1))] pb-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{section.kicker}</p>
                    <CardTitle className="mt-2 text-2xl text-foreground">{section.title}</CardTitle>
                    <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
                  </div>
                  <div className={cn("rounded-[1.25rem] px-4 py-3 text-sm font-semibold", section.countClass)}>
                    {section.entries.length} keys
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 md:grid-cols-2">
                {section.entries.map((entry) => {
                  const active = selectedEntry?.key === entry.key;
                  const status = getDisplayStatus(entry, testResults[entry.key]);

                  return (
                    <button
                      key={entry.key}
                      className={cn(
                        "rounded-[1.5rem] border p-4 text-left transition",
                        active
                          ? "border-blue-200 bg-[linear-gradient(135deg,#eef2ff,#fbfdff)] shadow-[0_18px_35px_rgba(54,72,185,0.10)]"
                          : "border-border bg-white hover:border-blue-100 hover:bg-muted/35"
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
                          <div className="mt-3 flex flex-wrap gap-2">
                            <MetaPill label={providerLabel(entry.provider)} />
                            {entry.chain ? <MetaPill label={chainLabel(entry.chain)} /> : null}
                            {entry.transport ? <MetaPill label={entry.transport.toUpperCase()} /> : null}
                          </div>
                        </div>
                      </div>

                      <p className="mt-4 truncate font-mono text-[11px] text-muted-foreground">{entry.key}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{getSourceLabel(entry)}</p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-5 xl:sticky xl:top-28 xl:self-start">
          <Card className="overflow-hidden border-blue-100 bg-white shadow-panel">
            <CardHeader className="border-b border-blue-100 bg-[linear-gradient(180deg,rgba(247,250,255,0.96),rgba(255,255,255,1))] pb-5">
              {selectedEntry ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Selected key</p>
                      <CardTitle className="mt-2 text-2xl text-foreground">{selectedEntry.label}</CardTitle>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">{selectedEntry.key}</p>
                    </div>
                    {selectedStatus ? <StatusPill label={selectedStatus.label} tone={selectedStatus.tone} /> : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <HeroChip label={providerLabel(selectedEntry.provider)} />
                    <HeroChip label={getSourceLabel(selectedEntry)} />
                    {selectedEntry.chain ? <HeroChip label={chainLabel(selectedEntry.chain)} /> : null}
                    {selectedEntry.transport ? <HeroChip label={selectedEntry.transport.toUpperCase()} /> : null}
                  </div>
                </div>
              ) : (
                <CardTitle className="text-2xl text-foreground">Select a key</CardTitle>
              )}
            </CardHeader>

            <CardContent className="space-y-5 p-6">
              {selectedEntry ? (
                <>
                  <div className="rounded-[1.75rem] border border-blue-100 bg-[linear-gradient(135deg,#ffffff,#f7fbff)] p-5">
                    <label className="space-y-2 text-sm font-medium text-foreground">
                      <span>Paste new value</span>
                      <Input
                        autoCapitalize="none"
                        autoComplete="new-password"
                        autoCorrect="off"
                        className="h-12 rounded-2xl border-blue-100 bg-white text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                        placeholder={selectedEntry.kind === "url" ? "Paste endpoint or provider URL" : "Paste secret key"}
                        spellCheck={false}
                        type="password"
                        value={draftValue}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setDraftValue(event.target.value)}
                      />
                    </label>

                    <p className="mt-3 text-xs leading-5 text-muted-foreground">Saved values are encrypted and never rendered back into the UI.</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button className="h-12 rounded-full" disabled={isBusy} type="button" onClick={handleSave}>
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                    <Button className="h-12 rounded-full" disabled={isBusy} type="button" variant="outline" onClick={handleTestOne}>
                      {isTestingOne ? "Testing..." : "Test"}
                    </Button>
                  </div>

                  <Button
                    className="h-12 w-full rounded-full"
                    disabled={isBusy || selectedEntry.source !== "database"}
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    {isDeleting ? "Deleting..." : "Delete saved override"}
                  </Button>

                  <div className="rounded-[1.5rem] border border-blue-100 bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">Validation</p>
                      {selectedStatus ? <StatusPill label={selectedStatus.label} tone={selectedStatus.tone} /> : null}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {selectedTest?.message ?? "No recent test for this key yet."}
                    </p>
                  </div>
                </>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Choose a key card to edit it here.
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

function buildSections(entries: ApiKeyRecord[]): Array<{
  id: SectionId;
  kicker: string;
  title: string;
  description: string;
  countClass: string;
  entries: ApiKeyRecord[];
}> {
  const sections = [
    {
      id: "ethereum" as const,
      kicker: "Mainnet",
      title: "Ethereum routes",
      description: "Primary and backup providers for Ethereum reads and subscriptions.",
      countClass: "bg-[#eef2ff] text-[#3648b9]",
      entries: entries.filter((entry) => entry.chain === "ethereum")
    },
    {
      id: "base" as const,
      kicker: "Network",
      title: "Base routes",
      description: "Provider coverage for Base transactions, reads, and websocket flow.",
      countClass: "bg-[#ecfdf9] text-[#0f766e]",
      entries: entries.filter((entry) => entry.chain === "base")
    },
    {
      id: "flashbots" as const,
      kicker: "Private flow",
      title: "Flashbots",
      description: "Relay and auth keys used when private bundle submission is enabled.",
      countClass: "bg-[#fff7ed] text-[#c2410c]",
      entries: entries.filter((entry) => entry.category === "flashbots")
    }
  ];

  return sections.filter((section) => section.entries.length > 0);
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

function SummaryTile({
  label,
  toneClass,
  value
}: {
  label: string;
  toneClass: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-[1.5rem] border border-white/90 bg-white/88 p-5 backdrop-blur">
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

function MetaPill({ label }: { label: string }): JSX.Element {
  return <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{label}</span>;
}

function HeroChip({ label }: { label: string }): JSX.Element {
  return <span className="rounded-full border border-blue-100 bg-white/90 px-3 py-1 text-xs font-medium text-primary">{label}</span>;
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
