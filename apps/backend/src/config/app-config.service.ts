import { Injectable } from "@nestjs/common";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import type { ChainKey, ManagedApiKey, RpcEndpointConfig } from "@mintbot/shared";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const envFileCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "..", "..", ".env"),
  resolve(moduleDir, "../../../../.env")
];

for (const candidate of envFileCandidates) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

function firstDefinedEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeOriginCandidate(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) {
    return null;
  }

  const withProtocol = /^[a-z]+:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

const sanitizedProcessEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, value?.trim() ? value : undefined])
);

const normalizedEnv = {
  ...sanitizedProcessEnv,
  BACKEND_PORT: firstDefinedEnv("BACKEND_PORT", "PORT"),
  ADMIN_API_TOKEN: firstDefinedEnv("ADMIN_API_TOKEN", "PRIVATE_KEY_ENCRYPTION_SECRET", "ENCRYPTION_KEY"),
  PRIVATE_KEY_ENCRYPTION_SECRET: firstDefinedEnv("PRIVATE_KEY_ENCRYPTION_SECRET", "ENCRYPTION_KEY")
};

type ManagedApiKeyValues = Partial<Record<ManagedApiKey, string | undefined>>;

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().default("debug"),
  BACKEND_PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default("api"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  ADMIN_API_TOKEN: z.string().min(32),
  REALTIME_AUTH_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  MINT_QUEUE_NAME: z.string().default("mint-jobs"),
  TRACKER_QUEUE_NAME: z.string().default("tracker-jobs"),
  ENABLE_RUST_EXECUTOR: z.coerce.boolean().default(true),
  RUST_MINT_QUEUE_NAME: z.string().default("rust:mint"),
  RUST_RESULT_CHANNEL: z.string().default("rust:mint:results"),
  RUST_EXECUTION_TIMEOUT_MS: z.coerce.number().default(45_000),
  RUST_SUCCESS_RESULT_TTL_MS: z.coerce.number().default(600_000),
  BLOCK_MONITOR_INTERVAL_MS: z.coerce.number().default(1_000),
  ENABLE_INLINE_WORKER: z.coerce.boolean().default(true),
  ENABLE_MEMPOOL_TRACKER: z.coerce.boolean().default(true),
  PRIVATE_KEY_ENCRYPTION_SECRET: z.string().min(32),
  OPENSEA_API_KEY: z.string().optional(),
  ETHERSCAN_API_KEY: z.string().optional(),
  DRPC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
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
  readonly env = envSchema.parse(normalizedEnv);

  get port(): number {
    return this.env.BACKEND_PORT;
  }

  get apiPrefix(): string {
    return this.env.API_PREFIX;
  }

  get frontendUrl(): string {
    return this.env.FRONTEND_URL;
  }

  get adminApiToken(): string {
    return this.env.ADMIN_API_TOKEN;
  }

  get realtimeAuthSecret(): string {
    return this.env.REALTIME_AUTH_SECRET ?? this.env.ADMIN_API_TOKEN;
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

  get enableRustExecutor(): boolean {
    return this.env.ENABLE_RUST_EXECUTOR;
  }

  get rustMintQueueName(): string {
    return this.env.RUST_MINT_QUEUE_NAME;
  }

  get rustResultChannel(): string {
    return this.env.RUST_RESULT_CHANNEL;
  }

  get rustExecutionTimeoutMs(): number {
    return this.env.RUST_EXECUTION_TIMEOUT_MS;
  }

  get rustSuccessResultTtlMs(): number {
    return this.env.RUST_SUCCESS_RESULT_TTL_MS;
  }

  get blockMonitorIntervalMs(): number {
    return this.env.BLOCK_MONITOR_INTERVAL_MS;
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

  hasManagedApiKeyEnvValue(key: ManagedApiKey): boolean {
    return Boolean(sanitizedProcessEnv[key]);
  }

  getManagedApiKeyValues(): ManagedApiKeyValues {
    return {
      OPENSEA_API_KEY: this.env.OPENSEA_API_KEY,
      ETHERSCAN_API_KEY: this.env.ETHERSCAN_API_KEY,
      DRPC_API_KEY: this.env.DRPC_API_KEY,
      OPENAI_API_KEY: this.env.OPENAI_API_KEY
    };
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

  getFlashbotsConfig(): { relayUrl?: string; authPrivateKey?: string } {
    return {
      relayUrl: this.env.FLASHBOTS_RELAY_URL,
      authPrivateKey: this.env.FLASHBOTS_AUTH_PRIVATE_KEY
    };
  }

  isAllowedOrigin(origin: string | undefined, requestHost?: string | undefined): boolean {
    if (!origin) {
      return true;
    }

    const configuredOrigins = new Set(
      [
        normalizeOriginCandidate(this.frontendUrl),
        normalizeOriginCandidate(process.env.RAILWAY_STATIC_URL),
        normalizeOriginCandidate(process.env.RAILWAY_PUBLIC_DOMAIN)
      ].filter((value): value is string => Boolean(value))
    );

    if (configuredOrigins.has(origin)) {
      return true;
    }

    try {
      const frontendOrigin = normalizeOriginCandidate(this.frontendUrl);
      if (frontendOrigin && origin === frontendOrigin) {
        return true;
      }
    } catch {
      // Ignore invalid configured URLs; the env schema already guards the happy path.
    }

    if (requestHost) {
      const normalizedRequestHost = requestHost.toLowerCase();

      try {
        const originUrl = new URL(origin);
        if (originUrl.host.toLowerCase() === normalizedRequestHost) {
          return true;
        }
      } catch {
        return false;
      }
    }

    const localBackendOrigins = new Set([
      `http://127.0.0.1:${this.port}`,
      `http://localhost:${this.port}`
    ]);

    return localBackendOrigins.has(origin);
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
