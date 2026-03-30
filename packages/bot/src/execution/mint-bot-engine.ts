import {
  bigintToHex,
  CHAIN_LOOKUP,
  nowIso,
  type CompetitionSnapshot,
  type CompetitiveGasEstimate,
  type ContractAnalysisResult,
  type MintExecutionAttempt,
  type MintJobInput,
  type MintJobResult,
  type MintStrategyDecision,
  type RpcEndpointConfig,
  type RustMintExecutionRequest,
  type WalletExecutionProfile,
  type WalletPerformanceMetric
} from "@mintbot/shared";
import {
  BlockTimingEngine,
  CompetitionAnalyzer,
  Eip1559GasStrategy,
  type FlashbotsBundleClient,
  MintTransactionBuilder,
  type NonceManager,
  PredictiveGasModel,
  PresignedTransactionService,
  type RpcRouter
} from "@mintbot/blockchain";
import type { MintBotExecutionContext, MintBotExecutionOutput, MintBotTelemetrySink, MintExecutionAdapter, UnlockedWallet } from "../engine/types.js";
import { AdaptiveFeedbackLoop } from "../strategy/adaptive-feedback-loop.js";
import { MintStrategyEngine } from "../strategy/mint-strategy-engine.js";
import { WalletStrategyEngine } from "../strategy/wallet-strategy-engine.js";

interface MintBotDependencies {
  rpcRouter: RpcRouter;
  nonceManager: NonceManager;
  transactionBuilder: MintTransactionBuilder;
  gasStrategy: Eip1559GasStrategy;
  gasPredictor: PredictiveGasModel;
  blockTiming: BlockTimingEngine;
  competitionAnalyzer: CompetitionAnalyzer;
  walletStrategy: WalletStrategyEngine;
  mintStrategy: MintStrategyEngine;
  feedbackLoop: AdaptiveFeedbackLoop;
  presignedTransactions: PresignedTransactionService;
  flashbots?: FlashbotsBundleClient;
  telemetry?: MintBotTelemetrySink;
  executionAdapter?: MintExecutionAdapter;
}

interface WalletExecutionPlan {
  wallet: UnlockedWallet;
  profile: WalletExecutionProfile;
  initialDelayMs: number;
}

interface SubmissionResult {
  txHash?: `0x${string}`;
  flashbotsBundleHash?: string;
  rpcKey?: string;
  route: "rpc" | "flashbots" | "rust";
  simulated: boolean;
  decisionToSubmissionMs: number;
}

export class MintBotEngine {
  constructor(private readonly deps: MintBotDependencies) {}

