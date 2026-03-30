import type { ChainKey } from "../constants/chains.js";
import type { ContractAnalysisResult, GasFeeSnapshot, PendingMintActivity, RpcHealthSnapshot } from "./blockchain.js";
import type { BlockTimingSnapshot, ChainOpportunityScore, CompetitionSnapshot, ExecutionLatencySample, GasPrediction } from "./strategy.js";

export type BotJobStatus = "queued" | "running" | "simulated" | "submitted" | "confirmed" | "failed" | "stopped" | "skipped";

export interface WalletRecord {
  id: string;
  label: string;
  address: `0x${string}`;
  chain: ChainKey;
  enabled: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MintTargetConfig {
  chain: ChainKey;
  contractAddress: `0x${string}`;
  collectionSlug?: string;
  mintFunction?: string;
  mintArgs: unknown[];
  quantity: number;
  valueWei?: bigint;
}

export interface MintExecutionPolicy {
  simulateFirst: boolean;
  useFlashbots: boolean;
  usePresignedTransactions: boolean;
  maxRetries: number;
  retryDelayMs: number;
  walletConcurrency: number;
  rpcFailoverBudget: number;
}

export interface MintJobInput {
  id: string;
  target: MintTargetConfig;
  walletIds: string[];
  gasStrategy: "adaptive" | "aggressive" | "manual";
  manualGas?: {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  };
  policy: MintExecutionPolicy;
  source: "manual" | "mempool" | "tracker" | "auto-analyzer";
  createdAt: string;
}

export interface MintExecutionAttempt {
  walletId: string;
  txHash?: `0x${string}`;
  nonce?: number;
  rpcKey?: string;
  flashbotsBundleHash?: string;
  gasMode?: "adaptive" | "aggressive" | "manual";
  route?: "rpc" | "flashbots" | "rust";
  retryCount?: number;
  latencyMs?: number;
  expectedProfitWei?: bigint;
  simulated: boolean;
  success: boolean;
  error?: string;
  submittedAt: string;
  confirmedAt?: string;
}

export interface MintJobResult {
  jobId: string;
  status: BotJobStatus;
  attempts: MintExecutionAttempt[];
  submittedCount: number;
  confirmedCount: number;
  failedCount: number;
  completedAt?: string;
}

export interface TrackerTransferEvent {
  chain: ChainKey;
  contractAddress: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  tokenId: string;
  txHash: `0x${string}`;
  blockNumber: bigint;
  observedAt: string;
}

export interface WalletPerformanceMetric {
  walletId: string;
  address: `0x${string}`;
  successfulMints: number;
  failedMints: number;
  totalGasSpentWei: bigint;
  pnlWei: bigint;
  recentSuccessRate?: number;
  avgLatencyMs?: number;
  lastUsedAt?: string;
  stealthScore?: number;
  updatedAt: string;
}

export interface DashboardSnapshot {
  botStatus: "idle" | "armed" | "running" | "error";
  activeJobs: MintJobResult[];
  recentActivity: PendingMintActivity[];
  gasFeed: GasFeeSnapshot[];
  rpcHealth: RpcHealthSnapshot[];
  walletMetrics: WalletPerformanceMetric[];
  trackedContracts: ContractAnalysisResult[];
  gasPredictions?: GasPrediction[];
  blockTiming?: BlockTimingSnapshot[];
  competition?: CompetitionSnapshot[];
  chainOpportunities?: ChainOpportunityScore[];
  latencySamples?: ExecutionLatencySample[];
}
