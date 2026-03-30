import type { ContractAnalysisResult } from "./blockchain.js";
import type { DashboardSnapshot, MintJobInput, MintJobResult, WalletPerformanceMetric, WalletRecord } from "./domain.js";

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

export interface GasSettingsRequest {
  urgency: "low" | "medium" | "high" | "critical";
  useFlashbots: boolean;
  usePresignedTransactions: boolean;
}

export interface ContractAnalyzerRequest {
  chain: ContractAnalysisResult["chain"];
  contractAddress: ContractAnalysisResult["contractAddress"];
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