  async execute(context: MintBotExecutionContext): Promise<MintBotExecutionOutput> {
    const queuedAtMs = context.queuedAtMs ?? Date.now();
    const eligibleWallets = context.wallets.filter((wallet) => context.job.walletIds.includes(wallet.id) && wallet.chain === context.job.target.chain);
    const attempts: MintExecutionAttempt[] = [];

    await this.emit(context.job, "queued", "info", `Job ${context.job.id} queued for ${eligibleWallets.length} wallet(s).`, {
      walletCount: eligibleWallets.length,
      useFlashbots: context.job.policy.useFlashbots
    });

    if (!eligibleWallets.length) {
      const result: MintJobResult = {
        jobId: context.job.id,
        status: "skipped",
        attempts: [],
        submittedCount: 0,
        confirmedCount: 0,
        failedCount: 0,
        completedAt: nowIso()
      };

      await this.emit(context.job, "complete", "warning", "Mint job skipped because no eligible wallets were available.");
      return {
        result,
        metrics: []
      };
    }

    const transaction = await this.deps.transactionBuilder.build(context.job.target);
    await this.emit(context.job, "build", "info", "Mint transaction payload prepared.", {
      gasEstimate: Number(transaction.gasEstimate)
    });

    await this.deps.rpcRouter.warm(context.job.target.chain);

    const competition = this.deps.competitionAnalyzer.getCompetition(context.job.target.chain, context.job.target.contractAddress);
    const urgency = this.resolveUrgency(context.job, competition);
    const timing = this.deps.blockTiming.predictNextBlockTiming(context.job.target.chain, urgency);
    const gasRecommendation = this.resolveBaseGasRecommendation(context.job, competition, urgency);
    const rankedWallets = this.deps.walletStrategy.rankWallets(
      eligibleWallets,
      context.walletMetrics ?? [],
      (walletId) => this.deps.feedbackLoop.getWalletMetric(walletId)
    );
    const walletSuccessRate =
      rankedWallets.profiles.reduce((sum, profile) => sum + profile.successRate, 0) / Math.max(1, rankedWallets.profiles.length);
    const decision = this.deps.mintStrategy.evaluate({
      job: context.job,
      contractAnalysis: context.contractAnalysis,
      gasEstimate: transaction.gasEstimate,
      gasRecommendation,
      gasPrediction: this.deps.gasPredictor.predictNextBlockGas(context.job.target.chain),
      timing,
      competition,
      chainBias: this.deps.feedbackLoop.getChainBias(context.job.target.chain),
      walletSuccessRate
    });

    await this.emit(context.job, "timing", "info", "Block timing model updated.", {
      averageBlockTimeMs: timing.averageBlockTimeMs,
      delayMs: decision.suggestedSubmissionDelayMs,
      confidence: Number(timing.confidence.toFixed(2))
    });
    await this.emit(context.job, "decision", decision.allowMint ? "success" : "warning", decision.reason, {
      strategyScore: Number(decision.strategyScore.toFixed(2)),
      confidence: Number(decision.confidence.toFixed(2)),
      allowMint: decision.allowMint
    });

    if (!decision.allowMint) {
      const result: MintJobResult = {
        jobId: context.job.id,
        status: "skipped",
        attempts: [],
        submittedCount: 0,
        confirmedCount: 0,
        failedCount: 0,
        completedAt: nowIso()
      };

      const metrics = this.buildWalletMetrics(eligibleWallets, attempts, context.walletMetrics ?? []);
      await this.emit(context.job, "complete", "warning", "Mint job skipped by strategy engine.", {
        projectedProfitWei: decision.profitability.expectedProfitWei.toString()
      });

      return {
        result,
        metrics,
        decision
      };
    }

    const executionPlans = rankedWallets.wallets.map((wallet, index) => ({
      wallet,
      profile: rankedWallets.profiles.find((profile) => profile.walletId === wallet.id)!,
      initialDelayMs: Math.max(0, decision.suggestedSubmissionDelayMs + index * 90 + rankedWallets.profiles[index]!.randomizedDelayMs)
    }));

    await this.runWithConcurrency(executionPlans, context.job.policy.walletConcurrency, async (plan) => {
      if (plan.initialDelayMs > 0) {
        await this.emit(context.job, "timing", "info", `Holding ${plan.wallet.label} for optimal block timing window.`, {
          wallet: plan.wallet.label,
          delayMs: plan.initialDelayMs
        });
        await this.sleep(plan.initialDelayMs);
      }

      const attempt = await this.executeForWallet({
        job: context.job,
        wallet: plan.wallet,
        transaction,
        competition,
        decision,
        profile: plan.profile,
        queuedAtMs
      });
      attempts.push(attempt);
    });

    const result = this.buildResult(context.job, attempts);
    const metrics = this.buildWalletMetrics(eligibleWallets, attempts, context.walletMetrics ?? []);

    await this.emit(context.job, "complete", result.failedCount > 0 ? "warning" : "success", "Mint job execution finished.", {
      confirmed: result.confirmedCount,
      failed: result.failedCount,
      projectedProfitWei: decision.profitability.expectedProfitWei.toString()
    });

    return { result, metrics, decision };
  }

