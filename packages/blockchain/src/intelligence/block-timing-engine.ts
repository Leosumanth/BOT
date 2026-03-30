import { CHAIN_LOOKUP, clamp, nowIso, type BlockObservation, type BlockTimingSnapshot, type ChainKey } from "@mintbot/shared";

interface ChainTimingState {
  observations: BlockObservation[];
}

const FALLBACK_BLOCK_TIME_MS: Record<ChainKey, number> = {
  ethereum: 12_000,
  base: 2_000
};

const MAX_OBSERVATIONS = 48;

export class BlockTimingEngine {
  private readonly states = new Map<ChainKey, ChainTimingState>();

  observeBlock(observation: BlockObservation): void {
    const state = this.getState(observation.chain);
    const previous = state.observations[state.observations.length - 1];
    if (previous?.blockNumber === observation.blockNumber) {
      state.observations[state.observations.length - 1] = observation;
      return;
    }

    state.observations.push(observation);
    if (state.observations.length > MAX_OBSERVATIONS) {
      state.observations.splice(0, state.observations.length - MAX_OBSERVATIONS);
    }
  }

  predictNextBlockTiming(chain: ChainKey, urgency: "low" | "medium" | "high" | "critical" = "medium"): BlockTimingSnapshot {
    const state = this.getState(chain);
    const latest = state.observations[state.observations.length - 1];
    const intervals = this.buildIntervals(state.observations);
    const averageBlockTimeMs = intervals.length
      ? Math.round(intervals.reduce((sum, interval, index) => sum + interval * (index + 1), 0) / intervals.reduce((sum, _, index) => sum + (index + 1), 0))
      : FALLBACK_BLOCK_TIME_MS[chain];
    const predictedNextBlockTimestamp = (latest?.timestampMs ?? Date.now()) + averageBlockTimeMs;
    const msUntilNextBlock = Math.max(0, predictedNextBlockTimestamp - Date.now());
    const baseLeadMs = urgency === "critical" ? 350 : urgency === "high" ? 600 : urgency === "medium" ? 1_000 : 1_600;
    const leadRatio = chain === "ethereum" ? 0.15 : 0.22;
    const recommendedLeadTimeMs = Math.max(baseLeadMs, Math.round(averageBlockTimeMs * leadRatio));
    const recommendedDelayMs = Math.max(0, msUntilNextBlock - recommendedLeadTimeMs);
    const volatility = this.standardDeviation(intervals);
    const confidence = clamp(0.55 + Math.min(intervals.length, 12) * 0.03 - Math.min(0.25, volatility / Math.max(averageBlockTimeMs, 1)), 0.2, 0.95);

    return {
      chain,
      latestBlockNumber: latest?.blockNumber,
      averageBlockTimeMs,
      predictedNextBlockAt: new Date(predictedNextBlockTimestamp).toISOString(),
      msUntilNextBlock,
      recommendedLeadTimeMs,
      recommendedDelayMs,
      confidence
    };
  }

  getSnapshots(): BlockTimingSnapshot[] {
    return (Object.keys(CHAIN_LOOKUP) as ChainKey[]).map((chain) => this.predictNextBlockTiming(chain));
  }

  private getState(chain: ChainKey): ChainTimingState {
    const existing = this.states.get(chain);
    if (existing) {
      return existing;
    }

    const next: ChainTimingState = { observations: [] };
    this.states.set(chain, next);
    return next;
  }

  private buildIntervals(observations: BlockObservation[]): number[] {
    const intervals: number[] = [];

    for (let index = 1; index < observations.length; index += 1) {
      const interval = observations[index]!.timestampMs - observations[index - 1]!.timestampMs;
      if (interval > 0) {
        intervals.push(interval);
      }
    }

    return intervals;
  }

  private standardDeviation(values: number[]): number {
    if (!values.length) {
      return 0;
    }

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }
}
