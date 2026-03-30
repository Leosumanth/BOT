import type { AnalyticsSummary, DashboardBootstrapResponse, RpcManagementResponse, SystemOverview, TaskRecord } from "@mintbot/shared";

export const emptyDashboard: DashboardBootstrapResponse = {
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

export const emptySummary: AnalyticsSummary = {
  totalTrackedContracts: 0,
  totalWallets: 0,
  successfulMints: 0,
  failedMints: 0,
  totalGasSpentWei: 0n,
  topWallets: []
};

export const emptyTasks: TaskRecord[] = [];

export const emptyRpcManagement: RpcManagementResponse = {
  endpoints: [],
  health: [],
  rankings: []
};

export const emptySystemOverview: SystemOverview = {
  service: "mintbot-backend",
  ok: true,
  apiBasePath: "/api",
  frontendMode: "embedded",
  frontendUrl: "http://localhost:3000",
  socketPath: "/socket.io",
  timestamp: new Date(0).toISOString(),
  featureFlags: {
    flashbots: false,
    rustExecutor: false,
    inlineWorker: false,
    mempoolTracker: false
  },
  queues: {
    mint: "mint-jobs",
    tracker: "tracker-jobs"
  },
  availableRoutes: []
};