  private async executeForWallet(params: {
    job: MintJobInput;
    wallet: UnlockedWallet;
    transaction: Awaited<ReturnType<MintTransactionBuilder["build"]>>;
    competition: CompetitionSnapshot | null;
    decision: MintStrategyDecision;
    profile: WalletExecutionProfile;
    queuedAtMs: number;
  }): Promise<MintExecutionAttempt> {
    const maxAttempts = Math.max(1, params.job.policy.maxRetries);
    let lastAttempt: MintExecutionAttempt | null = null;

    for (let retryIndex = 0; retryIndex < maxAttempts; retryIndex += 1) {
      const attemptStartedAtMs = Date.now();
      if (retryIndex > 0) {
        await this.deps.nonceManager.reset(params.wallet.chain, params.wallet.address);
      }

      const nonce = await this.deps.nonceManager.reserveNonce({
        chain: params.wallet.chain,
        address: params.wallet.address,
        fetchFromChain: () =>
          this.deps.rpcRouter.executeWithFailover(params.wallet.chain, (runtime) =>
            runtime.publicClient.getTransactionCount({ address: params.wallet.address, blockTag: "pending" })
          )
      });

      const gasPlan = this.buildAttemptGasRecommendation(params.job, params.competition, retryIndex, params.decision.recommendedGasMode);
      const route = this.resolveRoute(params.job, params.decision);
      const attempt: MintExecutionAttempt = {
        walletId: params.wallet.id,
        nonce,
        simulated: false,
        success: false,
        submittedAt: nowIso(),
        retryCount: retryIndex,
        gasMode: params.decision.recommendedGasMode,
        route,
        expectedProfitWei: params.decision.profitability.expectedProfitWei
      };

      try {
        const submission = await this.submitForExecution({
          job: params.job,
          wallet: params.wallet,
          transaction: params.transaction,
          nonce,
          gasPlan,
          decision: params.decision,
          retryIndex
        });

        attempt.txHash = submission.txHash;
        attempt.flashbotsBundleHash = submission.flashbotsBundleHash;
        attempt.rpcKey = submission.rpcKey;
        attempt.simulated = submission.simulated;
        attempt.route = submission.route;

        await this.emit(params.job, "submit", "success", `Execution dispatched for ${params.wallet.label}.`, {
          wallet: params.wallet.label,
          retry: retryIndex,
          route: submission.route
        });

        const queuedToDecisionMs = Math.max(0, attemptStartedAtMs - params.queuedAtMs);
        const decisionToSubmissionMs = submission.decisionToSubmissionMs;

        if (submission.txHash) {
          const receiptWaitStartedAtMs = Date.now();
          const receipt = await this.deps.rpcRouter.executeWithFailover(params.job.target.chain, (runtime) =>
            runtime.publicClient.waitForTransactionReceipt({ hash: submission.txHash!, confirmations: 1, timeout: 60_000 })
          );

          attempt.success = receipt.status === "success";
          attempt.confirmedAt = nowIso();
          attempt.latencyMs = Date.now() - attemptStartedAtMs;

          this.deps.feedbackLoop.recordAttempt({
            job: params.job,
            attempt,
            decision: params.decision,
            route: submission.route,
            queuedToDecisionMs,
            decisionToSubmissionMs,
            submissionToConfirmationMs: Date.now() - receiptWaitStartedAtMs
          });
          await this.emit(params.job, "latency", "info", `Latency sample recorded for ${params.wallet.label}.`, {
            wallet: params.wallet.label,
            ms: attempt.latencyMs ?? 0,
            route: submission.route
          });

          await this.emit(
            params.job,
            "confirm",
            attempt.success ? "success" : "error",
            attempt.success ? `Mint confirmed for ${params.wallet.label}.` : `Mint reverted for ${params.wallet.label}.`,
            {
              wallet: params.wallet.label,
              txHash: submission.txHash
            }
          );

          return attempt;
        }

        attempt.success = false;
        attempt.latencyMs = Date.now() - attemptStartedAtMs;

        this.deps.feedbackLoop.recordAttempt({
          job: params.job,
          attempt,
          decision: params.decision,
          route: submission.route,
          queuedToDecisionMs,
          decisionToSubmissionMs
        });
        await this.emit(params.job, "latency", "info", `Latency sample recorded for ${params.wallet.label}.`, {
          wallet: params.wallet.label,
          ms: attempt.latencyMs ?? 0,
          route: submission.route
        });

        return attempt;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown execution failure";
        attempt.success = false;
        attempt.error = message;
        attempt.latencyMs = Date.now() - attemptStartedAtMs;
        lastAttempt = attempt;

        const retryable = this.isRetryableError(message);
        const isLastAttempt = retryIndex === maxAttempts - 1;

        if (!isLastAttempt && retryable) {
          await this.emit(params.job, "retry", "warning", `Retrying ${params.wallet.label} after transient execution failure.`, {
            wallet: params.wallet.label,
            retry: retryIndex + 1,
            error: message
          });
          await this.sleep(params.job.policy.retryDelayMs + retryIndex * 250);
          continue;
        }

        this.deps.feedbackLoop.recordAttempt({
          job: params.job,
          attempt,
          decision: params.decision,
          route,
          queuedToDecisionMs: Math.max(0, attemptStartedAtMs - params.queuedAtMs),
          decisionToSubmissionMs: attempt.latencyMs
        });
        await this.emit(params.job, "latency", "warning", `Latency sample recorded for failed execution on ${params.wallet.label}.`, {
          wallet: params.wallet.label,
          ms: attempt.latencyMs ?? 0,
          route
        });

        await this.emit(params.job, "submit", "error", `Execution failed for ${params.wallet.label}.`, {
          wallet: params.wallet.label,
          error: message,
          retry: retryIndex
        });

        return attempt;
      }
    }

    return (
      lastAttempt ?? {
        walletId: params.wallet.id,
        simulated: false,
        success: false,
        error: "Execution aborted without producing an attempt.",
        submittedAt: nowIso()
      }
    );
  }

