import type { ChainKey } from "../constants/chains.js";
import type { ContractAnalysisResult } from "./blockchain.js";
import type { RpcEndpointConfig, RpcHealthSnapshot } from "./blockchain.js";
import type { BotJobStatus, DashboardSnapshot, MintJobInput, MintJobResult, WalletPerformanceMetric, WalletRecord } from "./domain.js";

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, string | number | boolean | null>;
}

export interface StartBotRequest {
  job: MintJobInput;
}

export interface StopBotRequest {
  jobId: string;
}

export interface WalletUpsertRequest {
  label: string;
  privateKey: string;
  chain: WalletRecord["chain"];
  tags?: string[];
}

export interface WalletUpdateRequest {
  label?: string;
  enabled?: boolean;
  tags?: string[];
}

export interface GasSettingsRequest {
  urgency: "low" | "medium" | "high" | "critical";
  useFlashbots: boolean;
  usePresignedTransactions: boolean;
}

export interface ContractAnalyzerRequest {
  chain: ContractAnalysisResult["chain"];
  contractAddress: ContractAnalysisResult["contractAddress"];
}

export interface RpcEndpointImportRequest {
  key?: string;
  label: string;
  chain: ChainKey;
  transport: RpcEndpointConfig["transport"];
  provider: RpcEndpointConfig["provider"];
  url: string;
  priority: number;
  enabled?: boolean;
}

export interface RpcEndpointRecord extends RpcEndpointConfig {
  source: "env" | "database";
  createdAt?: string;
  updatedAt?: string;
}

export interface RpcEndpointRanking {
  chain: ChainKey;
  transport: RpcEndpointConfig["transport"];
  endpointKeys: string[];
}

export interface RpcManagementResponse {
  endpoints: RpcEndpointRecord[];
  health: RpcHealthSnapshot[];
  rankings: RpcEndpointRanking[];
}

export interface TaskRecord {
  id: string;
  status: BotJobStatus;
  chain: ChainKey;
  contractAddress: `0x${string}`;
  mintFunction?: string | null;
  quantity: number;
  valueWei?: bigint | null;
  walletIds: string[];
  gasStrategy: MintJobInput["gasStrategy"];
  useFlashbots: boolean;
  simulateFirst: boolean;
  source: MintJobInput["source"];
  createdAt: string;
  updatedAt: string;
  stoppedAt?: string | null;
  lastMessage?: string | null;
  attemptCount: number;
  confirmedCount: number;
  failedCount: number;
}

export type ManagedApiKey =
  | "OPENSEA_API_KEY"
  | "ETHERSCAN_API_KEY"
  | "DRPC_API_KEY"
  | "OPENAI_API_KEY";

export type ApiProviderId = "opensea" | "etherscan" | "drpc" | "openai";
export type ApiConfigSource = "database" | "environment";
export type ApiKeyCategory = "marketplace" | "explorer" | "rpc-service" | "ai";
export type ApiHealthStatus = "active" | "backup" | "invalid-key" | "rate-limited" | "offline" | "failover-active";
export type ApiReadinessState = "ready" | "warning" | "blocked";
export type ApiRateLimitRisk = "low" | "medium" | "high";
export type ApiErrorType = "timeout" | "auth-error" | "rate-limited" | "network-error" | "invalid-response" | "server-error" | "unknown-error";
export type ApiMaintenanceTrigger = "bootstrap" | "background" | "manual";
export type ApiMaintenanceStatus = "idle" | "running" | "completed" | "failed";

export interface ApiProviderDescriptor {
  provider: ApiProviderId;
  managedKey: ManagedApiKey;
  label: string;
  category: ApiKeyCategory;
  description: string;
  defaultEndpointUrl: string;
  requiredForAutomation: boolean;
  defaultMaxLatencyMs: number;
}

export interface ApiRateLimitSnapshot {
  available: boolean;
  limit?: number | null;
  remaining?: number | null;
  used?: number | null;
  resetAt?: string | null;
  windowLabel?: string | null;
  risk: ApiRateLimitRisk;
}

export interface ApiProbeHealth {
  reachable: boolean;
  authValid: boolean;
  latencyMs?: number | null;
  lastCheckedAt?: string | null;
  lastSuccessfulAt?: string | null;
  lastFailureAt?: string | null;
  failureReason?: string | null;
  errorType?: ApiErrorType | null;
  rawMessage?: string | null;
  rateLimit: ApiRateLimitSnapshot;
}

export interface ApiReliabilityMemory {
  recentSuccessRate: number;
  recentFailureCount: number;
  averageLatencyMs?: number | null;
  latencyHistoryMs: number[];
  failureCount: number;
  timeoutCount: number;
  authFailureCount: number;
  rateLimitCount: number;
  networkErrorCount: number;
  invalidResponseCount: number;
  serverErrorCount: number;
  unknownErrorCount: number;
  failoverFrequency: number;
  recoverySuccessHistory: number;
  lastKnownStableAt?: string | null;
  lastKnownStableState?: ApiHealthStatus | null;
}

