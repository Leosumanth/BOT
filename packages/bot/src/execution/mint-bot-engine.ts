import {
  bigintToHex,
  CHAIN_LOOKUP,
  nowIso,
  type MintExecutionAttempt,
  type MintJobInput,
  type MintJobResult,
  type RpcEndpointConfig,
  type RustMintExecutionRequest,
  type WalletPerformanceMetric
} from "@mintbot/shared";
import {
  Eip1559GasStrategy,
  type FlashbotsBundleClient,
  MintTransactionBuilder,
  type NonceManager,
  PresignedTransactionService,
  type RpcRouter
} from "@mintbot/blockchain";
import type { MintBotExecutionContext, MintBotExecutionOutput, MintBotTelemetrySink, MintExecutionAdapter, UnlockedWallet } from "../engine/types.js";

interface MintBotDependencies {
  rpcRouter: RpcRouter;
  nonceManager: NonceManager;
  transactionBuilder: MintTransactionBuilder;
  gasStrategy: Eip1559GasStrategy;
  presignedTransactions: PresignedTransactionService;
  flashbots?: FlashbotsBundleClient;
  telemetry?: MintBotTelemetrySink;
  executionAdapter?: MintExecutionAdapter;
}

export class MintBotEngine {
  constructor(private readonly deps: MintBotDependencies) {}

  async execute(context: MintBotExecutionContext): Promise<MintBotExecutionOutput> {
    const { job } = context;
    const wallets = context.wallets.filter((wallet) => job.walletIds.includes(wallet.id) && wallet.chain === job.target.chain);
    const attempts: MintExecutionAttempt[] = [];

    await this.emit(job, "queued", "info", `Job ${job.id} queued for ${wallets.length} wallet(s).`, {
      walletCount: wallets.length,
      useFlashbots: job.policy.useFlashbots
    });

    const transaction = await this.deps.transactionBuilder.build(job.target);
    await this.emit(job, "build", "info", "Mint transaction payload prepared.", {
      gasEstimate: Number(transaction.gasEstimate)
    });

    await this.deps.rpcRouter.warm(job.target.chain);

    await this.runWithConcurrency(wallets, job.policy.walletConcurrency, async (wallet) => {
      const attempt = await this.executeForWallet(job, wallet, transaction);
      attempts.push(attempt);
    });

    const result = this.buildResult(job, attempts);
    const metrics = this.buildWalletMetrics(context.wallets, attempts);

    await this.emit(job, "complete", result.failedCount > 0 ? "warning" : "success", "Mint job execution finished.", {
      confirmed: result.confirmedCount,
      failed: result.failedCount
    });

    return { result, metrics };
  }

