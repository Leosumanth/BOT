import { Injectable } from "@nestjs/common";
import type { SystemOverview } from "@mintbot/shared";
import { AppConfigService } from "../../config/app-config.service.js";

function isPublicFrontend(frontendUrl: string): boolean {
  try {
    const parsed = new URL(frontendUrl);
    return !["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

@Injectable()
export class SystemService {
  constructor(private readonly config: AppConfigService) {}

  getOverview(): SystemOverview {
    return {
      service: "mintbot-backend",
      ok: true,
      apiBasePath: `/${this.config.apiPrefix}`,
      frontendMode: isPublicFrontend(this.config.frontendUrl) ? "redirect" : "embedded",
      frontendUrl: this.config.frontendUrl,
      socketPath: "/socket.io",
      timestamp: new Date().toISOString(),
      featureFlags: {
        flashbots: Boolean(this.config.flashbotsAuthPrivateKey),
        rustExecutor: this.config.enableRustExecutor,
        inlineWorker: this.config.enableInlineWorker,
        mempoolTracker: this.config.enableMempoolTracker
      },
      queues: {
        mint: this.config.mintQueueName,
        tracker: this.config.trackerQueueName
      },
      availableRoutes: [
        "/api/analytics/dashboard",
        "/api/analytics/summary",
        "/api/tasks",
        "/api/rpc",
        "/api/wallets",
        "/api/contracts",
        "/api/system"
      ]
    };
  }
}
