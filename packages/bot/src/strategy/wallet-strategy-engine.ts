import { clamp, type WalletExecutionProfile, type WalletPerformanceMetric } from "@mintbot/shared";
import type { UnlockedWallet } from "../engine/types.js";

export class WalletStrategyEngine {
  rankWallets(
    wallets: UnlockedWallet[],
    metrics: WalletPerformanceMetric[],
    getWalletFeedback: (walletId: string) => Pick<WalletPerformanceMetric, "recentSuccessRate" | "avgLatencyMs" | "lastUsedAt" | "stealthScore">
  ): { wallets: UnlockedWallet[]; profiles: WalletExecutionProfile[] } {
    const profiles = wallets.map((wallet) => {
      const metric = metrics.find((entry) => entry.walletId === wallet.id);
      const feedback = getWalletFeedback(wallet.id);
      const successRate = feedback.recentSuccessRate ?? metric?.recentSuccessRate ?? this.deriveSuccessRate(metric);
      const avgLatencyMs = feedback.avgLatencyMs ?? metric?.avgLatencyMs ?? 0;
      const stealthScore = feedback.stealthScore ?? metric?.stealthScore ?? 0.7;
      const lastUsedAt = feedback.lastUsedAt ?? metric?.lastUsedAt;
      const cooldownMs = lastUsedAt ? Math.max(0, 20_000 - (Date.now() - new Date(lastUsedAt).getTime())) : 0;
      const randomizedDelayMs = Math.round(Math.random() * 250);
      const priorityScore = clamp(successRate * 0.55 + stealthScore * 0.25 - cooldownMs / 30_000 - avgLatencyMs / 20_000, 0, 1.1);

      return {
        walletId: wallet.id,
        successRate,
        avgLatencyMs,
        cooldownMs,
        stealthScore,
        priorityScore,
        randomizedDelayMs
      };
    });

    const byId = new Map(wallets.map((wallet) => [wallet.id, wallet]));
    const orderedProfiles = [...profiles].sort((left, right) => right.priorityScore - left.priorityScore);

    return {
      wallets: orderedProfiles.map((profile) => byId.get(profile.walletId)!).filter(Boolean),
      profiles: orderedProfiles
    };
  }

  private deriveSuccessRate(metric?: WalletPerformanceMetric): number {
    if (!metric) {
      return 0.5;
    }

    const total = metric.successfulMints + metric.failedMints;
    if (total === 0) {
      return 0.5;
    }

    return metric.successfulMints / total;
  }
}
