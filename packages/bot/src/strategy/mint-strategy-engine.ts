import {
  clamp,
  type ChainOpportunityScore,
  type CompetitionSnapshot,
  type CompetitiveGasEstimate,
  type ContractAnalysisResult,
  type GasPrediction,
  type MintJobInput,
  type MintStrategyDecision,
  type ProfitabilityEstimate,
  type BlockTimingSnapshot
} from "@mintbot/shared";

export class MintStrategyEngine {
  evaluate(params: {
    job: MintJobInput;
    contractAnalysis?: ContractAnalysisResult | null;
    gasEstimate: bigint;
    gasRecommendation: CompetitiveGasEstimate;
    gasPrediction: GasPrediction;
    timing: BlockTimingSnapshot;
    competition?: CompetitionSnapshot | null;
    chainBias: number;
    walletSuccessRate: number;
  }): MintStrategyDecision {
    const mintPriceWei = params.job.target.valueWei ?? params.contractAnalysis?.priceWei ?? 0n;
    const profitability = this.estimateProfitability({
      mintPriceWei,
      gasLimit: params.gasEstimate,
      maxFeePerGas: params.gasRecommendation.maxFeePerGas,
      competition: params.competition,
      chainBias: params.chainBias,
      contractAnalysis: params.contractAnalysis
    });

    const suspiciousSignals = this.collectRiskFlags(params.contractAnalysis, params.competition, profitability, params.chainBias);
    const demandScore = clamp(
      (params.competition?.hypeScore ?? 0) * 0.5 +
        params.walletSuccessRate * 0.15 +
        params.chainBias * 0.2 +
        (params.contractAnalysis?.detectedMintFunction ? 0.15 : -0.18),
      0,
      1.25
    );
    const gasPressureScore = clamp((params.gasPrediction.accelerationScore + (params.competition?.hypeScore ?? 0) * 0.35) * 0.5 + 0.3, 0, 1.5);
    const chainOpportunity: ChainOpportunityScore = {
      chain: params.job.target.chain,
      score: clamp(demandScore * 0.55 + Number(profitability.expectedProfitWei > 0n) * 0.2 + params.chainBias * 0.25 - gasPressureScore * 0.18, 0, 1.4),
      expectedProfitWei: profitability.expectedProfitWei,
      gasPressureScore,
      demandScore,
      observedAt: new Date().toISOString()
    };

    const strategyScore = clamp(
      chainOpportunity.score * 0.52 +
        profitability.roiBps / 25_000 +
        params.gasPrediction.confidence * 0.18 +
        params.timing.confidence * 0.15 -
        suspiciousSignals.length * 0.12,
      0,
      1
    );
    const allowMint =
      strategyScore >= (params.job.source === "manual" ? 0.42 : 0.55) &&
      profitability.expectedProfitWei >= 0n &&
      !suspiciousSignals.some((flag) => flag.startsWith("suspicious"));
    const recommendedGasMode =
      params.job.gasStrategy === "manual"
        ? "manual"
        : params.competition && (params.competition.pendingTransactions >= 8 || params.gasPrediction.trend === "rising")
          ? "aggressive"
          : "adaptive";
    const recommendedUseFlashbots = params.job.target.chain === "ethereum" && (gasPressureScore > 0.78 || profitability.expectedProfitWei > profitability.totalCostWei / 3n);
    const bundleTransactions = recommendedUseFlashbots && Boolean(params.competition && params.competition.pendingTransactions >= 12);
    const reducedDelay = Math.round(params.timing.recommendedDelayMs * (1 - Math.min(0.6, (params.competition?.hypeScore ?? 0) * 0.45)));
    const suggestedSubmissionDelayMs = Math.max(0, reducedDelay);

    return {
      allowMint,
      strategyScore,
      confidence: clamp(strategyScore * 0.7 + params.gasPrediction.confidence * 0.15 + params.timing.confidence * 0.15, 0.2, 0.99),
      reason: allowMint
        ? `Opportunity cleared with strategy score ${strategyScore.toFixed(2)} and projected ROI ${profitability.roiBps}bps.`
        : `Opportunity rejected with score ${strategyScore.toFixed(2)} due to ${suspiciousSignals[0] ?? "weak profitability"}.`,
      riskFlags: suspiciousSignals,
      recommendedGasMode,
      recommendedUseFlashbots,
      bundleTransactions,
      suggestedSubmissionDelayMs,
      targetBlockNumber: params.timing.latestBlockNumber ? params.timing.latestBlockNumber + 1n : undefined,
      profitability,
      chainOpportunity
    };
  }

  private estimateProfitability(params: {
    mintPriceWei: bigint;
    gasLimit: bigint;
    maxFeePerGas: bigint;
    competition?: CompetitionSnapshot | null;
    chainBias: number;
    contractAnalysis?: ContractAnalysisResult | null;
  }): ProfitabilityEstimate {
    const gasCostWei = params.gasLimit * params.maxFeePerGas;
    const heuristicBaseValueWei = this.maxBigInt(params.mintPriceWei, gasCostWei > 0n ? gasCostWei : 1_000_000_000_000_000n);
    const demandBps = Math.round(
      10_000 +
        (params.competition?.hypeScore ?? 0) * 4_200 +
        params.chainBias * 1_200 +
        (params.contractAnalysis?.detectedMintFunction ? 650 : -900) -
        (params.contractAnalysis?.warnings.length ?? 0) * 750
    );
    const expectedValueWei = (heuristicBaseValueWei * BigInt(Math.max(7_500, demandBps))) / 10_000n;
    const totalCostWei = params.mintPriceWei + gasCostWei;
    const expectedProfitWei = expectedValueWei - totalCostWei;
    const roiBps = totalCostWei > 0n ? Number((expectedProfitWei * 10_000n) / totalCostWei) : 0;

    return {
      mintPriceWei: params.mintPriceWei,
      gasCostWei,
      totalCostWei,
      expectedValueWei,
      expectedProfitWei,
      roiBps
    };
  }

  private collectRiskFlags(
    contractAnalysis: ContractAnalysisResult | null | undefined,
    competition: CompetitionSnapshot | null | undefined,
    profitability: ProfitabilityEstimate,
    chainBias: number
  ): string[] {
    const flags: string[] = [];

    if (!contractAnalysis?.detectedMintFunction) {
      flags.push("suspicious: no mint function was confidently detected");
    }
    if ((contractAnalysis?.warnings.length ?? 0) >= 2) {
      flags.push("suspicious: analyzer surfaced multiple contract warnings");
    }
    if ((competition?.pendingTransactions ?? 0) < 2) {
      flags.push("low-demand: insufficient competing wallets detected");
    }
    if (competition && competition.whaleWallets === 0 && competition.hypeScore < 0.2) {
      flags.push("low-signal: no whale or wave signals detected");
    }
    if (profitability.expectedProfitWei < 0n) {
      flags.push("unprofitable: expected value does not cover mint and gas costs");
    }
    if (chainBias < -0.2) {
      flags.push("chain-weakness: recent execution quality on this chain is poor");
    }

    return flags;
  }

  private maxBigInt(left: bigint, right: bigint): bigint {
    return left > right ? left : right;
  }
}
