"use client";

import type { ChangeEvent, JSX } from "react";
import { useEffect, useState } from "react";
import type { ApiKeyRecord, ApiKeysDashboardResponse, ApiKeyTestResponse, ApiKeyTestResult } from "@mintbot/shared";
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>API Keys</CardTitle>
          <Button disabled={isBusy} type="button" onClick={handleTestAll}>
            {isTestingAll ? "Testing..." : "Test all keys"}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {feedback ?? (lastTestedAt ? `Last tested ${formatDateTime(lastTestedAt)}` : "Select a key to manage it.")}
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Keys</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entries.map((entry) => {
              const active = selectedEntry?.key === entry.key;
              const status = getDisplayStatus(entry, testResults[entry.key]);

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
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{entry.label}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{entry.key}</p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>{selectedEntry?.label ?? "Select a key"}</CardTitle>
              {selectedEntry ? <p className="mt-2 font-mono text-xs text-muted-foreground">{selectedEntry.key}</p> : null}
            </div>
            {selectedEntry ? <Badge variant={getDisplayStatus(selectedEntry, selectedTest).variant}>{getDisplayStatus(selectedEntry, selectedTest).label}</Badge> : null}
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedEntry ? (
              <>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>API key</span>
                  <Input
                    placeholder={selectedEntry.kind === "secret" ? "Paste API key" : "https://..."}
                    type={selectedEntry.kind === "secret" ? "password" : "text"}
                    value={draftValue}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setDraftValue(event.target.value)}
                  />
                </label>

                {selectedTest ? <p className="text-sm text-muted-foreground">{selectedTest.message}</p> : null}

                <div className="flex flex-wrap gap-3">
                  <Button disabled={isBusy} type="button" onClick={handleSave}>
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button disabled={isBusy} type="button" variant="outline" onClick={handleTestOne}>
                    {isTestingOne ? "Testing..." : "Test"}
                  </Button>
                  <Button
                    disabled={isBusy || selectedEntry.source !== "database"}
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
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

function getDisplayStatus(
  entry: ApiKeyRecord,
  test?: ApiKeyTestResult
): { label: string; variant: "success" | "warning" | "destructive" | "default" } {
  if (test?.status === "valid") {
    return { label: "Valid", variant: "success" };
  }

  if (test?.status === "invalid") {
    return { label: "Not valid", variant: "destructive" };
  }

  if (test?.status === "skipped") {
    return { label: "Skipped", variant: "warning" };
  }

  if (!entry.hasValue) {
    return { label: "Not valid", variant: "destructive" };
  }

  return { label: "Untested", variant: "default" };
}