  private async executeForWallet(
    job: MintJobInput,
    wallet: UnlockedWallet,
    transaction: Awaited<ReturnType<MintTransactionBuilder["build"]>>
  ): Promise<MintExecutionAttempt> {
    const preferredClient = this.deps.rpcRouter.getPreferredPublicClient(job.target.chain);
    const latestBlock = await preferredClient.getBlock();
    const feeResult =
      job.gasStrategy === "manual" && job.manualGas
        ? {
            maxFeePerGas: job.manualGas.maxFeePerGas,
            maxPriorityFeePerGas: job.manualGas.maxPriorityFeePerGas,
            confidence: 1,
            reasoning: ["Manual gas configuration supplied by operator."]
          }
        : this.deps.gasStrategy.derive({
            urgency: job.gasStrategy === "aggressive" ? "high" : "medium",
            latestBaseFee: latestBlock.baseFeePerGas ?? 0n,
            historicalBaseFee: latestBlock.baseFeePerGas ?? 0n,
            networkCongestion: latestBlock.transactions.length > 250 ? 0.75 : 0.45
          });

    const nonce = await this.deps.nonceManager.reserveNonce({
      chain: wallet.chain,
      address: wallet.address,
      fetchFromChain: () =>
        this.deps.rpcRouter.executeWithFailover(wallet.chain, (runtime) =>
          runtime.publicClient.getTransactionCount({ address: wallet.address, blockTag: "pending" })
        )
    });

    const attempt: MintExecutionAttempt = {
      walletId: wallet.id,
      nonce,
      simulated: false,
      success: false,
      submittedAt: nowIso()
    };

    const shouldUseFlashbots = Boolean(job.policy.useFlashbots && job.target.chain === "ethereum" && (this.deps.executionAdapter || this.deps.flashbots));

    try {
      if (this.deps.executionAdapter) {
        const submission = await this.executeViaRust(job, wallet, transaction, nonce, feeResult, shouldUseFlashbots);
        attempt.txHash = submission.txHash;
        attempt.rpcKey = submission.rpcKey;
        attempt.simulated = submission.simulated;

        await this.emit(job, "submit", "success", `Rust executor submitted transaction for ${wallet.label}.`, {
          wallet: wallet.label,
          txHash: submission.txHash
        });

        const receipt = await this.deps.rpcRouter.executeWithFailover(job.target.chain, (runtime) =>
          runtime.publicClient.waitForTransactionReceipt({ hash: submission.txHash, confirmations: 1, timeout: 60_000 })
        );

        attempt.success = receipt.status === "success";
        attempt.confirmedAt = nowIso();

        await this.emit(
          job,
          "confirm",
          attempt.success ? "success" : "error",
          attempt.success ? `Mint confirmed for ${wallet.label}.` : `Mint reverted for ${wallet.label}.`,
          {
            wallet: wallet.label,
            txHash: submission.txHash
          }
        );

        return attempt;
      }

      await this.emit(job, "sign", "info", `Signing transaction for ${wallet.label}.`, {
        wallet: wallet.label,
        nonce
      });

      const signed = await this.deps.presignedTransactions.sign({
        privateKey: wallet.privateKey,
        nonce,
        chainId: CHAIN_LOOKUP[job.target.chain].id,
        gas: transaction.gasEstimate,
        transaction,
        fees: feeResult
      });

      if (job.policy.simulateFirst && shouldUseFlashbots) {
        const nextBlock = bigintToHex(latestBlock.number + 1n);
        const simulation = await this.deps.flashbots!.simulate([signed], nextBlock);
        attempt.simulated = true;

        await this.emit(job, "simulate", simulation.success ? "success" : "warning", `Simulation for ${wallet.label} completed.`, {
          wallet: wallet.label,
          simulationSuccess: simulation.success
        });

        if (!simulation.success) {
          throw new Error(simulation.error ?? "Flashbots simulation failed");
        }
      }

      if (shouldUseFlashbots) {
        const nextBlock = bigintToHex(latestBlock.number + 1n);
        const bundle = await this.deps.flashbots!.sendBundle([signed], nextBlock);
        attempt.flashbotsBundleHash = bundle.bundleHash;
        attempt.rpcKey = "flashbots";
      } else {
        const txHash = await this.deps.rpcRouter.executeWithFailover(job.target.chain, (runtime) =>
          runtime.publicClient.sendRawTransaction({ serializedTransaction: signed })
        );

        attempt.txHash = txHash;
        attempt.rpcKey = this.deps.rpcRouter.getConfigs(job.target.chain)[0]?.key;

        await this.emit(job, "submit", "success", `Signed transaction submitted for ${wallet.label}.`, {
          wallet: wallet.label,
          txHash
        });

        const receipt = await this.deps.rpcRouter.executeWithFailover(job.target.chain, (runtime) =>
          runtime.publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: 60_000 })
        );

        attempt.success = receipt.status === "success";
        attempt.confirmedAt = nowIso();

        await this.emit(
          job,
          "confirm",
          attempt.success ? "success" : "error",
          attempt.success ? `Mint confirmed for ${wallet.label}.` : `Mint reverted for ${wallet.label}.`,
          {
            wallet: wallet.label,
            txHash
          }
        );
      }

      if (shouldUseFlashbots) {
        attempt.success = true;
        attempt.confirmedAt = nowIso();
      }

