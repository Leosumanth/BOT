import { BadRequestException, Injectable } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ApiKeyDescriptor, ApiKeyRecord, ApiKeysDashboardResponse, ApiKeyUpsertRequest, ManagedApiKey } from "@mintbot/shared";
import { AppConfigService } from "../../config/app-config.service.js";
import { DatabaseService } from "../../database/database.service.js";
import { RuntimeService } from "../runtime/runtime.service.js";

type ManagedApiKeyValues = Partial<Record<ManagedApiKey, string | undefined>>;

const API_KEY_CATALOG = [
  {
    key: "ETHEREUM_RPC_HTTP_ALCHEMY",
    label: "Ethereum Alchemy HTTP",
    category: "rpc",
    provider: "alchemy",
    kind: "url",
    description: "Primary Ethereum HTTP endpoint used for reads and transaction preparation.",
    chain: "ethereum",
    transport: "http",
    linkedPage: "/rpc"
  },
  {
    key: "ETHEREUM_RPC_HTTP_QUICKNODE",
    label: "Ethereum QuickNode HTTP",
    category: "rpc",
    provider: "quicknode",
    kind: "url",
    description: "Secondary Ethereum HTTP provider for failover and route ranking.",
    chain: "ethereum",
    transport: "http",
    linkedPage: "/rpc"
  },
  {
    key: "ETHEREUM_RPC_WS_ALCHEMY",
    label: "Ethereum Alchemy WebSocket",
    category: "rpc",
    provider: "alchemy",
    kind: "url",
    description: "Ethereum WebSocket stream used for subscriptions and live monitoring.",
    chain: "ethereum",
    transport: "ws",
    linkedPage: "/rpc"
  },
  {
    key: "ETHEREUM_RPC_WS_QUICKNODE",
    label: "Ethereum QuickNode WebSocket",
    category: "rpc",
    provider: "quicknode",
    kind: "url",
    description: "Backup Ethereum WebSocket provider for resilient mempool and block feeds.",
    chain: "ethereum",
    transport: "ws",
    linkedPage: "/rpc"
  },
  {
    key: "BASE_RPC_HTTP_ALCHEMY",
    label: "Base Alchemy HTTP",
    category: "rpc",
    provider: "alchemy",
    kind: "url",
    description: "Primary Base HTTP endpoint for chain reads and mint execution setup.",
    chain: "base",
    transport: "http",
    linkedPage: "/rpc"
  },
  {
    key: "BASE_RPC_HTTP_QUICKNODE",
    label: "Base QuickNode HTTP",
    category: "rpc",
    provider: "quicknode",
    kind: "url",
    description: "Secondary Base HTTP provider used for failover and ranking.",
    chain: "base",
    transport: "http",
    linkedPage: "/rpc"
  },
  {
    key: "BASE_RPC_WS_ALCHEMY",
    label: "Base Alchemy WebSocket",
    category: "rpc",
    provider: "alchemy",
    kind: "url",
    description: "Base WebSocket stream for subscriptions and realtime monitoring.",
    chain: "base",
    transport: "ws",
    linkedPage: "/rpc"
  },
  {
    key: "BASE_RPC_WS_QUICKNODE",
    label: "Base QuickNode WebSocket",
    category: "rpc",
    provider: "quicknode",
    kind: "url",
    description: "Backup Base WebSocket provider for resilient streaming coverage.",
    chain: "base",
    transport: "ws",
    linkedPage: "/rpc"
  },
  {
    key: "FLASHBOTS_RELAY_URL",
    label: "Flashbots Relay URL",
    category: "flashbots",
    provider: "flashbots",
    kind: "url",
    description: "Relay endpoint used when private bundle submission is enabled."
  },
  {
    key: "FLASHBOTS_AUTH_PRIVATE_KEY",
    label: "Flashbots Auth Private Key",
    category: "flashbots",
    provider: "flashbots",
    kind: "secret",
    description: "Signing key used to authenticate Flashbots bundle requests."
  }
] satisfies ApiKeyDescriptor[];