  private async submitForExecution(params: {
    job: MintJobInput;
    wallet: UnlockedWallet;
    transaction: Awaited<ReturnType<MintTransactionBuilder["build"]>>;
    nonce: number;
    gasPlan: CompetitiveGasEstimate;
    decision: MintStrategyDecision;
    retryIndex: number;
  }): Promise<SubmissionResult> {
    const startedAtMs = Date.now();
    const shouldUseFlashbots = Boolean(params.decision.recommendedUseFlashbots && params.job.target.chain === "ethereum");

    if (this.deps.executionAdapter) {
      return this.executeViaRust(params, shouldUseFlashbots, startedAtMs);
    }

    await this.emit(params.job, "sign", "info", `Signing transaction for ${params.wallet.label}.`, {
      wallet: params.wallet.label,
      nonce: params.nonce
    });

    const signed = await this.deps.presignedTransactions.sign({
      privateKey: params.wallet.privateKey,
      nonce: params.nonce,
      chainId: CHAIN_LOOKUP[params.job.target.chain].id,
      gas: this.withGasBuffer(params.transaction.gasEstimate),
      transaction: params.transaction,
      fees: params.gasPlan
    });

    if (shouldUseFlashbots && this.deps.flashbots) {
      if (params.job.policy.simulateFirst) {
        const latestBlock = await this.deps.rpcRouter.getPreferredPublicClient(params.job.target.chain).getBlock();
        const nextBlock = bigintToHex(latestBlock.number + 1n);
        const simulation = await this.deps.flashbots.simulate([signed], nextBlock);
        if (!simulation.success) {
          throw new Error(simulation.error ?? "Flashbots simulation failed");
        }
      }

      const latestBlock = await this.deps.rpcRouter.getPreferredPublicClient(params.job.target.chain).getBlock();
      const nextBlock = bigintToHex(latestBlock.number + 1n);
      const bundle = await this.deps.flashbots.sendBundle([signed], nextBlock);

      return {
        txHash: bundle.txHashes[0],
        flashbotsBundleHash: bundle.bundleHash,
        rpcKey: "flashbots",
        route: "flashbots",
        simulated: params.job.policy.simulateFirst,
        decisionToSubmissionMs: Date.now() - startedAtMs
      };
    }

    const selectedRpc = this.selectRpcForAttempt(params.job.target.chain, params.retryIndex);
    const txHash = await this.deps.rpcRouter.executeWithFailover(
      params.job.target.chain,
      (runtime) => runtime.publicClient.sendRawTransaction({ serializedTransaction: signed }),
      selectedRpc.transport
    );

    return {
      txHash,
      rpcKey: selectedRpc.key,
      route: "rpc",
      simulated: false,
      decisionToSubmissionMs: Date.now() - startedAtMs
    };
  }

