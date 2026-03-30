import type { AnalyticsSummary, ApiKeysDashboardResponse, DashboardBootstrapResponse, RpcManagementResponse, SystemOverview, TaskRecord } from "@mintbot/shared";

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

export const emptyApiKeysDashboard: ApiKeysDashboardResponse = {
  configs: [],
  providers: [],
  logs: [],
  readiness: {
    checkedAt: new Date(0).toISOString(),
    state: "blocked",
    summary: "API readiness data is unavailable.",
    blockers: [],
    warnings: []
  },
  maintenance: {
    id: "maintenance-idle",
    trigger: "bootstrap",
    status: "idle",
    summary: "No maintenance run has completed yet.",
    startedAt: new Date(0).toISOString(),
    completedAt: null,
    checkedConfigs: 0,
    healthyConfigs: 0,
    failoversActivated: 0,
    warnings: 0
  },
  summary: {
    totalConfigs: 0,
    activeConfigs: 0,
    backupConfigs: 0,
    invalidConfigs: 0,
    rateLimitedConfigs: 0,
    offlineConfigs: 0,
    failoverActiveProviders: 0,
    readyProviders: 0,
    warningProviders: 0,
    blockedProviders: 0,
    lastRefreshedAt: new Date(0).toISOString()
  }
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
