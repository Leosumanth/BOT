import type { JSX } from "react";
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
}
