import type { JSX } from "react";
<<<<<<< HEAD
import type { WalletRecord } from "@mintbot/shared";
import { WalletsPage } from "@/components/pages/wallets-page";
import { backendFetch } from "@/lib/api";

export default async function WalletsRoute(): Promise<JSX.Element> {
  const wallets = await backendFetch<WalletRecord[]>("/wallets").catch(() => []);

  return <WalletsPage wallets={wallets} />;
=======
import type { AnalyticsSummary, DashboardBootstrapResponse, SystemOverview } from "@mintbot/shared";
import { HomeOverviewPage } from "@/components/pages/home-page";
import { backendFetch } from "@/lib/api";
import { emptyDashboard, emptySummary, emptySystemOverview } from "@/lib/defaults";

export default async function HomePage(): Promise<JSX.Element> {
  const [dashboard, summary, system] = await Promise.all([
    backendFetch<DashboardBootstrapResponse>("/analytics/dashboard").catch(() => emptyDashboard),
    backendFetch<AnalyticsSummary>("/analytics/summary").catch(() => emptySummary),
    backendFetch<SystemOverview>("/system").catch(() => emptySystemOverview)
  ]);

  return <HomeOverviewPage snapshot={dashboard.snapshot} summary={summary} system={system} />;
>>>>>>> 67a447c10fc3fe55a5f452e92a7ac53ae87beaf0
}
