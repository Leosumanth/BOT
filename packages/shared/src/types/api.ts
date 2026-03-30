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
  | "ETHEREUM_RPC_HTTP_ALCHEMY"
  | "ETHEREUM_RPC_HTTP_QUICKNODE"
  | "ETHEREUM_RPC_WS_ALCHEMY"
  | "ETHEREUM_RPC_WS_QUICKNODE"
  | "BASE_RPC_HTTP_ALCHEMY"
  | "BASE_RPC_HTTP_QUICKNODE"
  | "BASE_RPC_WS_ALCHEMY"
  | "BASE_RPC_WS_QUICKNODE"
  | "FLASHBOTS_RELAY_URL"
  | "FLASHBOTS_AUTH_PRIVATE_KEY";

export type ApiKeySource = "database" | "env" | "default" | "unset";
export type ApiKeyCategory = "rpc" | "flashbots";
export type ApiKeyKind = "url" | "secret";

export interface ApiKeyDescriptor {
  key: ManagedApiKey;
  label: string;
  category: ApiKeyCategory;
  provider: "alchemy" | "quicknode" | "flashbots";
  kind: ApiKeyKind;
  description: string;
  chain?: ChainKey;
  transport?: RpcEndpointConfig["transport"];
  linkedPage?: "/rpc" | "/api";
}

export interface ApiKeyRecord extends ApiKeyDescriptor {
  source: ApiKeySource;
  enabled: boolean;
  hasValue: boolean;
  valueHint: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiKeyUpsertRequest {
  value?: string;
  enabled: boolean;
}

export interface ApiKeysDashboardResponse {
  entries: ApiKeyRecord[];
  summary: {
    total: number;
    configured: number;
    databaseOverrides: number;
    envBacked: number;
    disabled: number;
    rpcConfigured: number;
    flashbotsReady: boolean;
    lastRefreshedAt: string;
  };
}

export type ApiKeyTestStatus = "valid" | "invalid" | "skipped";

export interface ApiKeyTestResult {
  key: ManagedApiKey;
  status: ApiKeyTestStatus;
  message: string;
  testedAt: string;
}

export interface ApiKeyTestResponse {
  testedAt: string;
  summary: {
    valid: number;
    invalid: number;
    skipped: number;
  };
  results: ApiKeyTestResult[];
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
