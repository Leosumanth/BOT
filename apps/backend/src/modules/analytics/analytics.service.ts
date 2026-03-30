import { Injectable } from "@nestjs/common";
import type { AnalyticsSummary, DashboardBootstrapResponse, DashboardSnapshot, GasFeeSnapshot, WalletPerformanceMetric } from "@mintbot/shared";
import { CHAIN_LOOKUP } from "@mintbot/shared";
import { DatabaseService } from "../../database/database.service.js";
import { RuntimeService } from "../runtime/runtime.service.js";

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly runtime: RuntimeService
  ) {}

  async getDashboardBootstrap(): Promise<DashboardBootstrapResponse> {
    const [wallets, contracts, logs, transactions, walletMetricRows, gasFeed] = await Promise.all([
      this.database.listWallets(),
      this.database.listContracts(),
      this.database.listRecentLogs(30),
      this.database.listRecentTransactions(20),
      this.database.summarizeWalletPerformance(),
      this.buildGasFeed()
    ]);

    const walletMetrics: WalletPerformanceMetric[] = walletMetricRows.map((row) => ({
      walletId: row.walletId,
      address: row.address,
      successfulMints: row.successfulMints,
      failedMints: row.failedMints,
      totalGasSpentWei: BigInt(row.totalGasSpentWei ?? 0),
      pnlWei: BigInt(row.pnlWei ?? 0),
      updatedAt: row.updatedAt
    }));

    const snapshot: DashboardSnapshot = {
      botStatus: transactions.some((tx) => tx.status === "queued" || tx.status === "submitted") ? "running" : "idle",
      activeJobs: [],
      recentActivity: logs
        .filter((entry) => entry.eventType === "tracker.pending-mint")
        .slice(0, 10)
        .map((entry) => entry.payload),
      gasFeed,
      rpcHealth: this.runtime.rpcRouter.getHealthSnapshot(),
      walletMetrics,
      trackedContracts: contracts
    };

    return {
      snapshot,
      wallets,
      recentJobs: []
    };
  }

  async getSummary(): Promise<AnalyticsSummary> {
    const [contracts, wallets, transactions, metrics] = await Promise.all([
      this.database.listContracts(),
      this.database.listWallets(),
      this.database.listRecentTransactions(500),
      this.database.summarizeWalletPerformance()
    ]);

    return {
      totalTrackedContracts: contracts.length,
      totalWallets: wallets.length,
      successfulMints: transactions.filter((entry) => entry.status === "confirmed").length,
      failedMints: transactions.filter((entry) => entry.status === "failed").length,
      totalGasSpentWei: 0n,
      topWallets: metrics.map((row) => ({
        walletId: row.walletId,
        address: row.address,
        successfulMints: row.successfulMints,
        failedMints: row.failedMints,
        totalGasSpentWei: BigInt(row.totalGasSpentWei ?? 0),
        pnlWei: BigInt(row.pnlWei ?? 0),
        updatedAt: row.updatedAt
      }))
    };
  }

  private async buildGasFeed(): Promise<GasFeeSnapshot[]> {
    const chains = Object.keys(CHAIN_LOOKUP) as Array<keyof typeof CHAIN_LOOKUP>;
    const results: GasFeeSnapshot[] = [];

    for (const chain of chains) {
      if (!this.runtime.rpcRouter.getConfigs(chain).length) {
        continue;
      }

      const block = await this.runtime.rpcRouter.executeWithFailover(chain, (runtime) => runtime.publicClient.getBlock());
      const baseFee = block.baseFeePerGas ?? 0n;

      results.push({
        chain,
        baseFeePerGas: baseFee,
        maxFeePerGas: baseFee * 2n,
        maxPriorityFeePerGas: 2_000_000_000n,
        observedAt: new Date().toISOString()
      });
    }

    return results;
  }
}
