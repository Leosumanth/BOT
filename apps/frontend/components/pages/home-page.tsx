import type { JSX } from "react";
import type { Route } from "next";
import Link from "next/link";
import type { AnalyticsSummary, DashboardSnapshot, SystemOverview } from "@mintbot/shared";
import { ArrowRight, Bot, DatabaseZap, RadioTower, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAddress, formatCount, formatDateTime, titleCase } from "@/lib/format";

export function HomeOverviewPage({
  summary,
  snapshot,
  system
}: {
  summary: AnalyticsSummary;
  snapshot: DashboardSnapshot;
  system: SystemOverview;
}): JSX.Element {
  const destinations = [
    {
      href: "/tasks",
      title: "Tasks runway",
      description: "Create, stop, and clear mint tasks from a dedicated control panel.",
      icon: Bot
    },
    {
      href: "/rpc",
      title: "RPC command",
      description: "Inspect health, add custom endpoints, and rank routes by live performance.",
      icon: RadioTower
    },
    {
      href: "/wallets",
      title: "Wallet vault",
      description: "Import wallets, toggle readiness, and keep your active fleet organized.",
      icon: WalletCards
    },
    {
      href: "/api",
      title: "API console",
      description: "Review platform status, analyze contracts, and manage the API surface.",
      icon: DatabaseZap
    }
  ] satisfies Array<{ href: Route; title: string; description: string; icon: typeof Bot }>;

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-none bg-[linear-gradient(135deg,rgba(39,69,65,0.96),rgba(58,39,24,0.92))] text-white shadow-panel">
          <CardContent className="p-8 md:p-10">
            <Badge className="rounded-full bg-white/12 px-4 py-1.5 text-white" variant="default">
              Five-page operations suite
            </Badge>
            <h1 className="mt-5 max-w-3xl font-sans text-4xl font-semibold tracking-tight md:text-6xl">
              One dashboard became a focused operating system.
            </h1>
            <p className="mt-5 max-w-2xl text-base text-white/76 md:text-lg">
              Home gives you signal. Tasks manage execution. RPC handles route quality. Wallets centralize imports. API keeps the platform legible.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/tasks">Open tasks</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/api">Review API console</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System snapshot</CardTitle>
            <CardDescription>Single-service deploy status with the embedded frontend mode.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <SnapshotRow label="Service" value={system.service} />
            <SnapshotRow label="Frontend mode" value={titleCase(system.frontendMode)} />
            <SnapshotRow label="API base" value={system.apiBasePath} />
            <SnapshotRow label="Socket path" value={system.socketPath} />
            <SnapshotRow label="Bot status" value={titleCase(snapshot.botStatus)} />
            <SnapshotRow label="Updated" value={formatDateTime(system.timestamp)} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tracked contracts" value={formatCount(summary.totalTrackedContracts)} hint="Saved analyzer results" />
        <StatCard label="Wallets loaded" value={formatCount(summary.totalWallets)} hint="Encrypted and available" />
        <StatCard label="Successful mints" value={formatCount(summary.successfulMints)} hint="Confirmed transaction history" />
        <StatCard label="Failed mints" value={formatCount(summary.failedMints)} hint="Attempts requiring review" />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {destinations.map(({ href, title, description, icon: Icon }) => (
          <Card key={href} className="group">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="rounded-2xl bg-secondary p-3 text-secondary-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" />
              </div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href={href}>Open page</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent mint activity</CardTitle>
            <CardDescription>Fresh mempool detections coming off the tracker and realtime feed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.recentActivity.length ? (
              snapshot.recentActivity.slice(0, 6).map((activity) => (
                <div key={`${activity.txHash}-${activity.detectedAt}`} className="rounded-2xl border border-border bg-muted/55 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{titleCase(activity.chain)}</p>
                    <Badge variant="warning">{Math.round(activity.confidence * 100)}% confidence</Badge>
                  </div>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">{activity.txHash}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    To {formatAddress(activity.to)} at {formatDateTime(activity.detectedAt)}
                  </p>
                </div>
              ))
            ) : (
              <EmptyPanel message="No pending mint activity has been captured yet." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>RPC health glance</CardTitle>
            <CardDescription>Current route health exposed by the runtime router.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.rpcHealth.length ? (
              snapshot.rpcHealth.map((endpoint) => (
                <div key={endpoint.endpointKey} className="rounded-2xl border border-border bg-card px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-foreground">{endpoint.endpointKey}</p>
                    <Badge variant={endpoint.live ? "success" : "destructive"}>{endpoint.live ? "Live" : "Down"}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Latency {Number.isFinite(endpoint.latencyMs) ? `${endpoint.latencyMs}ms` : "warming"} | success{" "}
                    {(endpoint.successRate * 100).toFixed(0)}% | failures {endpoint.failureCount}
                  </p>
                </div>
              ))
            ) : (
              <EmptyPanel message="No RPC endpoints are active yet. Visit the RPC page to import and warm routes." />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }): JSX.Element {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-3 font-sans text-3xl font-semibold text-foreground">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 px-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">{message}</div>
  );
}
