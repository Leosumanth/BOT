"use client";

import type { FormEvent, JSX } from "react";
import { useEffect, useState, useTransition } from "react";
import { io } from "socket.io-client";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Activity, Bot, Fuel, Radar, ShieldCheck, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardBootstrapResponse } from "@mintbot/shared";
import { SOCKET_EVENTS } from "@mintbot/shared";
import { backendFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface DashboardShellProps {
  initialData: DashboardBootstrapResponse;
}

interface ToastMessage {
  id: string;
  title: string;
  description: string;
}

export function DashboardShell({ initialData }: DashboardShellProps): JSX.Element {
  const [snapshot, setSnapshot] = useState(initialData.snapshot);
  const [wallets, setWallets] = useState(initialData.wallets);
  const [analyzerAddress, setAnalyzerAddress] = useState("");
  const [analyzerChain, setAnalyzerChain] = useState<"ethereum" | "base">("ethereum");
  const [analyzerResult, setAnalyzerResult] = useState<any>(null);
  const [mintForm, setMintForm] = useState({
    chain: "ethereum",
    contractAddress: "",
    mintFunction: "function mint(uint256 quantity)",
    quantity: "1",
    valueWei: "",
    useFlashbots: true,
    simulateFirst: true,
    walletIds: initialData.wallets.slice(0, 1).map((wallet) => wallet.id)
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isPending, startTransition] = useTransition();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: walletConnectPending } = useConnect();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
    let cancelled = false;
    let socket: ReturnType<typeof io> | null = null;

    async function connect(): Promise<void> {
      try {
        const tokenResponse = await fetch("/api/socket-token", {
          cache: "no-store"
        });
        if (!tokenResponse.ok) {
          return;
        }

        const payload = (await tokenResponse.json()) as { token?: string };
        if (!payload.token || cancelled) {
          return;
        }

        socket = socketUrl
          ? io(socketUrl, {
              auth: {
                token: payload.token
              },
              transports: ["websocket", "polling"]
            })
          : io({
              auth: {
                token: payload.token
              },
              transports: ["websocket", "polling"]
            });

        socket.on(SOCKET_EVENTS.dashboardSnapshot, (nextSnapshot) => {
          startTransition(() => {
            setSnapshot(nextSnapshot);
          });
        });

        socket.on(SOCKET_EVENTS.mintFeed, (payload) => {
          startTransition(() => {
            setSnapshot((current) => ({
              ...current,
              recentActivity: [payload, ...current.recentActivity].slice(0, 20)
            }));
          });
          pushToast("Pending mint detected", `${payload.chain} ${payload.to ?? "unknown target"}`);
        });

        socket.on(SOCKET_EVENTS.walletMetrics, (payload) => {
          startTransition(() => {
            setSnapshot((current) => ({
              ...current,
              walletMetrics: payload
            }));
          });
        });

        socket.on(SOCKET_EVENTS.jobStatus, (payload) => {
          pushToast("Mint job updated", `${payload.jobId} -> ${payload.status}`);
        });
      } catch {
        // Keep the dashboard usable even if realtime auth/bootstrap fails.
      }
    }

    void connect();

    return () => {
      cancelled = true;
      socket?.close();
    };
  }, []);

  function pushToast(title: string, description: string): void {
    const nextToast = {
      id: crypto.randomUUID(),
      title,
      description
    };

    setToasts((current) => [nextToast, ...current].slice(0, 4));
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== nextToast.id));
    }, 4000);
  }

  async function handleAnalyze(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const result = await backendFetch<any>("/contracts/analyze", {
        method: "POST",
        body: JSON.stringify({
          chain: analyzerChain,
          contractAddress: analyzerAddress
        })
      });

      setAnalyzerResult(result);
      pushToast("Contract analyzed", "Mint function and sale parameters refreshed.");
    } catch (error) {
      pushToast("Analyzer failed", error instanceof Error ? error.message : "Unknown analyzer error");
    }
  }

  async function handleStartMint(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      await backendFetch<{ accepted: boolean }>("/bot/start", {
        method: "POST",
        body: JSON.stringify({
          job: {
            id: crypto.randomUUID(),
            target: {
              chain: mintForm.chain,
              contractAddress: mintForm.contractAddress,
              mintFunction: mintForm.mintFunction,
              mintArgs: [Number(mintForm.quantity)],
              quantity: Number(mintForm.quantity),
              valueWei: mintForm.valueWei || undefined
            },
            walletIds: mintForm.walletIds,
            gasStrategy: "adaptive",
            policy: {
              simulateFirst: mintForm.simulateFirst,
              useFlashbots: mintForm.useFlashbots,
              usePresignedTransactions: true,
              maxRetries: 3,
              retryDelayMs: 1500,
              walletConcurrency: 3,
              rpcFailoverBudget: 4
            },
            source: "manual",
            createdAt: new Date().toISOString()
          }
        })
      });

      pushToast("Mint job armed", "The mint job was accepted by the backend queue.");
    } catch (error) {
      pushToast("Mint job failed", error instanceof Error ? error.message : "Unable to queue mint job");
    }
  }

  const gasChartData = snapshot.gasFeed.map((entry) => ({
    chain: entry.chain,
    baseFeeGwei: Number(entry.baseFeePerGas) / 1_000_000_000,
    priorityFeeGwei: Number(entry.maxPriorityFeePerGas) / 1_000_000_000,
    maxFeeGwei: Number(entry.maxFeePerGas) / 1_000_000_000
  }));

  return (
    <main className="min-h-screen">
      <div className="container py-10">
        <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit rounded-full px-4 py-1.5" variant="success">
              Production Home
            </Badge>
            <div>
              <h1 className="font-sans text-4xl font-semibold tracking-tight text-foreground md:text-6xl">MintBot Nexus</h1>
              <p className="mt-3 max-w-3xl text-base text-muted-foreground md:text-lg">
                Low-latency NFT mint execution, mempool tracking, contract analysis, multi-wallet routing, and Flashbots-ready private flow
                from one operational surface.
              </p>
            </div>
          </div>

          <Card className="w-full max-w-md">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Wallet className="h-5 w-5 text-emerald-700" />
                  Web3 Frontend
                </CardTitle>
                <CardDescription>Powered by wagmi for operator wallet awareness.</CardDescription>
              </div>
              {isConnected ? <Badge variant="success">Connected</Badge> : <Badge>Idle</Badge>}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="rounded-2xl border border-border bg-muted/70 px-4 py-3 text-sm text-muted-foreground">
                {isConnected ? `Operator wallet: ${address}` : "Connect an operator wallet to mirror live chain context in the frontend."}
              </div>
              <div className="flex flex-wrap gap-3">
                {isConnected ? (
                  <Button variant="outline" onClick={() => disconnect()}>
                    Disconnect
                  </Button>
                ) : (
                  <Button disabled={walletConnectPending} onClick={() => connect({ connector: connectors[0] })}>
                    Connect Wallet
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Bot} label="Bot status" value={snapshot.botStatus} hint="Queue + execution status" />
          <MetricCard icon={Radar} label="Tracked contracts" value={String(snapshot.trackedContracts.length)} hint="Analyzer registry size" />
          <MetricCard icon={Wallet} label="Loaded wallets" value={String(wallets.length)} hint="Encrypted in PostgreSQL" />
          <MetricCard icon={Fuel} label="RPC endpoints" value={String(snapshot.rpcHealth.length)} hint="Latency-ranked routes" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Mint control panel</CardTitle>
              <CardDescription>Queue production mint jobs with multi-wallet routing, Flashbots, simulation, and adaptive gas.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleStartMint}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-foreground">
                    Chain
                    <select
                      className="flex h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm"
                      value={mintForm.chain}
                      onChange={(event) => setMintForm((current) => ({ ...current, chain: event.target.value }))}
                    >
                      <option value="ethereum">Ethereum</option>
                      <option value="base">Base</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground">
                    Quantity
                    <Input
                      value={mintForm.quantity}
                      onChange={(event) => setMintForm((current) => ({ ...current, quantity: event.target.value }))}
                    />
                  </label>
                </div>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  Contract address
                  <Input
                    placeholder="0x..."
                    value={mintForm.contractAddress}
                    onChange={(event) => setMintForm((current) => ({ ...current, contractAddress: event.target.value }))}
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  Mint function signature
                  <Input
                    value={mintForm.mintFunction}
                    onChange={(event) => setMintForm((current) => ({ ...current, mintFunction: event.target.value }))}
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  Optional price in wei
                  <Input
                    placeholder="100000000000000000"
                    value={mintForm.valueWei}
                    onChange={(event) => setMintForm((current) => ({ ...current, valueWei: event.target.value }))}
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <ToggleRow
                    title="Simulate first"
                    enabled={mintForm.simulateFirst}
                    onToggle={() => setMintForm((current) => ({ ...current, simulateFirst: !current.simulateFirst }))}
                  />
                  <ToggleRow
                    title="Use Flashbots"
                    enabled={mintForm.useFlashbots}
                    onToggle={() => setMintForm((current) => ({ ...current, useFlashbots: !current.useFlashbots }))}
                  />
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Wallet selection</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {wallets.map((wallet) => {
                      const checked = mintForm.walletIds.includes(wallet.id);
                      return (
                        <label key={wallet.id} className="flex items-start gap-3 rounded-2xl border border-border bg-muted/50 p-4">
                          <input
                            checked={checked}
                            className="mt-1 h-4 w-4"
                            type="checkbox"
                            onChange={() =>
                              setMintForm((current) => ({
                                ...current,
                                walletIds: checked
                                  ? current.walletIds.filter((walletId) => walletId !== wallet.id)
                                  : [...current.walletIds, wallet.id]
                              }))
                            }
                          />
                          <div>
                            <p className="text-sm font-semibold text-foreground">{wallet.label}</p>
                            <p className="text-xs text-muted-foreground">{wallet.address}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {isPending ? "Realtime state is refreshing..." : "Jobs are sent to BullMQ and streamed back via Socket.IO."}
                  </p>
                  <Button size="lg" type="submit">
                    Queue mint job
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contract analyzer</CardTitle>
              <CardDescription>Auto-detect mint route, price, and supply from deployed contract bytecode and read methods.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <form className="space-y-4" onSubmit={handleAnalyze}>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  Chain
                  <select
                    className="flex h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm"
                    value={analyzerChain}
                    onChange={(event) => setAnalyzerChain(event.target.value as "ethereum" | "base")}
                  >
                    <option value="ethereum">Ethereum</option>
                    <option value="base">Base</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  Contract address
                  <Input placeholder="0x..." value={analyzerAddress} onChange={(event) => setAnalyzerAddress(event.target.value)} />
                </label>
                <Button className="w-full" type="submit" variant="secondary">
                  Analyze contract
                </Button>
              </form>

              {analyzerResult ? (
                <div className="space-y-4 rounded-3xl border border-border bg-muted/60 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{analyzerResult.contractAddress}</p>
                      <p className="text-xs text-muted-foreground">{analyzerResult.chain}</p>
                    </div>
                    <Badge variant={analyzerResult.detectedMintFunction ? "success" : "warning"}>
                      {analyzerResult.detectedMintFunction ? "Mint function detected" : "Heuristic fallback"}
                    </Badge>
                  </div>
                  <dl className="grid gap-3 text-sm md:grid-cols-2">
                    <Stat label="Mint function" value={analyzerResult.detectedMintFunction?.signature ?? "Not found"} />
                    <Stat label="Price" value={analyzerResult.priceWei ?? "Unknown"} />
                    <Stat label="Max supply" value={analyzerResult.maxSupply ?? "Unknown"} />
                    <Stat label="Max per wallet" value={analyzerResult.maxPerWallet ?? "Unknown"} />
                  </dl>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Warnings</p>
                    <Textarea readOnly value={(analyzerResult.warnings ?? []).join("\n") || "No warnings"} />
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
                  Analyzer results will appear here after the contract scan completes.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader>
              <CardTitle>Live mint feed</CardTitle>
              <CardDescription>Pending mint activity detected from mempool websocket listeners and execution telemetry.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot.recentActivity.length ? (
                snapshot.recentActivity.slice(0, 8).map((activity: any) => (
                  <div key={`${activity.txHash}-${activity.detectedAt}`} className="rounded-2xl border border-border bg-muted/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{activity.chain}</p>
                      <Badge variant="warning">{Math.round((activity.confidence ?? 0) * 100)}% confidence</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{activity.to ?? "Unknown target contract"}</p>
                    <p className="mt-1 break-all font-mono text-xs text-foreground">{activity.txHash}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  Waiting for live pending mint detections from the tracker.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gas tracker chart</CardTitle>
              <CardDescription>Live EIP-1559 fee envelope derived from the currently ranked RPC pool.</CardDescription>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={gasChartData}>
                  <defs>
                    <linearGradient id="baseFee" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#2b8f80" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#2b8f80" stopOpacity={0.08} />
                    </linearGradient>
                    <linearGradient id="maxFee" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#c9772b" stopOpacity={0.75} />
                      <stop offset="95%" stopColor="#c9772b" stopOpacity={0.08} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ddcfba" />
                  <XAxis dataKey="chain" stroke="#7a624e" />
                  <YAxis stroke="#7a624e" />
                  <Tooltip />
                  <Area dataKey="baseFeeGwei" fill="url(#baseFee)" stroke="#2b8f80" strokeWidth={2} />
                  <Area dataKey="maxFeeGwei" fill="url(#maxFee)" stroke="#c9772b" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader>
              <CardTitle>Wallet dashboard</CardTitle>
              <CardDescription>Encrypted wallets with mint success/failure metrics and performance tracking.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {wallets.map((wallet) => {
                const metric = snapshot.walletMetrics.find((entry) => entry.walletId === wallet.id);
                return (
                  <div key={wallet.id} className="rounded-2xl border border-border bg-muted/60 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{wallet.label}</p>
                        <p className="text-xs text-muted-foreground">{wallet.address}</p>
                      </div>
                      <Badge variant="success">{wallet.chain}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <Stat label="Successful mints" value={metric?.successfulMints ?? 0} />
                      <Stat label="Failed mints" value={metric?.failedMints ?? 0} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tracked contracts + RPC health</CardTitle>
              <CardDescription>Analyzer registry, failover surfaces, and route quality snapshots.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                {snapshot.trackedContracts.length ? (
                  snapshot.trackedContracts.slice(0, 5).map((contract: any) => (
                    <div key={`${contract.contractAddress}-${contract.chain}`} className="rounded-2xl border border-border bg-muted/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">{contract.contractAddress}</p>
                        <Badge>{contract.chain}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{contract.detectedMintFunction?.signature ?? "No mint function yet"}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                    No analyzed contracts have been stored yet.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {snapshot.rpcHealth.map((rpc: any) => (
                  <div key={rpc.endpointKey} className="rounded-2xl border border-border bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{rpc.endpointKey}</p>
                      <Badge variant={rpc.live ? "success" : "destructive"}>{rpc.live ? "Live" : "Down"}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rpc.latencyMs}ms latency | {(rpc.successRate * 100).toFixed(0)}% success | {rpc.failureCount} failures
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      <div className="fixed right-5 top-5 z-50 flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div key={toast.id} className="rounded-2xl border border-border bg-card px-4 py-3 shadow-panel">
            <p className="text-sm font-semibold text-foreground">{toast.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{toast.description}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint: string;
}): JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="rounded-2xl bg-secondary p-3 text-secondary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  title,
  enabled,
  onToggle
}: {
  title: string;
  enabled: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      className="flex items-center justify-between rounded-2xl border border-border bg-muted/50 px-4 py-3 text-left"
      type="button"
      onClick={onToggle}
    >
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-4 w-4 text-emerald-700" />
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
      <Badge variant={enabled ? "success" : "default"}>{enabled ? "On" : "Off"}</Badge>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
