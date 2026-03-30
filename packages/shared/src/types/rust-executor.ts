export interface RustMintExecutionGasConfig {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  gasLimit: string;
}

export interface RustMintExecutionRequest {
  jobId: string;
  walletPrivateKey: string;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  chainId: number;
  rpcUrl: string;
  gas: RustMintExecutionGasConfig;
  useFlashbots: boolean;
  nonce?: number;
  simulateBeforeSend?: boolean;
  walletAddress?: `0x${string}`;
  walletId?: string;
  mintJobId?: string;
  rpcKey?: string;
  targetBlockNumber?: string;
  notBeforeUnixMs?: number;
  submissionMode?: "single" | "bundle";
}

export interface RustMintExecutionResult {
  jobId: string;
  status: "success" | "failed";
  txHash?: `0x${string}`;
  bundleHash?: string;
  route?: "rpc" | "flashbots";
  submittedAtUnixMs?: number;
  error: string | null;
}
