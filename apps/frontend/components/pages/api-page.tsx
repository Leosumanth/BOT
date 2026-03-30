"use client";

import type { FormEvent, JSX } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContractAnalysisResult, SystemOverview } from "@mintbot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { backendFetch } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";

export function ApiPage({
  overview,
  contracts
}: {
  overview: SystemOverview;
  contracts: ContractAnalysisResult[];
}): JSX.Element {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [result, setResult] = useState<ContractAnalysisResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [chain, setChain] = useState<"ethereum" | "base">("ethereum");
  const [contractAddress, setContractAddress] = useState("");

  function analyzeContract(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    startTransition(async () => {
      try {
        const response = await backendFetch<ContractAnalysisResult>("/contracts/analyze", {
          method: "POST",
          body: JSON.stringify({
            chain,
            contractAddress
          })
        });

        setResult(response);
        setFeedback("Contract analyzed and saved.");
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to analyze contract.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>API overview</CardTitle>
            <CardDescription>Backend mode, queues, route inventory, and feature flags at a glance.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <Row label="Service" value={overview.service} />
            <Row label="API base" value={overview.apiBasePath} />
            <Row label="Frontend mode" value={titleCase(overview.frontendMode)} />
            <Row label="Socket path" value={overview.socketPath} />
            <Row label="Mint queue" value={overview.queues.mint} />
            <Row label="Tracker queue" value={overview.queues.tracker} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature flags</CardTitle>
            <CardDescription>Deployment capabilities currently exposed by the backend runtime.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FlagCard label="Flashbots" enabled={overview.featureFlags.flashbots} />
            <FlagCard label="Rust executor" enabled={overview.featureFlags.rustExecutor} />
            <FlagCard label="Inline worker" enabled={overview.featureFlags.inlineWorker} />
            <FlagCard label="Mempool tracker" enabled={overview.featureFlags.mempoolTracker} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card>
          <CardHeader>
            <CardTitle>Contract analyzer</CardTitle>
            <CardDescription>Analyze and persist contract metadata from the API management page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="space-y-4" onSubmit={analyzeContract}>
              <Field label="Chain">
                <select
                  className="flex h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm"
                  value={chain}
                  onChange={(event) => setChain(event.target.value as "ethereum" | "base")}
                >
                  <option value="ethereum">Ethereum</option>
                  <option value="base">Base</option>
                </select>
              </Field>

              <Field label="Contract address">
                <Input placeholder="0x..." value={contractAddress} onChange={(event) => setContractAddress(event.target.value)} />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{feedback ?? "Run contract analysis and keep the results visible below."}</p>
                <Button disabled={isPending || !contractAddress.trim()} type="submit">
                  {isPending ? "Analyzing..." : "Analyze contract"}
                </Button>
              </div>
            </form>

            {result ? (
              <div className="rounded-3xl border border-border bg-muted/55 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{result.contractAddress}</p>
                    <p className="text-xs text-muted-foreground">{titleCase(result.chain)}</p>
                  </div>
                  <Badge variant={result.detectedMintFunction ? "success" : "warning"}>
                    {result.detectedMintFunction ? "Mint function found" : "Heuristic fallback"}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Stat label="Mint function" value={result.detectedMintFunction?.signature ?? "Not found"} />
                  <Stat label="Price" value={result.priceWei?.toString() ?? "Unknown"} />
                  <Stat label="Max supply" value={result.maxSupply?.toString() ?? "Unknown"} />
                  <Stat label="Max per wallet" value={result.maxPerWallet?.toString() ?? "Unknown"} />
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Warnings</p>
                  <Textarea readOnly value={result.warnings.join("\n") || "No warnings"} />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Available routes</CardTitle>
            <CardDescription>Backend route inventory exposed for the management layer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.availableRoutes.map((route) => (
              <div key={route} className="rounded-2xl border border-border bg-muted/50 px-4 py-3 font-mono text-sm text-foreground">
                {route}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Saved contract analyses</CardTitle>
            <CardDescription>Persisted analyzer results managed by the API and contract service layer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contracts.length ? (
              contracts.map((contract) => (
                <div key={`${contract.contractAddress}-${contract.chain}`} className="rounded-3xl border border-border bg-muted/45 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-3">
                        <Badge>{titleCase(contract.chain)}</Badge>
                        <Badge variant={contract.detectedMintFunction ? "success" : "warning"}>
                          {contract.detectedMintFunction ? "Analyzed" : "Partial"}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-foreground">{contract.contractAddress}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Scanned {formatDateTime(contract.scannedAt)}</p>
                    </div>
                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <Stat label="Mint function" value={contract.detectedMintFunction?.signature ?? "Not found"} />
                      <Stat label="ABI fragments" value={String(contract.abiFragments.length)} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No saved analyses yet. Run the analyzer above to seed this page.
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

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/50 px-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function FlagCard({ label, enabled }: { label: string; enabled: boolean }): JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-muted/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <Badge variant={enabled ? "success" : "default"}>{enabled ? "Enabled" : "Disabled"}</Badge>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