  private async executeViaRust(
    params: {
      job: MintJobInput;
      wallet: UnlockedWallet;
      transaction: Awaited<ReturnType<MintTransactionBuilder["build"]>>;
      nonce: number;
      gasPlan: CompetitiveGasEstimate;
      decision: MintStrategyDecision;
      retryIndex: number;
    },
    shouldUseFlashbots: boolean,
    startedAtMs: number
  ): Promise<SubmissionResult> {
    const preferredRpc = this.selectRpcForAttempt(params.job.target.chain, params.retryIndex);
    const request: RustMintExecutionRequest = {
      jobId: `${params.job.id}:${params.wallet.id}:retry-${params.retryIndex}`,
      mintJobId: params.job.id,
      walletId: params.wallet.id,
      walletAddress: params.wallet.address,
      walletPrivateKey: params.wallet.privateKey,
      nonce: params.nonce,
      to: params.transaction.to,
      data: params.transaction.data,
      value: params.transaction.value.toString(),
      chainId: CHAIN_LOOKUP[params.job.target.chain].id,
      rpcUrl: preferredRpc.url,
      rpcKey: preferredRpc.key,
      gas: {
        maxFeePerGas: params.gasPlan.maxFeePerGas.toString(),
        maxPriorityFeePerGas: params.gasPlan.maxPriorityFeePerGas.toString(),
        gasLimit: this.withGasBuffer(params.transaction.gasEstimate).toString()
      },
      useFlashbots: shouldUseFlashbots,
      simulateBeforeSend: shouldUseFlashbots && params.job.policy.simulateFirst,
      notBeforeUnixMs: Date.now() + Math.max(0, Math.min(500, params.retryIndex * 100)),
      targetBlockNumber: params.decision.targetBlockNumber?.toString(),
      submissionMode: shouldUseFlashbots && params.decision.bundleTransactions ? "bundle" : "single"
    };

    await this.emit(params.job, "sign", "info", `Dispatching execution to Rust worker for ${params.wallet.label}.`, {
      wallet: params.wallet.label,
      nonce: params.nonce,
      rpc: preferredRpc.key
    });

    const result = await this.deps.executionAdapter!.execute(request);
    if (result.status !== "success") {
      throw new Error(result.error ?? `Rust executor failed for ${params.wallet.label}.`);
    }

    return {
      txHash: result.txHash,
      flashbotsBundleHash: result.bundleHash,
      rpcKey: shouldUseFlashbots ? "flashbots" : preferredRpc.key,
      route: "rust",
      simulated: Boolean(request.simulateBeforeSend),
      decisionToSubmissionMs: result.submittedAtUnixMs ? Math.max(0, result.submittedAtUnixMs - startedAtMs) : Date.now() - startedAtMs
    };
  }

  private resolveBaseGasRecommendation(
    job: MintJobInput,
    competition: CompetitionSnapshot | null,
    urgency: "low" | "medium" | "high" | "critical"
  ): CompetitiveGasEstimate {
    if (job.gasStrategy === "manual" && job.manualGas) {
      const prediction = this.deps.gasPredictor.predictNextBlockGas(job.target.chain);
      return {
        chain: job.target.chain,
        urgency,
        predictedBaseFeePerGas: prediction.predictedNextBaseFeePerGas,
        competitorP90MaxFeePerGas: competition?.p90MaxFeePerGas ?? 0n,
        competitorP90PriorityFeePerGas: competition?.p90PriorityFeePerGas ?? 0n,
        maxFeePerGas: job.manualGas.maxFeePerGas,
        maxPriorityFeePerGas: job.manualGas.maxPriorityFeePerGas,
        confidence: 1,
        reasoning: ["Manual gas strategy overrides predictive and competition-driven gas estimation."]
      };
    }

    return this.deps.gasPredictor.getCompetitiveGasEstimate({
      chain: job.target.chain,
      urgency,
      competition
    });
  }

