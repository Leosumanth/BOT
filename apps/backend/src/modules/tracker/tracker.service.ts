import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { MempoolListener } from "@mintbot/blockchain";
import type { PendingMintActivity } from "@mintbot/shared";
import { CHAIN_LOOKUP } from "@mintbot/shared";
import { DatabaseService } from "../../database/database.service.js";
import { AppConfigService } from "../../config/app-config.service.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { RuntimeService } from "../runtime/runtime.service.js";

@Injectable()
export class TrackerService implements OnModuleInit {
  private readonly logger = new Logger(TrackerService.name);
  private readonly listeners: MempoolListener[] = [];

  constructor(
    private readonly config: AppConfigService,
    private readonly runtime: RuntimeService,
    private readonly database: DatabaseService,
    private readonly realtime: RealtimeGateway
  ) {}

  onModuleInit(): void {
    if (!this.config.enableMempoolTracker) {
      this.logger.log("Mempool tracker disabled by configuration.");
      return;
    }

    for (const chain of Object.keys(CHAIN_LOOKUP) as Array<keyof typeof CHAIN_LOOKUP>) {
      const hasWs = this.runtime.rpcRouter.getConfigs(chain, "ws").length > 0;
      if (!hasWs) {
        continue;
      }

      const listener = new MempoolListener(this.runtime.rpcRouter, this.runtime.analyzer);
      listener.start(chain, (activity) => this.handlePendingActivity(activity));
      this.listeners.push(listener);
    }

    this.logger.log(`Tracker armed on ${this.listeners.length} websocket feed(s).`);
  }

  private async handlePendingActivity(activity: PendingMintActivity): Promise<void> {
    await this.database.insertLog({
      level: "info",
      eventType: "tracker.pending-mint",
      message: `Detected pending mint call on ${activity.chain}.`,
      payload: activity
    });

    this.realtime.emitMintFeed(activity);
  }
}
