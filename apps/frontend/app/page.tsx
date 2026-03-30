import type { JSX } from "react";
import type { DashboardBootstrapResponse } from "@mintbot/shared";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { backendFetch } from "@/lib/api";

const emptyDashboard: DashboardBootstrapResponse = {
  snapshot: {
    botStatus: "idle",
    activeJobs: [],
    recentActivity: [],
    gasFeed: [],
    rpcHealth: [],
    walletMetrics: [],
    trackedContracts: []
  },
  wallets: [],
  recentJobs: []
};

export default async function HomePage(): Promise<JSX.Element> {
  const initialData = await backendFetch<DashboardBootstrapResponse>("/analytics/dashboard").catch(() => emptyDashboard);

  return <DashboardShell initialData={initialData} />;
}
