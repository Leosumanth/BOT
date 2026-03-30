import type { ChainKey } from "../constants/chains.js";
import type { GasStrategyResult } from "./blockchain.js";

export interface BlockObservation {
  chain: ChainKey;
  blockNumber: bigint;
  timestampMs: number;
  baseFeePerGas: bigint;
  gasUsedRatio: number;
  transactionCount: number;
  observedAt: string;
}

export interface BlockTimingSnapshot {
  chain: ChainKey;
  latestBlockNumber?: bigint;
  averageBlockTimeMs: number;
  predictedNextBlockAt: string;
  msUntilNextBlock: number;
  recommendedLeadTimeMs: number;
  recommendedDelayMs: number;
  confidence: number;
}

export interface GasPrediction {
  chain: ChainKey;
  observedAt: string;
  latestBaseFeePerGas: bigint;
  predictedNextBaseFeePerGas: bigint;
  accelerationScore: number;
  trend: "falling" | "stable" | "rising";
  confidence: number;
}

export interface CompetitionSnapshot {
  chain: ChainKey;
  contractAddress: `0x${string}`;
  observedAt: string;
  pendingTransactions: number;
  competingWallets: number;
  whaleWallets: number;
  waveVelocity: number;
  hypeScore: number;
  medianMaxFeePerGas: bigint;
  p90MaxFeePerGas: bigint;
  medianPriorityFeePerGas: bigint;
  p90PriorityFeePerGas: bigint;
  topPriorityFeePerGas: bigint;
}

export interface CompetitiveGasEstimate extends GasStrategyResult {
  chain: ChainKey;
  predictedBaseFeePerGas: bigint;
  competitorP90MaxFeePerGas: bigint;
  competitorP90PriorityFeePerGas: bigint;
  urgency: "low" | "medium" | "high" | "critical";
}

export interface ProfitabilityEstimate {
  mintPriceWei: bigint;
  gasCostWei: bigint;
  totalCostWei: bigint;
  expectedValueWei: bigint;
  expectedProfitWei: bigint;
  roiBps: number;
}

export interface ChainOpportunityScore {
  chain: ChainKey;
  score: number;
  expectedProfitWei: bigint;
  gasPressureScore: number;
  demandScore: number;
  observedAt: string;
}

export interface MintStrategyDecision {
  allowMint: boolean;
  strategyScore: number;
  confidence: number;
  reason: string;
  riskFlags: string[];
  recommendedGasMode: "adaptive" | "aggressive" | "manual";
  recommendedUseFlashbots: boolean;
  bundleTransactions: boolean;
  suggestedSubmissionDelayMs: number;
  targetBlockNumber?: bigint;
  profitability: ProfitabilityEstimate;
  chainOpportunity: ChainOpportunityScore;
}

export interface WalletExecutionProfile {
  walletId: string;
  successRate: number;
  avgLatencyMs: number;
  cooldownMs: number;
  stealthScore: number;
  priorityScore: number;
  randomizedDelayMs: number;
}

export interface ExecutionLatencySample {
  chain: ChainKey;
  jobId: string;
  walletId: string;
  strategy: string;
  route: "rpc" | "flashbots" | "rust";
  queuedToDecisionMs: number;
  decisionToSubmissionMs: number;
  submissionToConfirmationMs?: number;
  totalLatencyMs?: number;
  observedAt: string;
}
