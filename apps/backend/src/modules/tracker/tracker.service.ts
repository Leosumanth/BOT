import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MempoolListener } from "@mintbot/blockchain";
import type { PendingMintActivity } from "@mintbot/shared";
import { CHAIN_LOOKUP } from "@mintbot/shared";
import { DatabaseService } from "../../database/database.service.js";
import { AppConfigService } from "../../config/app-config.service.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { RuntimeService } from "../runtime/runtime.service.js";

@Injectable()
export class TrackerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrackerService.name);
  private readonly listeners: MempoolListener[] = [];
  private readonly blockMonitors = new Map<string, ReturnType<typeof setInterval>>();
  private readonly latestObservedBlock = new Map<string, bigint>();

  constructor(
    private readonly config: AppConfigService,
    private readonly runtime: RuntimeService,
    private readonly database: DatabaseService,
    private readonly realtime: RealtimeGateway
  ) {}

  onModuleInit(): void {
    for (const chain of Object.keys(CHAIN_LOOKUP) as Array<keyof typeof CHAIN_LOOKUP>) {
      if (this.runtime.rpcRouter.getConfigs(chain).length > 0) {
        this.startBlockMonitor(chain);
      }

      if (!this.config.enableMempoolTracker) {
        continue;
      }

      const hasWs = this.runtime.rpcRouter.getConfigs(chain, "ws").length > 0;
      if (!hasWs) {
        continue;
      }

      const listener = new MempoolListener(this.runtime.rpcRouter, this.runtime.analyzer);
      listener.start(chain, (activity) => this.handlePendingActivity(activity));
      this.listeners.push(listener);
    }

    if (!this.config.enableMempoolTracker) {
      this.logger.log("Mempool tracker disabled by configuration.");
    }

    this.logger.log(`Tracker armed on ${this.listeners.length} websocket feed(s) with ${this.blockMonitors.size} block monitor(s).`);
  }

  onModuleDestroy(): void {
    for (const listener of this.listeners) {
      listener.stop();
    }

    for (const handle of this.blockMonitors.values()) {
      clearInterval(handle);
    }

    this.blockMonitors.clear();
  }

  private async handlePendingActivity(activity: PendingMintActivity): Promise<void> {
    if (activity.to) {
      this.runtime.competitionAnalyzer.observePendingMint(activity);
    }

    await this.database.insertLog({
      level: "info",
      eventType: "tracker.pending-mint",
      message: `Detected pending mint call on ${activity.chain}.`,
      payload: activity
    });

    this.realtime.emitMintFeed(activity);
  }

  private startBlockMonitor(chain: keyof typeof CHAIN_LOOKUP): void {
    if (this.blockMonitors.has(chain)) {
      return;
    }

    const poll = async (): Promise<void> => {
      try {
        const block = await this.runtime.rpcRouter.executeWithFailover(chain, (runtime) => runtime.publicClient.getBlock());
        const lastSeen = this.latestObservedBlock.get(chain);
        if (lastSeen === block.number) {
          return;
        }

        this.latestObservedBlock.set(chain, block.number);
        const gasTarget = block.gasLimit > 0n ? Number(block.gasLimit / 2n) : 0;
        const gasUsedRatio = gasTarget > 0 ? Number(block.gasUsed) / gasTarget : 1;
        const observation = {
          chain,
          blockNumber: block.number,
          timestampMs: Number(block.timestamp) * 1_000,
          baseFeePerGas: block.baseFeePerGas ?? 0n,
          gasUsedRatio,
          transactionCount: block.transactions.length,
          observedAt: new Date().toISOString()
        };

        this.runtime.blockTiming.observeBlock(observation);
        this.runtime.gasPredictor.observeBlock(observation);
      } catch (error) {
        this.logger.warn(
          `Block monitor failed for ${chain}: ${error instanceof Error ? error.message : "Unknown polling error"}`
        );
      }
    };

    void poll();
    const handle = setInterval(() => {
      void poll();
    }, this.config.blockMonitorIntervalMs);

    this.blockMonitors.set(chain, handle);
  }
}
