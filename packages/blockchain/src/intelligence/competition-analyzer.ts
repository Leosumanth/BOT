import { clamp, nowIso, type ChainKey, type CompetitionSnapshot, type PendingMintActivity } from "@mintbot/shared";

interface CompetitionState {
  recentActivity: PendingMintActivity[];
}

const WINDOW_MS = 90_000;
const WAVE_WINDOW_MS = 15_000;

export class CompetitionAnalyzer {
  private readonly states = new Map<string, CompetitionState>();

  observePendingMint(activity: PendingMintActivity): void {
    if (!activity.to) {
      return;
    }

    const state = this.getState(activity.chain, activity.to);
    state.recentActivity.push(activity);
    this.prune(state);
  }

  getCompetition(chain: ChainKey, contractAddress: `0x${string}`): CompetitionSnapshot | null {
    const state = this.states.get(this.key(chain, contractAddress));
    if (!state) {
      return null;
    }

    this.prune(state);
    if (!state.recentActivity.length) {
      return null;
    }

    const now = Date.now();
    const recentWave = state.recentActivity.filter((entry) => now - new Date(entry.detectedAt).getTime() <= WAVE_WINDOW_MS);
    const competingWallets = new Set(state.recentActivity.map((entry) => entry.from.toLowerCase())).size;
    const feeSamples = state.recentActivity.map((entry) => entry.maxFeePerGas ?? entry.gasPriceWei ?? 0n);
    const prioritySamples = state.recentActivity.map((entry) => entry.maxPriorityFeePerGas ?? 0n);
    const whaleWallets = this.countWhales(state.recentActivity);
    const waveVelocity = recentWave.length / Math.max(WAVE_WINDOW_MS / 1000, 1);
    const demandPressure = clamp(state.recentActivity.length / 24, 0, 1.2);
    const hypeScore = clamp(demandPressure * 0.45 + competingWallets / 18 + whaleWallets * 0.08 + waveVelocity * 0.12, 0, 1.4);

    return {
      chain,
      contractAddress,
      observedAt: nowIso(),
      pendingTransactions: state.recentActivity.length,
      competingWallets,
      whaleWallets,
      waveVelocity,
      hypeScore,
      medianMaxFeePerGas: this.percentileBigInt(feeSamples, 0.5),
      p90MaxFeePerGas: this.percentileBigInt(feeSamples, 0.9),
      medianPriorityFeePerGas: this.percentileBigInt(prioritySamples, 0.5),
      p90PriorityFeePerGas: this.percentileBigInt(prioritySamples, 0.9),
      topPriorityFeePerGas: this.percentileBigInt(prioritySamples, 1)
    };
  }

  getChainHeat(chain: ChainKey): number {
    const snapshots = [...this.states.entries()]
      .filter(([key]) => key.startsWith(`${chain}:`))
      .map(([key]) => {
        const contractAddress = key.split(":")[1] as `0x${string}`;
        return this.getCompetition(chain, contractAddress);
      })
      .filter((snapshot): snapshot is CompetitionSnapshot => Boolean(snapshot));

    if (!snapshots.length) {
      return 0;
    }

    return clamp(snapshots.reduce((sum, snapshot) => sum + snapshot.hypeScore, 0) / snapshots.length, 0, 1.5);
  }

  getTopContracts(chain: ChainKey, limit = 5): CompetitionSnapshot[] {
    return [...this.states.keys()]
      .filter((key) => key.startsWith(`${chain}:`))
      .map((key) => {
        const contractAddress = key.split(":")[1] as `0x${string}`;
        return this.getCompetition(chain, contractAddress);
      })
      .filter((snapshot): snapshot is CompetitionSnapshot => Boolean(snapshot))
      .sort((left, right) => right.hypeScore - left.hypeScore)
      .slice(0, limit);
  }

  private getState(chain: ChainKey, contractAddress: `0x${string}`): CompetitionState {
    const key = this.key(chain, contractAddress);
    const existing = this.states.get(key);
    if (existing) {
      return existing;
    }

    const next: CompetitionState = { recentActivity: [] };
    this.states.set(key, next);
    return next;
  }

  private prune(state: CompetitionState): void {
    const threshold = Date.now() - WINDOW_MS;
    state.recentActivity = state.recentActivity.filter((entry) => new Date(entry.detectedAt).getTime() >= threshold);
  }

  private countWhales(activity: PendingMintActivity[]): number {
    const counts = new Map<string, number>();

    for (const entry of activity) {
      const key = entry.from.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.values()].filter((count) => count >= 3).length;
  }

  private percentileBigInt(values: bigint[], percentile: number): bigint {
    if (!values.length) {
      return 0n;
    }

    const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * percentile)));
    return sorted[index] ?? 0n;
  }

  private key(chain: ChainKey, contractAddress: `0x${string}`): string {
    return `${chain}:${contractAddress.toLowerCase()}`;
  }
}
