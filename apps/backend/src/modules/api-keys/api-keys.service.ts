import { BadRequestException, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type {
  ApiKeyDescriptor,
  ApiKeyRecord,
  ApiKeysDashboardResponse,
  ApiKeyTestResponse,
  ApiKeyTestResult,
  ApiKeyUpsertRequest,
  ManagedApiKey
} from "@mintbot/shared";
import { AppConfigService } from "../../config/app-config.service.js";
import { DatabaseService } from "../../database/database.service.js";

type ManagedApiKeyValues = Partial<Record<ManagedApiKey, string | undefined>>;

const OPENSEA_TEST_COLLECTION = "cryptopunks";
const ETHERSCAN_TEST_URL = "https://api.etherscan.io/v2/api";
const DRPC_TEST_URL = "https://lb.drpc.live/ethereum/";
const OPENAI_TEST_URL = "https://api.openai.com/v1/models";

const API_KEY_CATALOG = [
  {
    key: "OPENSEA_API_KEY",
    label: "OpenSea",
    category: "marketplace",
    provider: "opensea",
    kind: "secret",
    description: "Marketplace API key used for OpenSea collection and drop intelligence."
  },
  {
    key: "ETHERSCAN_API_KEY",
    label: "Etherscan",
    category: "explorer",
    provider: "etherscan",
    kind: "secret",
    description: "Explorer API key used for ABI lookups and on-chain contract metadata."
  },
  {
    key: "DRPC_API_KEY",
    label: "dRPC",
    category: "rpc-service",
    provider: "drpc",
    kind: "secret",
    description: "Raw dRPC API key for services that build authenticated RPC requests."
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI",
    category: "ai",
    provider: "openai",
    kind: "secret",
    description: "OpenAI API key for AI-assisted analysis and automation features."
  }
] satisfies ApiKeyDescriptor[];

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService
  ) {}

  async list(): Promise<ApiKeysDashboardResponse> {
    const entries = await this.buildRecords();

    return {
      entries,
      summary: {
        total: entries.length,
        configured: entries.filter((entry) => entry.hasValue).length,
        databaseOverrides: entries.filter((entry) => entry.source === "database").length,
        envBacked: entries.filter((entry) => entry.source === "env").length,
        lastRefreshedAt: new Date().toISOString()
      }
    };
  }

  async upsert(key: ManagedApiKey, request: ApiKeyUpsertRequest): Promise<ApiKeyRecord> {
    const definition = this.getDefinition(key);
    const nextValue = request.value?.trim();

    if (!nextValue) {
      throw new BadRequestException(`A value is required to save ${definition.label}.`);
    }

    await this.database.upsertApiCredential({
      key,
      valueCiphertext: this.encrypt(nextValue),
      valueHint: "Saved in dashboard",
      enabled: true
    });

    const records = await this.buildRecords();
    return records.find((entry) => entry.key === key) ?? this.buildUnsetRecord(definition);
  }

  async remove(key: ManagedApiKey): Promise<{ removed: boolean }> {
    this.getDefinition(key);
    const removed = await this.database.deleteApiCredential(key);
    return { removed };
  }

  async testAll(): Promise<ApiKeyTestResponse> {
    const testedAt = new Date().toISOString();
    const records = await this.buildRecords();
    const effectiveValues = await this.getEffectiveValueMap();
    const results = await Promise.all(records.map((record) => this.testRecord(record, effectiveValues[record.key], testedAt)));

    return {
      testedAt,
      summary: {
        valid: results.filter((entry) => entry.status === "valid").length,
        invalid: results.filter((entry) => entry.status === "invalid").length,
        skipped: results.filter((entry) => entry.status === "skipped").length
      },
      results
    };
  }

  async testOne(key: ManagedApiKey): Promise<ApiKeyTestResult> {
    const testedAt = new Date().toISOString();
    const records = await this.buildRecords();
    const record = records.find((entry) => entry.key === key);

    if (!record) {
      throw new BadRequestException(`Unsupported API key ${key}.`);
    }

    const effectiveValues = await this.getEffectiveValueMap();
    return this.testRecord(record, effectiveValues[key], testedAt);
  }

  private async buildRecords(): Promise<ApiKeyRecord[]> {
    const stored = new Map((await this.database.listApiCredentials()).map((entry) => [entry.key, entry]));
    const envValues = this.config.getManagedApiKeyValues();

    return API_KEY_CATALOG.map((definition) => {
      const override = stored.get(definition.key);
      const overrideValue = override?.enabled && override.valueCiphertext ? this.decrypt(override.valueCiphertext) : undefined;

      if (overrideValue) {
        return {
          ...definition,
          source: "database",
          hasValue: true,
          valueHint: "Saved in dashboard",
          createdAt: override?.createdAt,
          updatedAt: override?.updatedAt
        } satisfies ApiKeyRecord;
      }

      if (envValues[definition.key]) {
        return {
          ...definition,
          source: "env",
          hasValue: true,
          valueHint: "Configured in environment"
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

      if (override?.enabled && override.valueCiphertext) {
        values[definition.key] = this.decrypt(override.valueCiphertext);
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

  private buildTestResult(key: ManagedApiKey, status: ApiKeyTestResult["status"], message: string, testedAt: string): ApiKeyTestResult {
    return { key, status, message, testedAt };
  }

  private async testRecord(record: ApiKeyRecord, value: string | undefined, testedAt: string): Promise<ApiKeyTestResult> {
    if (!record.hasValue || !value) {
      return this.buildTestResult(record.key, "invalid", "No key configured.", testedAt);
    }

    try {
      switch (record.key) {
        case "OPENSEA_API_KEY":
          return this.buildTestResult(record.key, "valid", await this.verifyOpenSeaKey(value), testedAt);
        case "ETHERSCAN_API_KEY":
          return this.buildTestResult(record.key, "valid", await this.verifyEtherscanKey(value), testedAt);
        case "DRPC_API_KEY":
          return this.buildTestResult(record.key, "valid", await this.verifyDrpcKey(value), testedAt);
        case "OPENAI_API_KEY":
          return this.buildTestResult(record.key, "valid", await this.verifyOpenAiKey(value), testedAt);
        default:
          return this.buildTestResult(record.key, "skipped", "No validator is wired for this key yet.", testedAt);
      }
    } catch (error) {
      return this.buildTestResult(record.key, "invalid", error instanceof Error ? error.message : "Validation failed.", testedAt);
    }
  }

  private async verifyOpenSeaKey(value: string): Promise<string> {
    this.assertRawToken(value, {
      label: "OpenSea",
      blockedPatterns: [/^https?:\/\//i, /x-api-key/i, /^curl\b/i],
      invalidInputMessage: "Paste the raw OpenSea API key only."
    });

    const { response, payload } = await this.requestJson(`https://api.opensea.io/api/v2/collections/${OPENSEA_TEST_COLLECTION}`, {
      method: "GET",
      headers: {
        "x-api-key": value
      }
    });

    if (!response.ok) {
      throw new Error(this.pickApiError(payload, `OpenSea request failed with status ${response.status}.`));
    }

    return "OpenSea key is valid.";
  }

  private async verifyEtherscanKey(value: string): Promise<string> {
    this.assertRawToken(value, {
      label: "Etherscan",
      blockedPatterns: [/^https?:\/\//i, /etherscan/i, /apikey=/i],
      invalidInputMessage: "Paste the raw Etherscan API key only."
    });

    const url = new URL(ETHERSCAN_TEST_URL);
    url.search = new URLSearchParams({
      chainid: "1",
      module: "stats",
      action: "ethprice",
      apikey: value
    }).toString();

    const { response, payload } = await this.requestJson(url.toString());

    if (!response.ok) {
      throw new Error(this.pickApiError(payload, `Etherscan request failed with status ${response.status}.`));
    }

    if (String(payload?.status ?? "") !== "1") {
      throw new Error(this.pickApiError(payload, "Etherscan rejected the API key."));
    }

    return "Etherscan key is valid.";
  }

  private async verifyDrpcKey(value: string): Promise<string> {
    this.assertRawToken(value, {
      label: "dRPC",
      blockedPatterns: [/^https?:\/\//i, /drpc/i, /^curl\b/i],
      invalidInputMessage: "Paste the raw dRPC API key only."
    });

    const { response, payload } = await this.requestJson(`${DRPC_TEST_URL}${encodeURIComponent(value)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: []
      })
    });

    if (!response.ok) {
      throw new Error(this.pickApiError(payload, `dRPC request failed with status ${response.status}.`));
    }

    if (payload?.jsonrpc !== "2.0" || payload?.error || !payload?.result) {
      throw new Error(this.pickApiError(payload, "dRPC rejected the API key."));
    }

    return "dRPC key is valid.";
  }

  private async verifyOpenAiKey(value: string): Promise<string> {
    this.assertRawToken(value, {
      label: "OpenAI",
      blockedPatterns: [/^https?:\/\//i, /authorization:/i, /^curl\b/i],
      invalidInputMessage: "Paste the raw OpenAI API key only."
    });

    const { response, payload } = await this.requestJson(OPENAI_TEST_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${value}`
      }
    });

    if (!response.ok) {
      throw new Error(this.pickApiError(payload, `OpenAI request failed with status ${response.status}.`));
    }

    return "OpenAI key is valid.";
  }

  private assertRawToken(
    value: string,
    options: {
      label: string;
      blockedPatterns: RegExp[];
      invalidInputMessage: string;
    }
  ): void {
    if (!value.trim()) {
      throw new Error(`${options.label} key is empty.`);
    }

    if (options.blockedPatterns.some((pattern) => pattern.test(value))) {
      throw new Error(options.invalidInputMessage);
    }

    if (/\s/.test(value)) {
      throw new Error(`${options.label} key must be a single token with no spaces.`);
    }
  }

  private async requestJson(url: string, init: RequestInit = {}): Promise<{ response: Response; payload: any }> {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {})
      }
    });

    const raw = await response.text();
    let payload: any = {};

    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { raw };
      }
    }

    return { response, payload };
  }

  private pickApiError(payload: any, fallback: string): string {
    return (
      payload?.error?.message ||
      payload?.error?.type ||
      payload?.result ||
      payload?.message ||
      payload?.errors?.[0] ||
      payload?.detail ||
      payload?.raw ||
      fallback
    );
  }
}
