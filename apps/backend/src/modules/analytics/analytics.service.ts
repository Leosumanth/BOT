import { Injectable } from "@nestjs/common";
import type {
  AnalyticsSummary,
  ChainOpportunityScore,
  DashboardBootstrapResponse,
  DashboardSnapshot,
  GasFeeSnapshot,
  WalletPerformanceMetric
} from "@mintbot/shared";
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
      trackedContracts: contracts,
      gasPredictions: this.runtime.gasPredictor.getPredictions(),
      blockTiming: this.runtime.blockTiming.getSnapshots(),
      competition: (Object.keys(CHAIN_LOOKUP) as Array<keyof typeof CHAIN_LOOKUP>).flatMap((chain) =>
        this.runtime.competitionAnalyzer.getTopContracts(chain, 3)
      ),
      chainOpportunities: this.buildChainOpportunities(gasFeed),
      latencySamples: this.runtime.feedbackLoop.getLatencySamples()
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
      const prediction = this.runtime.gasPredictor.predictNextBlockGas(chain);
      const baseFee = block.baseFeePerGas ?? 0n;

      results.push({
        chain,
        baseFeePerGas: baseFee,
        maxFeePerGas: prediction.predictedNextBaseFeePerGas * 2n,
        maxPriorityFeePerGas: 2_000_000_000n,
        observedAt: new Date().toISOString()
      });
    }

    return results;
  }

  private buildChainOpportunities(gasFeed: GasFeeSnapshot[]): ChainOpportunityScore[] {
    return gasFeed.map((entry) => ({
      chain: entry.chain,
      score: Math.max(0, 0.55 - Number(entry.maxFeePerGas) / 200_000_000_000),
      expectedProfitWei: 0n,
      gasPressureScore: Math.min(1.5, Number(entry.maxFeePerGas) / 120_000_000_000),
      demandScore: this.runtime.competitionAnalyzer.getChainHeat(entry.chain),
      observedAt: new Date().toISOString()
    }));
  }
}
