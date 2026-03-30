import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { ChainKey, RpcEndpointConfig } from "@mintbot/shared";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().default("debug"),
  BACKEND_PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default("api"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  MINT_QUEUE_NAME: z.string().default("mint-jobs"),
  TRACKER_QUEUE_NAME: z.string().default("tracker-jobs"),
  ENABLE_INLINE_WORKER: z.coerce.boolean().default(true),
  ENABLE_MEMPOOL_TRACKER: z.coerce.boolean().default(true),
  PRIVATE_KEY_ENCRYPTION_SECRET: z.string().min(32),
  FLASHBOTS_RELAY_URL: z.string().default("https://relay.flashbots.net"),
  FLASHBOTS_AUTH_PRIVATE_KEY: z.string().optional(),
  ETHEREUM_RPC_HTTP_ALCHEMY: z.string().optional(),
  ETHEREUM_RPC_HTTP_QUICKNODE: z.string().optional(),
  ETHEREUM_RPC_WS_ALCHEMY: z.string().optional(),
  ETHEREUM_RPC_WS_QUICKNODE: z.string().optional(),
  BASE_RPC_HTTP_ALCHEMY: z.string().optional(),
  BASE_RPC_HTTP_QUICKNODE: z.string().optional(),
  BASE_RPC_WS_ALCHEMY: z.string().optional(),
  BASE_RPC_WS_QUICKNODE: z.string().optional()
});

@Injectable()
export class AppConfigService {
  readonly env = envSchema.parse(process.env);

  get port(): number {
    return this.env.BACKEND_PORT;
  }

  get apiPrefix(): string {
    return this.env.API_PREFIX;
  }

  get frontendUrl(): string {
    return this.env.FRONTEND_URL;
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  get mintQueueName(): string {
    return this.env.MINT_QUEUE_NAME;
  }

  get trackerQueueName(): string {
    return this.env.TRACKER_QUEUE_NAME;
  }

  get enableInlineWorker(): boolean {
    return this.env.ENABLE_INLINE_WORKER;
  }

  get enableMempoolTracker(): boolean {
    return this.env.ENABLE_MEMPOOL_TRACKER;
  }

  get encryptionSecret(): string {
    return this.env.PRIVATE_KEY_ENCRYPTION_SECRET;
  }

  get flashbotsRelayUrl(): string {
    return this.env.FLASHBOTS_RELAY_URL;
  }

  get flashbotsAuthPrivateKey(): string | undefined {
    return this.env.FLASHBOTS_AUTH_PRIVATE_KEY;
  }

  getRpcEndpoints(): RpcEndpointConfig[] {
    return [
      ...this.buildChainRpcEndpoints("ethereum", {
        http: {
          alchemy: this.env.ETHEREUM_RPC_HTTP_ALCHEMY,
          quicknode: this.env.ETHEREUM_RPC_HTTP_QUICKNODE
        },
        ws: {
          alchemy: this.env.ETHEREUM_RPC_WS_ALCHEMY,
          quicknode: this.env.ETHEREUM_RPC_WS_QUICKNODE
        }
      }),
      ...this.buildChainRpcEndpoints("base", {
        http: {
          alchemy: this.env.BASE_RPC_HTTP_ALCHEMY,
          quicknode: this.env.BASE_RPC_HTTP_QUICKNODE
        },
        ws: {
          alchemy: this.env.BASE_RPC_WS_ALCHEMY,
          quicknode: this.env.BASE_RPC_WS_QUICKNODE
        }
      })
    ];
  }

  private buildChainRpcEndpoints(
    chain: ChainKey,
    values: {
      http: { alchemy?: string; quicknode?: string };
      ws: { alchemy?: string; quicknode?: string };
    }
  ): RpcEndpointConfig[] {
    const chainLabel = chain[0]?.toUpperCase() + chain.slice(1);

    return [
      values.http.alchemy
        ? {
            key: `${chain}-alchemy-http`,
            label: `${chainLabel} Alchemy HTTP`,
            chain,
            transport: "http",
            provider: "alchemy",
            url: values.http.alchemy,
            priority: 1,
            enabled: true
          }
        : null,
      values.http.quicknode
        ? {
            key: `${chain}-quicknode-http`,
            label: `${chainLabel} QuickNode HTTP`,
            chain,
            transport: "http",
            provider: "quicknode",
            url: values.http.quicknode,
            priority: 2,
            enabled: true
          }
        : null,
      values.ws.alchemy
        ? {
            key: `${chain}-alchemy-ws`,
            label: `${chainLabel} Alchemy WebSocket`,
            chain,
            transport: "ws",
            provider: "alchemy",
            url: values.ws.alchemy,
            priority: 1,
            enabled: true
          }
        : null,
      values.ws.quicknode
        ? {
            key: `${chain}-quicknode-ws`,
            label: `${chainLabel} QuickNode WebSocket`,
            chain,
            transport: "ws",
            provider: "quicknode",
            url: values.ws.quicknode,
            priority: 2,
            enabled: true
          }
        : null
    ].filter(Boolean) as RpcEndpointConfig[];
  }
}