      return attempt;
    } catch (error) {
      attempt.success = false;
      attempt.error = error instanceof Error ? error.message : "Unknown execution failure";

      await this.emit(job, "submit", "error", `Execution failed for ${wallet.label}.`, {
        wallet: wallet.label,
        error: attempt.error
      });

      return attempt;
    }
  }

  private async executeViaRust(
    job: MintJobInput,
    wallet: UnlockedWallet,
    transaction: Awaited<ReturnType<MintTransactionBuilder["build"]>>,
    nonce: number,
    feeResult: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
    shouldUseFlashbots: boolean
  ): Promise<{ txHash: `0x${string}`; rpcKey: string; simulated: boolean }> {
    const preferredRpc = this.getPreferredExecutionRpc(job.target.chain);
    const request: RustMintExecutionRequest = {
      jobId: `${job.id}:${wallet.id}`,
      mintJobId: job.id,
      walletId: wallet.id,
      walletAddress: wallet.address,
      walletPrivateKey: wallet.privateKey,
      nonce,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value.toString(),
      chainId: CHAIN_LOOKUP[job.target.chain].id,
      rpcUrl: preferredRpc.url,
      rpcKey: preferredRpc.key,
      gas: {
        maxFeePerGas: feeResult.maxFeePerGas.toString(),
        maxPriorityFeePerGas: feeResult.maxPriorityFeePerGas.toString(),
        gasLimit: this.withGasBuffer(transaction.gasEstimate).toString()
      },
      useFlashbots: shouldUseFlashbots,
      simulateBeforeSend: shouldUseFlashbots && job.policy.simulateFirst
    };

    await this.emit(job, "sign", "info", `Dispatching execution to Rust worker for ${wallet.label}.`, {
      wallet: wallet.label,
      nonce
    });

    const result = await this.deps.executionAdapter!.execute(request);
    if (result.status !== "success" || !result.txHash) {
      throw new Error(result.error ?? `Rust executor failed for ${wallet.label}.`);
    }

    return {
      txHash: result.txHash,
      rpcKey: shouldUseFlashbots ? "flashbots" : preferredRpc.key,
      simulated: Boolean(request.simulateBeforeSend)
    };
  }

  private getPreferredExecutionRpc(chain: MintJobInput["target"]["chain"]): RpcEndpointConfig {
    try {
      return this.deps.rpcRouter.getPreferredConfig(chain, "http");
    } catch {
      return this.deps.rpcRouter.getPreferredConfig(chain);
    }
  }

  private withGasBuffer(gasEstimate: bigint): bigint {
    return gasEstimate + gasEstimate / 5n + 21_000n;
  }

  private buildResult(job: MintJobInput, attempts: MintExecutionAttempt[]): MintJobResult {
    const confirmedCount = attempts.filter((attempt) => attempt.success).length;
    const failedCount = attempts.filter((attempt) => !attempt.success).length;

    return {
      jobId: job.id,
      status: failedCount > 0 && confirmedCount === 0 ? "failed" : confirmedCount > 0 ? "confirmed" : "submitted",
      attempts,
      submittedCount: attempts.length,
      confirmedCount,
      failedCount,
      completedAt: nowIso()
    };
  }

  private buildWalletMetrics(wallets: UnlockedWallet[], attempts: MintExecutionAttempt[]): WalletPerformanceMetric[] {
    return wallets.map((wallet) => {
      const walletAttempts = attempts.filter((attempt) => attempt.walletId === wallet.id);

      return {
        walletId: wallet.id,
        address: wallet.address,
        successfulMints: walletAttempts.filter((attempt) => attempt.success).length,
        failedMints: walletAttempts.filter((attempt) => !attempt.success).length,
        totalGasSpentWei: 0n,
        pnlWei: 0n,
        updatedAt: nowIso()
      };
    });
  }

  private async emit(
    job: MintJobInput,
    phase: Parameters<NonNullable<MintBotTelemetrySink["publish"]>>[0]["phase"],
    level: Parameters<NonNullable<MintBotTelemetrySink["publish"]>>[0]["level"],
    message: string,
    context?: Record<string, string | number | boolean>
  ): Promise<void> {
    await this.deps.telemetry?.publish({
      jobId: job.id,
      level,
      phase,
      message,
      context,
      timestamp: nowIso()
    });
  }

  private async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>
  ): Promise<void> {
    const pool = new Set<Promise<void>>();

    for (const item of items) {
      const task = worker(item).finally(() => pool.delete(task));
      pool.add(task);

      if (pool.size >= Math.max(1, concurrency)) {
        await Promise.race(pool);
      }
    }

    await Promise.all(pool);
  }
}
