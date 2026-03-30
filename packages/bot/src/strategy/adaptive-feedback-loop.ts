import {
  clamp,
  nowIso,
  type ChainKey,
  type ExecutionLatencySample,
  type MintExecutionAttempt,
  type MintJobInput,
  type MintStrategyDecision,
  type WalletPerformanceMetric
} from "@mintbot/shared";

interface WalletFeedbackState {
  attempts: number;
  successes: number;
  totalLatencyMs: number;
  lastUsedAt?: string;
}

interface ChainFeedbackState {
  attempts: number;
  successes: number;
  cumulativeProfitWei: bigint;
  totalLatencyMs: number;
}

const MAX_LATENCY_SAMPLES = 60;

export class AdaptiveFeedbackLoop {
  private readonly walletStats = new Map<string, WalletFeedbackState>();
  private readonly chainStats = new Map<ChainKey, ChainFeedbackState>();
  private readonly latencySamples: ExecutionLatencySample[] = [];

  recordAttempt(params: {
    job: MintJobInput;
    attempt: MintExecutionAttempt;
    decision: MintStrategyDecision;
    route: "rpc" | "flashbots" | "rust";
    queuedToDecisionMs: number;
    decisionToSubmissionMs: number;
    submissionToConfirmationMs?: number;
  }): void {
    const { job, attempt, decision } = params;
    const wallet = this.walletStats.get(attempt.walletId) ?? {
      attempts: 0,
      successes: 0,
      totalLatencyMs: 0
    };
    wallet.attempts += 1;
    wallet.successes += attempt.success ? 1 : 0;
    wallet.totalLatencyMs += params.decisionToSubmissionMs + (params.submissionToConfirmationMs ?? 0);
    wallet.lastUsedAt = attempt.confirmedAt ?? attempt.submittedAt;
    this.walletStats.set(attempt.walletId, wallet);

    const chain = this.chainStats.get(job.target.chain) ?? {
      attempts: 0,
      successes: 0,
      cumulativeProfitWei: 0n,
      totalLatencyMs: 0
    };
    chain.attempts += 1;
    chain.successes += attempt.success ? 1 : 0;
    chain.cumulativeProfitWei += attempt.success ? decision.profitability.expectedProfitWei : -decision.profitability.totalCostWei;
    chain.totalLatencyMs += params.decisionToSubmissionMs + (params.submissionToConfirmationMs ?? 0);
    this.chainStats.set(job.target.chain, chain);

    this.latencySamples.unshift({
      chain: job.target.chain,
      jobId: job.id,
      walletId: attempt.walletId,
      strategy: decision.recommendedGasMode,
      route: params.route,
      queuedToDecisionMs: params.queuedToDecisionMs,
      decisionToSubmissionMs: params.decisionToSubmissionMs,
      submissionToConfirmationMs: params.submissionToConfirmationMs,
      totalLatencyMs:
        params.decisionToSubmissionMs +
        params.queuedToDecisionMs +
        (params.submissionToConfirmationMs ?? 0),
      observedAt: nowIso()
    });

    if (this.latencySamples.length > MAX_LATENCY_SAMPLES) {
      this.latencySamples.splice(MAX_LATENCY_SAMPLES);
    }
  }

  getWalletMetric(walletId: string): Pick<WalletPerformanceMetric, "recentSuccessRate" | "avgLatencyMs" | "lastUsedAt" | "stealthScore"> {
    const state = this.walletStats.get(walletId);
    if (!state) {
      return {
        recentSuccessRate: 0.5,
        avgLatencyMs: 0,
        lastUsedAt: undefined,
        stealthScore: 0.7
      };
    }

    const recentSuccessRate = state.attempts > 0 ? state.successes / state.attempts : 0.5;
    const avgLatencyMs = state.attempts > 0 ? Math.round(state.totalLatencyMs / state.attempts) : 0;
    const recencyPenalty = state.lastUsedAt ? Math.max(0, 1 - (Date.now() - new Date(state.lastUsedAt).getTime()) / 45_000) : 0;

    return {
      recentSuccessRate,
      avgLatencyMs,
      lastUsedAt: state.lastUsedAt,
      stealthScore: clamp(0.92 - recencyPenalty * 0.45, 0.25, 0.95)
    };
  }

  getChainBias(chain: ChainKey): number {
    const state = this.chainStats.get(chain);
    if (!state || state.attempts === 0) {
      return 0;
    }

    const successRate = state.successes / state.attempts;
    const avgLatency = state.totalLatencyMs / state.attempts;
    const profitSignal = Number(state.cumulativeProfitWei > 0n ? 1 : state.cumulativeProfitWei < 0n ? -1 : 0);

    return clamp(successRate * 0.6 + profitSignal * 0.18 - avgLatency / 15_000, -0.45, 0.55);
  }

  getLatencySamples(limit = 20): ExecutionLatencySample[] {
    return this.latencySamples.slice(0, limit);
  }
}
