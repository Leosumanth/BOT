import type { ChainKey } from "../constants/chains.js";

export interface RpcEndpointConfig {
  key: string;
  label: string;
  chain: ChainKey;
  transport: "http" | "ws";
  provider: "alchemy" | "quicknode" | "custom";
  url: string;
  priority: number;
  enabled: boolean;
}

export interface RpcHealthSnapshot {
  endpointKey: string;
  latencyMs: number;
  successRate: number;
  failureCount: number;
  lastCheckedAt: string;
  live: boolean;
}

export interface GasFeeSnapshot {
  chain: ChainKey;
  baseFeePerGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  observedAt: string;
}

export interface GasStrategyInput {
  urgency: "low" | "medium" | "high" | "critical";
  historicalBaseFee?: bigint;
  latestBaseFee?: bigint;
  networkCongestion?: number;
}

export interface GasStrategyResult {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  confidence: number;
  reasoning: string[];
}

export interface MintFunctionCandidate {
  name: string;
  signature: string;
  argsTemplate: unknown[];
  payable: boolean;
  score: number;
}

export interface ContractAnalysisResult {
  contractAddress: `0x${string}`;
  chain: ChainKey;
  detectedMintFunction: MintFunctionCandidate | null;
  priceWei: bigint | null;
  maxSupply: bigint | null;
  maxPerWallet: bigint | null;
  abiFragments: string[];
  warnings: string[];
  scannedAt: string;
}

export interface PendingMintActivity {
  chain: ChainKey;
  txHash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}` | null;
  valueWei: bigint;
  selector: `0x${string}` | null;
  detectedAt: string;
  confidence: number;
}

export interface FlashbotsSimulationResult {
  success: boolean;
  bundleHash?: string;
  coinbaseDiff?: string;
  gasUsed?: string;
  error?: string;
}