  private buildAttemptGasRecommendation(
    job: MintJobInput,
    competition: CompetitionSnapshot | null,
    retryIndex: number,
    gasMode: MintStrategyDecision["recommendedGasMode"]
  ): CompetitiveGasEstimate {
    const urgency = gasMode === "aggressive" || retryIndex > 0 ? (retryIndex > 1 ? "critical" : "high") : "medium";
    const base = this.resolveBaseGasRecommendation(
      {
        ...job,
        gasStrategy: gasMode === "manual" ? "manual" : gasMode
      },
      competition,
      urgency
    );
    const retryMultiplierBps = 10_000n + BigInt(retryIndex * 1_250);

    return {
      ...base,
      urgency,
      maxFeePerGas: (base.maxFeePerGas * retryMultiplierBps) / 10_000n,
      maxPriorityFeePerGas: (base.maxPriorityFeePerGas * retryMultiplierBps) / 10_000n,
      reasoning: [...base.reasoning, retryIndex > 0 ? `Retry multiplier applied at ${retryMultiplierBps.toString()} bps.` : "Primary attempt uses base recommendation."]
    };
  }

  private resolveUrgency(job: MintJobInput, competition: CompetitionSnapshot | null): "low" | "medium" | "high" | "critical" {
    if (job.gasStrategy === "manual") {
      return "high";
    }
    if (job.gasStrategy === "aggressive") {
      return competition && competition.hypeScore > 0.95 ? "critical" : "high";
    }
    if (competition && (competition.hypeScore > 0.9 || competition.pendingTransactions >= 12)) {
      return "high";
    }
    return "medium";
  }

  private resolveRoute(job: MintJobInput, decision: MintStrategyDecision): "rpc" | "flashbots" | "rust" {
    if (this.deps.executionAdapter) {
      return "rust";
    }
    return decision.recommendedUseFlashbots && job.target.chain === "ethereum" ? "flashbots" : "rpc";
  }

  private selectRpcForAttempt(chain: MintJobInput["target"]["chain"], retryIndex: number): RpcEndpointConfig {
    const ranked = this.deps.rpcRouter.getRankedConfigs(chain, "http");
    if (!ranked.length) {
      return this.deps.rpcRouter.getPreferredConfig(chain);
    }

    return ranked[Math.min(retryIndex, ranked.length - 1)]!;
  }

  private isRetryableError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("timeout") ||
      normalized.includes("temporarily unavailable") ||
      normalized.includes("underpriced") ||
      normalized.includes("all rpc endpoints failed") ||
      normalized.includes("connection") ||
      normalized.includes("rate limit")
    );
  }

  private buildResult(job: MintJobInput, attempts: MintExecutionAttempt[]): MintJobResult {
    const confirmedCount = attempts.filter((attempt) => attempt.success).length;
    const failedCount = attempts.filter((attempt) => !attempt.success).length;

    return {
      jobId: job.id,
      status: attempts.length === 0 ? "skipped" : failedCount > 0 && confirmedCount === 0 ? "failed" : confirmedCount > 0 ? "confirmed" : "submitted",
      attempts,
      submittedCount: attempts.length,
      confirmedCount,
      failedCount,
      completedAt: nowIso()
    };
  }

  private buildWalletMetrics(
    wallets: UnlockedWallet[],
    attempts: MintExecutionAttempt[],
    historicalMetrics: WalletPerformanceMetric[]
  ): WalletPerformanceMetric[] {
    return wallets.map((wallet) => {
      const walletAttempts = attempts.filter((attempt) => attempt.walletId === wallet.id);
      const previous = historicalMetrics.find((metric) => metric.walletId === wallet.id);
      const feedback = this.deps.feedbackLoop.getWalletMetric(wallet.id);

      return {
        walletId: wallet.id,
        address: wallet.address,
        successfulMints: (previous?.successfulMints ?? 0) + walletAttempts.filter((attempt) => attempt.success).length,
        failedMints: (previous?.failedMints ?? 0) + walletAttempts.filter((attempt) => !attempt.success).length,
        totalGasSpentWei: previous?.totalGasSpentWei ?? 0n,
        pnlWei:
          (previous?.pnlWei ?? 0n) +
          walletAttempts.reduce((sum, attempt) => sum + (attempt.expectedProfitWei ?? 0n), 0n),
        recentSuccessRate: feedback.recentSuccessRate,
        avgLatencyMs: feedback.avgLatencyMs,
        lastUsedAt: feedback.lastUsedAt,
        stealthScore: feedback.stealthScore,
        updatedAt: nowIso()
      };
    });
  }

  private withGasBuffer(gasEstimate: bigint): bigint {
    return gasEstimate + gasEstimate / 5n + 21_000n;
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

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
