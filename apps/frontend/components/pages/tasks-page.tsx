"use client";

import type { FormEvent, JSX } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskRecord, WalletRecord } from "@mintbot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backendFetch } from "@/lib/api";
import { formatCount, formatDateTime, titleCase } from "@/lib/format";

export function TasksPage({ tasks, wallets }: { tasks: TaskRecord[]; wallets: WalletRecord[] }): JSX.Element {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    chain: "ethereum",
    contractAddress: "",
    mintFunction: "function mint(uint256 quantity)",
    quantity: "1",
    valueWei: "",
    useFlashbots: true,
    simulateFirst: true,
    walletIds: wallets.slice(0, 1).map((wallet) => wallet.id)
  });

  function queueTask(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    startTransition(async () => {
      try {
        await backendFetch<{ accepted: boolean }>("/tasks", {
          method: "POST",
          body: JSON.stringify({
            job: {
              id: crypto.randomUUID(),
              target: {
                chain: form.chain,
                contractAddress: form.contractAddress,
                mintFunction: form.mintFunction.trim() || undefined,
                mintArgs: [Number(form.quantity)],
                quantity: Number(form.quantity),
                valueWei: form.valueWei.trim() ? form.valueWei.trim() : undefined
              },
              walletIds: form.walletIds,
              gasStrategy: "adaptive",
              policy: {
                simulateFirst: form.simulateFirst,
                useFlashbots: form.useFlashbots,
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

        setFeedback("Task queued successfully.");
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to queue task.");
      }
    });
  }

  function stopTask(taskId: string): void {
    startTransition(async () => {
      try {
        await backendFetch<{ accepted: boolean; removedFromQueue: boolean }>(`/tasks/${taskId}/stop`, {
          method: "POST"
        });

        setFeedback(`Stop requested for ${taskId}.`);
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to stop task.");
      }
    });
  }

  function deleteTask(taskId: string): void {
    startTransition(async () => {
      try {
        await backendFetch<{ removed: boolean }>(`/tasks/${taskId}`, {
          method: "DELETE"
        });

        setFeedback(`Task ${taskId} deleted.`);
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to delete task.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create task</CardTitle>
            <CardDescription>Build a mint execution task with contract details, wallet selection, and submission policy.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={queueTask}>
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
                <Field label="Quantity">
                  <Input value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
                </Field>
              </div>

              <Field label="Contract address">
                <Input
                  placeholder="0x..."
                  value={form.contractAddress}
                  onChange={(event) => setForm((current) => ({ ...current, contractAddress: event.target.value }))}
                />
              </Field>

              <Field label="Mint function signature">
                <Input
                  value={form.mintFunction}
                  onChange={(event) => setForm((current) => ({ ...current, mintFunction: event.target.value }))}
                />
              </Field>

              <Field label="Optional price in wei">
                <Input
                  placeholder="100000000000000000"
                  value={form.valueWei}
                  onChange={(event) => setForm((current) => ({ ...current, valueWei: event.target.value }))}
                />
              </Field>

              <div className="grid gap-3 md:grid-cols-2">
                <ToggleCard
                  enabled={form.simulateFirst}
                  title="Simulate first"
                  onClick={() => setForm((current) => ({ ...current, simulateFirst: !current.simulateFirst }))}
                />
                <ToggleCard
                  enabled={form.useFlashbots}
                  title="Use Flashbots"
                  onClick={() => setForm((current) => ({ ...current, useFlashbots: !current.useFlashbots }))}
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Wallet selection</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {wallets.length ? (
                    wallets.map((wallet) => {
                      const checked = form.walletIds.includes(wallet.id);
                      return (
                        <label key={wallet.id} className="flex items-start gap-3 rounded-2xl border border-border bg-muted/50 p-4">
                          <input
                            checked={checked}
                            className="mt-1 h-4 w-4"
                            type="checkbox"
                            onChange={() =>
                              setForm((current) => ({
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
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                      Import at least one wallet before creating tasks.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {feedback ?? "Queue manual tasks and manage them from the list alongside execution history."}
                </p>
                <Button disabled={isPending || !wallets.length || !form.walletIds.length} size="lg" type="submit">
                  {isPending ? "Queueing..." : "Queue task"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task summary</CardTitle>
            <CardDescription>Quick totals across the current retained task history.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <SummaryRow label="Tasks tracked" value={formatCount(tasks.length)} />
            <SummaryRow label="Queued" value={formatCount(tasks.filter((task) => task.status === "queued").length)} />
            <SummaryRow label="Stopped" value={formatCount(tasks.filter((task) => task.status === "stopped").length)} />
            <SummaryRow label="Confirmed" value={formatCount(tasks.reduce((total, task) => total + task.confirmedCount, 0))} />
            <SummaryRow label="Failed attempts" value={formatCount(tasks.reduce((total, task) => total + task.failedCount, 0))} />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Task manager</CardTitle>
            <CardDescription>Stop or delete historical tasks, and review their execution shape at a glance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tasks.length ? (
              tasks.map((task) => (
                <div key={task.id} className="rounded-3xl border border-border bg-muted/45 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant={taskBadgeVariant(task.status)}>{titleCase(task.status)}</Badge>
                        <Badge>{titleCase(task.chain)}</Badge>
                        <Badge variant="default">{formatCount(task.walletIds.length)} wallets</Badge>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{task.contractAddress}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Created {formatDateTime(task.createdAt)} | updated {formatDateTime(task.updatedAt)}
                        </p>
                      </div>
                      <div className="grid gap-3 text-sm md:grid-cols-3">
                        <TaskMetric label="Attempts" value={formatCount(task.attemptCount)} />
                        <TaskMetric label="Confirmed" value={formatCount(task.confirmedCount)} />
                        <TaskMetric label="Failed" value={formatCount(task.failedCount)} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {task.lastMessage ?? `Mint ${task.quantity} token(s) using ${task.gasStrategy} gas mode.`}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-3">
                      <Button disabled={isPending} variant="outline" onClick={() => stopTask(task.id)}>
                        Stop
                      </Button>
                      <Button disabled={isPending} variant="destructive" onClick={() => deleteTask(task.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No tasks yet. Queue your first task from the form above.
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

function SummaryRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/50 px-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function ToggleCard({ title, enabled, onClick }: { title: string; enabled: boolean; onClick: () => void }): JSX.Element {
  return (
    <button className="flex items-center justify-between rounded-2xl border border-border bg-muted/55 px-4 py-3 text-left" type="button" onClick={onClick}>
      <span className="text-sm font-medium text-foreground">{title}</span>
      <Badge variant={enabled ? "success" : "default"}>{enabled ? "On" : "Off"}</Badge>
    </button>
  );
}

function TaskMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function taskBadgeVariant(status: TaskRecord["status"]): "default" | "success" | "warning" | "destructive" {
  if (status === "confirmed") {
    return "success";
  }

  if (status === "failed") {
    return "destructive";
  }

  if (status === "queued" || status === "running" || status === "submitted") {
    return "warning";
  }

  return "default";
}
