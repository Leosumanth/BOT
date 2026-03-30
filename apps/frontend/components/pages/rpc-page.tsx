"use client";

import type { FormEvent, JSX } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RpcManagementResponse } from "@mintbot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backendFetch } from "@/lib/api";
import { titleCase } from "@/lib/format";

export function RpcPage({ data }: { data: RpcManagementResponse }): JSX.Element {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    label: "",
    chain: "ethereum",
    transport: "http",
    provider: "custom",
    url: "",
    priority: "5"
  });

  const healthMap = new Map(data.health.map((entry) => [entry.endpointKey, entry]));

  function importEndpoint(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    startTransition(async () => {
      try {
        await backendFetch("/rpc", {
          method: "POST",
          body: JSON.stringify({
            label: form.label,
            chain: form.chain,
            transport: form.transport,
            provider: form.provider,
            url: form.url,
            priority: Number(form.priority)
          })
        });

        setFeedback("RPC endpoint imported.");
        setForm({
          label: "",
          chain: "ethereum",
          transport: "http",
          provider: "custom",
          url: "",
          priority: "5"
        });
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to import RPC endpoint.");
      }
    });
  }

  function warmEndpoints(): void {
    startTransition(async () => {
      try {
        await backendFetch<RpcManagementResponse>("/rpc/warm", {
          method: "POST"
        });

        setFeedback("RPC health refreshed.");
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to warm endpoints.");
      }
    });
  }

  function deleteEndpoint(key: string): void {
    startTransition(async () => {
      try {
        await backendFetch<{ removed: boolean }>(`/rpc/${key}`, {
          method: "DELETE"
        });

        setFeedback(`Removed endpoint ${key}.`);
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to delete endpoint.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card>
          <CardHeader>
            <CardTitle>Import endpoint</CardTitle>
            <CardDescription>Bring a custom RPC route into the runtime and persist it for future boots.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={importEndpoint}>
              <Field label="Label">
                <Input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Chain">
                  <select
                    className="flex h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm"
                    value={form.chain}
                    onChange={(event) => setForm((current) => ({ ...current, chain: event.target.value }))}
                  >
                    <option value="ethereum">Ethereum</option>
                    <option value="base">Base</option>
                  </select>
                </Field>
                <Field label="Transport">
                  <select
                    className="flex h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm"
                    value={form.transport}
                    onChange={(event) => setForm((current) => ({ ...current, transport: event.target.value }))}
                  >
                    <option value="http">HTTP</option>
                    <option value="ws">WebSocket</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Provider">
                  <select
                    className="flex h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm"
                    value={form.provider}
                    onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                  >
                    <option value="custom">Custom</option>
                    <option value="alchemy">Alchemy</option>
                    <option value="quicknode">QuickNode</option>
                  </select>
                </Field>
                <Field label="Priority">
                  <Input value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} />
                </Field>
              </div>

              <Field label="Endpoint URL">
                <Input
                  placeholder="https://..."
                  value={form.url}
                  onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {feedback ?? "Environment endpoints remain read-only. Imported endpoints can be removed later from this page."}
                </p>
                <div className="flex gap-3">
                  <Button disabled={isPending} type="button" variant="outline" onClick={warmEndpoints}>
                    Warm all
                  </Button>
                  <Button disabled={isPending || !form.label.trim() || !form.url.trim()} size="lg" type="submit">
                    {isPending ? "Saving..." : "Import endpoint"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current route rankings</CardTitle>
            <CardDescription>Ranked order per chain and transport based on live runtime scoring.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {data.rankings.map((ranking) => (
              <div key={`${ranking.chain}-${ranking.transport}`} className="rounded-2xl border border-border bg-muted/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">
                    {titleCase(ranking.chain)} {ranking.transport.toUpperCase()}
                  </p>
                  <Badge>{ranking.endpointKeys.length} routes</Badge>
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  {ranking.endpointKeys.length ? (
                    ranking.endpointKeys.map((key, index) => (
                      <div key={key} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">#{index + 1}</span>
                        <span className="font-medium text-foreground">{key}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No endpoints registered for this route class.</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>RPC manager</CardTitle>
            <CardDescription>Health, ownership, and delete access for each registered endpoint.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.endpoints.length ? (
              data.endpoints.map((endpoint) => {
                const health = healthMap.get(endpoint.key);
                return (
                  <div key={endpoint.key} className="rounded-3xl border border-border bg-muted/45 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-3">
                          <Badge>{titleCase(endpoint.chain)}</Badge>
                          <Badge variant="warning">{endpoint.transport.toUpperCase()}</Badge>
                          <Badge variant={endpoint.source === "database" ? "success" : "default"}>{endpoint.source}</Badge>
                          <Badge variant={health?.live ? "success" : "destructive"}>{health?.live ? "Live" : "Unknown"}</Badge>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{endpoint.label}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{endpoint.key}</p>
                        </div>
                        <p className="break-all text-sm text-muted-foreground">{endpoint.url}</p>
                        <p className="text-xs text-muted-foreground">
                          Provider {titleCase(endpoint.provider)} | priority {endpoint.priority} | latency{" "}
                          {health && Number.isFinite(health.latencyMs) ? `${health.latencyMs}ms` : "warming"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-3">
                        <Button disabled={isPending || endpoint.source !== "database"} variant="destructive" onClick={() => deleteEndpoint(endpoint.key)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No RPC endpoints registered yet. Import one above.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <label className="space-y-2 text-sm font-medium text-foreground">
      {label}
      {children}
    </label>
  );
}