export interface ApiSelectionScore {
  value: number;
  rank: number;
  reasons: string[];
}

export interface ApiConfigRecord extends ApiProviderDescriptor {
  id: string;
  label: string;
  endpointUrl: string;
  source: ApiConfigSource;
  enabled: boolean;
  priority: number;
  isBackup: boolean;
  autoFailover: boolean;
  automationEnabled: boolean;
  maxLatencyMs: number;
  notes: string;
  secretMask: string;
  secretAvailable: boolean;
  revealSupported: boolean;
  copySupported: boolean;
  active: boolean;
  failoverActive: boolean;
  status: ApiHealthStatus;
  health: ApiProbeHealth;
  memory: ApiReliabilityMemory;
  selection: ApiSelectionScore;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiProviderStatus {
  provider: ApiProviderId;
  label: string;
  category: ApiKeyCategory;
  description: string;
  requiredForAutomation: boolean;
  readiness: ApiReadinessState;
  currentStatus: ApiHealthStatus | "offline";
  activeConfigId?: string | null;
  activeLabel?: string | null;
  configCount: number;
  backupCount: number;
  healthyCount: number;
  failoverActive: boolean;
  averageLatencyMs?: number | null;
  successRate: number;
  score: number;
  rateLimitRisk: ApiRateLimitRisk;
}

export interface ApiReadinessReport {
  checkedAt: string;
  state: ApiReadinessState;
  summary: string;
  blockers: string[];
  warnings: string[];
}

export interface ApiAutomationLogEntry {
  id: string;
  timestamp: string;
  configId?: string | null;
  provider: ApiProviderId;
  apiName: string;
  eventType: string;
  errorType?: ApiErrorType | null;
  action: string;
  result: string;
  message: string;
}

export interface ApiMaintenanceSnapshot {
  id: string;
  trigger: ApiMaintenanceTrigger;
  status: ApiMaintenanceStatus;
  summary: string;
  startedAt: string;
  completedAt?: string | null;
  checkedConfigs: number;
  healthyConfigs: number;
  failoversActivated: number;
  warnings: number;
}

export interface ApiKeysDashboardResponse {
  configs: ApiConfigRecord[];
  providers: ApiProviderStatus[];
  logs: ApiAutomationLogEntry[];
  readiness: ApiReadinessReport;
  maintenance: ApiMaintenanceSnapshot;
  summary: {
    totalConfigs: number;
    activeConfigs: number;
    backupConfigs: number;
    invalidConfigs: number;
    rateLimitedConfigs: number;
    offlineConfigs: number;
    failoverActiveProviders: number;
    readyProviders: number;
    warningProviders: number;
    blockedProviders: number;
    lastRefreshedAt: string;
  };
}

export interface ApiConfigCreateRequest {
  provider: ApiProviderId;
  label?: string;
  value: string;
  endpointUrl?: string;
  enabled?: boolean;
  priority?: number;
  isBackup?: boolean;
  autoFailover?: boolean;
  automationEnabled?: boolean;
  maxLatencyMs?: number;
  notes?: string;
}

export interface ApiConfigUpdateRequest {
  label?: string;
  value?: string;
  endpointUrl?: string;
  enabled?: boolean;
  priority?: number;
  isBackup?: boolean;
  autoFailover?: boolean;
  automationEnabled?: boolean;
  maxLatencyMs?: number;
  notes?: string;
}

export interface ApiSecretRevealResponse {
  id: string;
  value: string;
  masked: string;
  source: ApiConfigSource;
}

export interface ApiConfigTestResponse {
  configId: string;
  testedAt: string;
  status: ApiHealthStatus;
  log: ApiAutomationLogEntry;
  health: ApiProbeHealth;
}

export interface ApiDraftKeyTestRequest {
  provider: ApiProviderId;
  value: string;
}

export interface ApiDraftKeyTestResponse {
  provider: ApiProviderId;
  testedAt: string;
  status: ApiHealthStatus;
  ok: boolean;
  health: ApiProbeHealth;
  secretMask: string;
}

export interface ApiMaintenanceRunResponse {
  maintenance: ApiMaintenanceSnapshot;
  readiness: ApiReadinessReport;
}

export interface SystemOverview {
  service: string;
  ok: boolean;
  apiBasePath: string;
  frontendMode: "embedded" | "redirect";
  frontendUrl: string;
  socketPath: string;
  timestamp: string;
  featureFlags: {
    flashbots: boolean;
    rustExecutor: boolean;
    inlineWorker: boolean;
    mempoolTracker: boolean;
  };
  queues: {
    mint: string;
    tracker: string;
  };
  availableRoutes: string[];
}

export interface AnalyticsSummary {
  totalTrackedContracts: number;
  totalWallets: number;
  successfulMints: number;
  failedMints: number;
  totalGasSpentWei: bigint;
  topWallets: WalletPerformanceMetric[];
}

export interface DashboardBootstrapResponse {
  snapshot: DashboardSnapshot;
  wallets: WalletRecord[];
  recentJobs: MintJobResult[];
}
