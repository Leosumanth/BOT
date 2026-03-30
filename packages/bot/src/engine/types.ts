import type { ChainKey, MintJobInput, MintJobResult, WalletPerformanceMetric } from "@mintbot/shared";

export interface UnlockedWallet {
  id: string;
  label: string;
  address: `0x${string}`;
  privateKey: `0x${string}`;
  chain: ChainKey;
}

export interface MintBotTelemetryEvent {
  jobId: string;
  level: "info" | "success" | "warning" | "error";
  phase:
    | "queued"
    | "analyze"
    | "build"
    | "simulate"
    | "sign"
    | "submit"
    | "confirm"
    | "tracker"
    | "complete";
  message: string;
  context?: Record<string, string | number | boolean>;
  timestamp: string;
}

export interface MintBotExecutionContext {
  job: MintJobInput;
  wallets: UnlockedWallet[];
}

export interface MintBotTelemetrySink {
  publish(event: MintBotTelemetryEvent): Promise<void> | void;
}

export interface WalletPerformanceStore {
  update(metrics: WalletPerformanceMetric[]): Promise<void>;
}

export interface MintBotExecutionOutput {
  result: MintJobResult;
  metrics: WalletPerformanceMetric[];
}
