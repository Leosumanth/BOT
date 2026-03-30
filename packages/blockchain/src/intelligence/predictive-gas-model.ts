import {
  CHAIN_LOOKUP,
  clamp,
  nowIso,
  type BlockObservation,
  type ChainKey,
  type CompetitionSnapshot,
  type CompetitiveGasEstimate,
  type GasPrediction
} from "@mintbot/shared";

interface GasState {
  observations: BlockObservation[];
}

const MAX_GAS_OBSERVATIONS = 24;

export class PredictiveGasModel {
  private readonly states = new Map<ChainKey, GasState>();

  observeBlock(observation: BlockObservation): void {
    const state = this.getState(observation.chain);
    const previous = state.observations[state.observations.length - 1];
    if (previous?.blockNumber === observation.blockNumber) {
      state.observations[state.observations.length - 1] = observation;
      return;
    }

    state.observations.push(observation);
    if (state.observations.length > MAX_GAS_OBSERVATIONS) {
      state.observations.splice(0, state.observations.length - MAX_GAS_OBSERVATIONS);
    }
  }

  predictNextBlockGas(chain: ChainKey): GasPrediction {
    const state = this.getState(chain);
    const latest = state.observations[state.observations.length - 1];
    const previous = state.observations[state.observations.length - 2];
    const latestBaseFee = latest?.baseFeePerGas ?? 0n;
    const ratio = latest?.gasUsedRatio ?? 1;
    const protocolPrediction = this.predictProtocolNextBaseFee(latestBaseFee, ratio);
    const trendDelta = latest && previous ? Number(latest.baseFeePerGas - previous.baseFeePerGas) : 0;
    const averageMomentum = this.calculateAverageMomentum(state.observations);
    const accelerationScore = clamp((trendDelta + averageMomentum) / Math.max(Number(latestBaseFee || 1n), 1), -0.35, 0.35);
    const predictedNextBaseFeePerGas = this.adjustPrediction(protocolPrediction, accelerationScore);
    const trend = accelerationScore > 0.03 ? "rising" : accelerationScore < -0.03 ? "falling" : "stable";
    const confidence = clamp(0.58 + Math.min(state.observations.length, 10) * 0.03 + Math.abs(accelerationScore) * 0.2, 0.3, 0.97);

    return {
      chain,
      observedAt: nowIso(),
      latestBaseFeePerGas: latestBaseFee,
      predictedNextBaseFeePerGas,
      accelerationScore,
      trend,
      confidence
    };
  }

  getCompetitiveGasEstimate(params: {
    chain: ChainKey;
    urgency: "low" | "medium" | "high" | "critical";
    competition?: CompetitionSnapshot | null;
  }): CompetitiveGasEstimate {
    const prediction = this.predictNextBlockGas(params.chain);
    const competition = params.competition;
    const urgencyPriority: Record<typeof params.urgency, bigint> = {
      low: 1_200_000_000n,
      medium: 2_200_000_000n,
      high: 3_600_000_000n,
      critical: 5_500_000_000n
    };

    const priorityFloor = urgencyPriority[params.urgency];
    const competitorPriority = competition?.p90PriorityFeePerGas ?? 0n;
    const competitorMaxFee = competition?.p90MaxFeePerGas ?? 0n;
    const competitionBump = competition ? BigInt(Math.max(1, Math.round(competition.hypeScore * 4))) * 350_000_000n : 0n;
    const maxPriorityFeePerGas = this.maxBigInt(priorityFloor, competitorPriority + competitionBump);
    const forecastEnvelope = prediction.predictedNextBaseFeePerGas * 2n + maxPriorityFeePerGas;
    const maxFeePerGas = this.maxBigInt(forecastEnvelope, competitorMaxFee + competitionBump + 500_000_000n);

    return {
      chain: params.chain,
      urgency: params.urgency,
      predictedBaseFeePerGas: prediction.predictedNextBaseFeePerGas,
      competitorP90MaxFeePerGas: competitorMaxFee,
      competitorP90PriorityFeePerGas: competitorPriority,
      maxFeePerGas,
      maxPriorityFeePerGas,
      confidence: clamp(prediction.confidence + (competition?.hypeScore ?? 0) * 0.08, 0.35, 0.99),
      reasoning: [
        `Predicted next base fee is ${prediction.predictedNextBaseFeePerGas.toString()} wei on ${CHAIN_LOOKUP[params.chain].label}.`,
        competition
          ? `Competition snapshot shows ${competition.pendingTransactions} pending mints and ${competition.competingWallets} wallets targeting the same contract.`
          : "No direct contract competition snapshot was available, so only predictive gas signals were used.",
        `Urgency ${params.urgency} sets the minimum priority fee floor at ${priorityFloor.toString()} wei.`
      ]
    };
  }

  getPredictions(): GasPrediction[] {
    return (Object.keys(CHAIN_LOOKUP) as ChainKey[]).map((chain) => this.predictNextBlockGas(chain));
  }

  private getState(chain: ChainKey): GasState {
    const existing = this.states.get(chain);
    if (existing) {
      return existing;
    }

    const next: GasState = { observations: [] };
    this.states.set(chain, next);
    return next;
  }

  private predictProtocolNextBaseFee(currentBaseFee: bigint, gasUsedRatio: number): bigint {
    if (currentBaseFee <= 0n) {
      return 0n;
    }

    const normalizedDelta = clamp(gasUsedRatio - 1, -1, 1);
    const adjustment = BigInt(Math.round(Number(currentBaseFee) * normalizedDelta * 0.125));
    return currentBaseFee + adjustment;
  }

  private calculateAverageMomentum(observations: BlockObservation[]): number {
    if (observations.length < 2) {
      return 0;
    }

    const deltas: number[] = [];
    for (let index = 1; index < observations.length; index += 1) {
      const previous = observations[index - 1]!;
      const current = observations[index]!;
      deltas.push(Number(current.baseFeePerGas - previous.baseFeePerGas));
    }

    return deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  }

  private adjustPrediction(protocolPrediction: bigint, accelerationScore: number): bigint {
    if (protocolPrediction <= 0n) {
      return 0n;
    }

    const accelerationAdjustment = BigInt(Math.round(Number(protocolPrediction) * accelerationScore * 0.35));
    return this.maxBigInt(0n, protocolPrediction + accelerationAdjustment);
  }

  private maxBigInt(left: bigint, right: bigint): bigint {
    return left > right ? left : right;
  }
}
