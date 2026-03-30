"use client";

import type { FormEvent, JSX } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WalletRecord } from "@mintbot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { backendFetch } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";

export function WalletsPage({ wallets }: { wallets: WalletRecord[] }): JSX.Element {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    label: "",
    privateKey: "",
    chain: "ethereum",
    tags: ""
  });

  function importWallet(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    startTransition(async () => {
      try {
        await backendFetch<WalletRecord>("/wallets", {
          method: "POST",
          body: JSON.stringify({
            label: form.label.trim(),
            privateKey: form.privateKey.trim(),
            chain: form.chain,
            tags: form.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
          })
        });

        setForm({
          label: "",
          privateKey: "",
          chain: "ethereum",
          tags: ""
        });
        setFeedback("Wallet imported successfully.");
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to import wallet.");
      }
    });
  }

  function toggleWallet(wallet: WalletRecord): void {
    startTransition(async () => {
      try {
        await backendFetch<WalletRecord>(`/wallets/${wallet.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            enabled: !wallet.enabled
          })
        });

        setFeedback(`${wallet.label} ${wallet.enabled ? "disabled" : "enabled"}.`);
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to update wallet.");
      }
    });
  }

  function deleteWallet(walletId: string): void {
    startTransition(async () => {
      try {
        await backendFetch<{ removed: boolean }>(`/wallets/${walletId}`, {
          method: "DELETE"
        });

        setFeedback(`Wallet ${walletId} deleted.`);
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to delete wallet.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Import wallet</CardTitle>
            <CardDescription>Load encrypted operator wallets into Postgres and make them available for task routing.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={importWallet}>
              <Field label="Wallet label">
                <Input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} />
              </Field>

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

              <Field label="Private key">
                <Textarea
                  placeholder="0x..."
                  value={form.privateKey}
                  onChange={(event) => setForm((current) => ({ ...current, privateKey: event.target.value }))}
                />
              </Field>

              <Field label="Tags">
                <Input
                  placeholder="alpha, hot, primary"
                  value={form.tags}
                  onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {feedback ?? "Imported wallets are encrypted before storage and can be toggled on or off later."}
                </p>
                <Button disabled={isPending || !form.label.trim() || !form.privateKey.trim()} size="lg" type="submit">
                  {isPending ? "Importing..." : "Import wallet"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fleet summary</CardTitle>
            <CardDescription>Current wallet inventory across enabled and standby addresses.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <SummaryRow label="Total wallets" value={String(wallets.length)} />
            <SummaryRow label="Enabled" value={String(wallets.filter((wallet) => wallet.enabled).length)} />
            <SummaryRow label="Standby" value={String(wallets.filter((wallet) => !wallet.enabled).length)} />
            <SummaryRow label="Ethereum" value={String(wallets.filter((wallet) => wallet.chain === "ethereum").length)} />
            <SummaryRow label="Base" value={String(wallets.filter((wallet) => wallet.chain === "base").length)} />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Wallet manager</CardTitle>
            <CardDescription>Review tags, toggle availability, and remove wallets you no longer want routed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {wallets.length ? (
              wallets.map((wallet) => (
                <div key={wallet.id} className="rounded-3xl border border-border bg-muted/45 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-3">
                        <Badge variant={wallet.enabled ? "success" : "default"}>{wallet.enabled ? "Enabled" : "Standby"}</Badge>
                        <Badge>{titleCase(wallet.chain)}</Badge>
                        {(wallet.tags ?? []).map((tag) => (
                          <Badge key={tag} variant="warning">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{wallet.label}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{wallet.address}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">Updated {formatDateTime(wallet.updatedAt)}</p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-3">
                      <Button disabled={isPending} variant="outline" onClick={() => toggleWallet(wallet)}>
                        {wallet.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button disabled={isPending} variant="destructive" onClick={() => deleteWallet(wallet.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No wallets are stored yet. Import one from the form above.
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