@Injectable()
export class ApiKeysService implements OnModuleInit {
  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService,
    private readonly runtime: RuntimeService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.database.ensureSchema();
    await this.runtime.applyManagedApiKeys(await this.getEffectiveValueMap());
  }

  async list(): Promise<ApiKeysDashboardResponse> {
    const entries = await this.buildRecords();

    return {
      entries,
      summary: {
        total: entries.length,
        configured: entries.filter((entry) => entry.enabled && entry.hasValue).length,
        databaseOverrides: entries.filter((entry) => entry.source === "database").length,
        envBacked: entries.filter((entry) => entry.source === "env").length,
        disabled: entries.filter((entry) => !entry.enabled).length,
        rpcConfigured: entries.filter((entry) => entry.category === "rpc" && entry.enabled && entry.hasValue).length,
        flashbotsReady: entries
          .filter((entry) => entry.category === "flashbots")
          .every((entry) => entry.enabled && entry.hasValue),
        lastRefreshedAt: new Date().toISOString()
      }
    };
  }

  async upsert(key: ManagedApiKey, request: ApiKeyUpsertRequest): Promise<ApiKeyRecord> {
    const definition = this.getDefinition(key);
    const stored = new Map((await this.database.listApiCredentials()).map((entry) => [entry.key, entry]));
    const existing = stored.get(key);
    const existingValue = existing?.valueCiphertext ? this.decrypt(existing.valueCiphertext) : undefined;
    const nextValue = request.value?.trim() || existingValue;

    if (request.enabled && !nextValue) {
      throw new BadRequestException(`A value is required to enable ${definition.label}.`);
    }

    await this.database.upsertApiCredential({
      key,
      valueCiphertext: nextValue ? this.encrypt(nextValue) : null,
      valueHint: nextValue ? maskValue(definition.kind, nextValue) : "Disabled in dashboard",
      enabled: request.enabled
    });

    await this.runtime.applyManagedApiKeys(await this.getEffectiveValueMap());
    const records = await this.buildRecords();
    return records.find((entry) => entry.key === key) ?? this.buildUnsetRecord(definition);
  }

  async remove(key: ManagedApiKey): Promise<{ removed: boolean }> {
    this.getDefinition(key);
    const removed = await this.database.deleteApiCredential(key);
    await this.runtime.applyManagedApiKeys(await this.getEffectiveValueMap());

    return { removed };
  }

  private async buildRecords(): Promise<ApiKeyRecord[]> {
    const stored = new Map((await this.database.listApiCredentials()).map((entry) => [entry.key, entry]));
    const envValues = this.config.getManagedApiKeyValues();

    return API_KEY_CATALOG.map((definition) => {
      const override = stored.get(definition.key);

      if (override) {
        const decryptedValue = override.valueCiphertext ? this.decrypt(override.valueCiphertext) : undefined;

        return {
          ...definition,
          source: "database",
          enabled: override.enabled,
          hasValue: override.enabled && Boolean(decryptedValue),
          valueHint: override.valueHint || (override.enabled ? "Configured in dashboard" : "Disabled in dashboard"),
          createdAt: override.createdAt,
          updatedAt: override.updatedAt
        } satisfies ApiKeyRecord;
      }

      const envValue = envValues[definition.key];
      if (envValue) {
        return {
          ...definition,
          source: this.config.hasManagedApiKeyEnvValue(definition.key) ? "env" : "default",
          enabled: true,
          hasValue: true,
          valueHint: maskValue(definition.kind, envValue)
        } satisfies ApiKeyRecord;
      }

      return this.buildUnsetRecord(definition);
    });
  }

  private async getEffectiveValueMap(): Promise<ManagedApiKeyValues> {
    const stored = new Map((await this.database.listApiCredentials()).map((entry) => [entry.key, entry]));
    const envValues = this.config.getManagedApiKeyValues();

    return API_KEY_CATALOG.reduce<ManagedApiKeyValues>((values, definition) => {
      const override = stored.get(definition.key);

      if (override) {
        values[definition.key] = override.enabled && override.valueCiphertext ? this.decrypt(override.valueCiphertext) : undefined;
        return values;
      }

      values[definition.key] = envValues[definition.key];
      return values;
    }, {});
  }

  private getDefinition(key: ManagedApiKey): ApiKeyDescriptor {
    const definition = API_KEY_CATALOG.find((entry) => entry.key === key);
    if (!definition) {
      throw new BadRequestException(`Unsupported API key ${key}.`);
    }

    return definition;
  }

  private buildUnsetRecord(definition: ApiKeyDescriptor): ApiKeyRecord {
    return {
      ...definition,
      source: "unset",
      enabled: true,
      hasValue: false,
      valueHint: "Not configured"
    };
  }

  private encrypt(value: string): string {
    const key = createHash("sha256").update(this.config.encryptionSecret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  private decrypt(payload: string): string {
    const key = createHash("sha256").update(this.config.encryptionSecret).digest();
    const buffer = Buffer.from(payload, "base64");
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }
}

function maskValue(kind: ApiKeyDescriptor["kind"], value: string): string {
  if (kind === "url") {
    try {
      const parsed = new URL(value);
      const suffix = parsed.pathname.length > 12 ? `...${parsed.pathname.slice(-12)}` : parsed.pathname;
      return `${parsed.origin}${suffix || "/"}`;
    } catch {
      return `${value.slice(0, 10)}...${value.slice(-6)}`;
    }
  }

  if (value.length <= 8) {
    return "*".repeat(Math.max(value.length, 4));
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
