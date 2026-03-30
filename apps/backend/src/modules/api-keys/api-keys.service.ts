import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  ApiAutomationLogEntry,
  ApiConfigCreateRequest,
  ApiConfigRecord,
  ApiConfigSource,
  ApiConfigTestResponse,
  ApiConfigUpdateRequest,
  ApiErrorType,
  ApiHealthStatus,
  ApiKeysDashboardResponse,
  ApiMaintenanceRunResponse,
  ApiMaintenanceSnapshot,
  ApiMaintenanceTrigger,
  ApiProbeHealth,
  ApiProviderDescriptor,
  ApiProviderId,
  ApiProviderStatus,
  ApiRateLimitRisk,
  ApiRateLimitSnapshot,
  ApiReadinessReport,
  ApiReliabilityMemory,
  ApiSecretRevealResponse,
  ApiSelectionScore
} from "@mintbot/shared";
import { AppConfigService } from "../../config/app-config.service.js";
import { DatabaseService } from "../../database/database.service.js";

const MAINTENANCE_INTERVAL_MS = 90_000;
const LATENCY_HISTORY_LIMIT = 12;
const LOG_LIMIT = 40;
const OPENAI_TEST_URL = "https://api.openai.com/v1/models";

const PROVIDER_CATALOG = [
  {
    provider: "opensea",
    managedKey: "OPENSEA_API_KEY",
    label: "OpenSea",
    category: "marketplace",
    description: "Marketplace API coverage for collection intelligence, drop data, and automation checks.",
    defaultEndpointUrl: "https://api.opensea.io/api/v2/collections/cryptopunks",
    requiredForAutomation: true,
    defaultMaxLatencyMs: 2200
  },
  {
    provider: "etherscan",
    managedKey: "ETHERSCAN_API_KEY",
    label: "Etherscan",
    category: "explorer",
    description: "Explorer metadata, ABI lookup, and contract-state enrichment for automation safety checks.",
    defaultEndpointUrl: "https://api.etherscan.io/v2/api",
    requiredForAutomation: true,
    defaultMaxLatencyMs: 2600
  },
  {
    provider: "drpc",
    managedKey: "DRPC_API_KEY",
    label: "dRPC",
    category: "rpc-service",
    description: "External RPC-service access for authenticated blockchain queries outside the dedicated RPC manager.",
    defaultEndpointUrl: "https://lb.drpc.live/ethereum",
    requiredForAutomation: true,
    defaultMaxLatencyMs: 2000
  },
  {
    provider: "openai",
    managedKey: "OPENAI_API_KEY",
    label: "OpenAI",
    category: "ai",
    description: "AI-assisted automation and recovery workflows used for analysis and self-healing suggestions.",
    defaultEndpointUrl: OPENAI_TEST_URL,
    requiredForAutomation: false,
    defaultMaxLatencyMs: 3500
  }
] satisfies ApiProviderDescriptor[];

const PROVIDER_MAP = new Map(PROVIDER_CATALOG.map((definition) => [definition.provider, definition]));
const MANAGED_KEY_MAP = new Map(PROVIDER_CATALOG.map((definition) => [definition.managedKey, definition]));

interface RuntimeConfig {
  id: string;
  provider: ApiProviderDescriptor;
  label: string;
  endpointUrl: string;
  source: ApiConfigSource;
  enabled: boolean;
  priority: number;
  isBackup: boolean;
  autoFailover: boolean;
  automationEnabled: boolean;
  maxLatencyMs: number;
  notes: string;
  secret?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface MutableApiState {
  configRef: string;
  provider: ApiProviderId;
  status: ApiHealthStatus;
  active: boolean;
  failoverActive: boolean;
  reachable: boolean;
  authValid: boolean;
  lastLatencyMs: number | null;
  lastCheckedAt: string | null;
  lastSuccessfulAt: string | null;
  lastFailureAt: string | null;
  failureReason: string | null;
  errorType: ApiErrorType | null;
  rawErrorMessage: string | null;
  lastKnownStableAt: string | null;
  lastKnownStableState: ApiHealthStatus | null;
  observedSuccessCount: number;
  observedFailureCount: number;
  timeoutCount: number;
  authFailureCount: number;
  rateLimitCount: number;
  networkErrorCount: number;
  invalidResponseCount: number;
  serverErrorCount: number;
  unknownErrorCount: number;
  failoverCount: number;
  recoverySuccessCount: number;
  latencyHistoryMs: number[];
  rateLimitSnapshot: ApiRateLimitSnapshot;
  selectionScore: number;
  selectionReasons: string[];
}

interface ProbeOutcome {
  testedAt: string;
  reachable: boolean;
  authValid: boolean;
  latencyMs: number | null;
  failureReason: string | null;
  errorType: ApiErrorType | null;
  rawMessage: string | null;
  rateLimit: ApiRateLimitSnapshot;
}

interface MaintenanceExecutionResult {
  maintenance: ApiMaintenanceSnapshot;
  readiness: ApiReadinessReport;
  logs: ApiAutomationLogEntry[];
}

class ApiProbeFailure extends Error {
  constructor(
    public readonly errorType: ApiErrorType,
    message: string,
    public readonly rawMessage: string | null = null,
    public readonly rateLimit?: ApiRateLimitSnapshot,
    public readonly reachable = false,
    public readonly authValid = false
  ) {
    super(message);
  }
}

@Injectable()
export class ApiKeysService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApiKeysService.name);
  private maintenanceHandle?: ReturnType<typeof setInterval>;
  private maintenancePromise: Promise<MaintenanceExecutionResult> | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrapLegacyConfigs();
    void this.executeMaintenance("bootstrap").catch((error) => {
      this.logger.warn(`Initial API maintenance failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    });

    this.maintenanceHandle = setInterval(() => {
      void this.executeMaintenance("background").catch((error) => {
        this.logger.warn(`Background API maintenance failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      });
    }, MAINTENANCE_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.maintenanceHandle) {
      clearInterval(this.maintenanceHandle);
    }
  }

  async list(): Promise<ApiKeysDashboardResponse> {
    await this.bootstrapLegacyConfigs();
    const dashboard = await this.buildDashboard();

    if (this.shouldRunMaintenance(dashboard.maintenance)) {
      void this.executeMaintenance("background").catch((error) => {
        this.logger.warn(`Deferred API maintenance failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      });
    }

    return dashboard;
  }

  async create(request: ApiConfigCreateRequest): Promise<ApiConfigRecord> {
    const provider = this.getProviderDefinition(request.provider);
    const value = request.value?.trim();

    if (!value) {
      throw new BadRequestException(`A secret is required to add ${provider.label}.`);
    }

    const createdId = randomUUID();
    const label = request.label.trim() || `${provider.label} Primary`;
    const endpointUrl = this.normalizeEndpointUrl(request.endpointUrl, provider.defaultEndpointUrl);

    await this.database.upsertApiServiceConfig({
      id: createdId,
      provider: provider.provider,
      label,
      valueCiphertext: this.encrypt(value),
      endpointUrl,
      enabled: request.enabled ?? true,
      priority: this.normalizePriority(request.priority),
      isBackup: request.isBackup ?? false,
      autoFailover: request.autoFailover ?? true,
      automationEnabled: request.automationEnabled ?? true,
      maxLatencyMs: this.normalizeLatency(request.maxLatencyMs, provider.defaultMaxLatencyMs),
      notes: request.notes?.trim() ?? ""
    });

    await this.database.insertApiServiceLog({
      configRef: createdId,
      provider: provider.provider,
      apiName: label,
      eventType: "config-change",
      actionTaken: "Config added",
      result: "Stored",
      message: `${provider.label} configuration added to the automation pool.`,
      payload: { endpointUrl, priority: this.normalizePriority(request.priority), isBackup: request.isBackup ?? false }
    });

    await this.executeMaintenance("manual");
    return this.requireDashboardConfig(createdId);
  }

  async update(id: string, request: ApiConfigUpdateRequest): Promise<ApiConfigRecord> {
    const existing = await this.database.getApiServiceConfig(id);
    if (!existing) {
      throw new BadRequestException(`API config ${id} does not exist.`);
    }

    const provider = this.getProviderDefinition(existing.provider);
    const label = request.label?.trim() ? request.label.trim() : existing.label;
    const endpointUrl = this.normalizeEndpointUrl(request.endpointUrl, existing.endpointUrl);

    await this.database.upsertApiServiceConfig({
      id: existing.id,
      provider: existing.provider,
      label,
      valueCiphertext: request.value?.trim() ? this.encrypt(request.value.trim()) : existing.valueCiphertext,
      endpointUrl,
      enabled: request.enabled ?? existing.enabled,
      priority: this.normalizePriority(request.priority ?? existing.priority),
      isBackup: request.isBackup ?? existing.isBackup,
      autoFailover: request.autoFailover ?? existing.autoFailover,
      automationEnabled: request.automationEnabled ?? existing.automationEnabled,
      maxLatencyMs: this.normalizeLatency(request.maxLatencyMs ?? existing.maxLatencyMs, provider.defaultMaxLatencyMs),
      notes: request.notes?.trim() ?? existing.notes
    });

    await this.database.insertApiServiceLog({
      configRef: existing.id,
      provider: existing.provider,
      apiName: label,
      eventType: "config-change",
      actionTaken: "Config updated",
      result: "Stored",
      message: `${provider.label} configuration updated.`,
      payload: { endpointUrl, enabled: request.enabled ?? existing.enabled }
    });

    await this.executeMaintenance("manual");
    return this.requireDashboardConfig(id);
  }

  async remove(id: string): Promise<{ removed: boolean }> {
    const existing = await this.database.getApiServiceConfig(id);
    if (!existing) {
      return { removed: false };
    }

    const removed = await this.database.deleteApiServiceConfig(id);
    if (removed) {
      await this.database.deleteApiServiceState(id);
      await this.database.insertApiServiceLog({
        configRef: id,
        provider: existing.provider,
        apiName: existing.label,
        eventType: "config-change",
        actionTaken: "Config deleted",
        result: "Removed",
        message: `${existing.label} was removed from the automation pool.`
      });
      await this.executeMaintenance("manual");
    }

    return { removed };
  }

  async revealSecret(id: string): Promise<ApiSecretRevealResponse> {
    const config = await this.getRuntimeConfigById(id);
    const value = config.secret?.trim();

    if (!value) {
      throw new BadRequestException(`No secret is available for ${config.label}.`);
    }

    return { id: config.id, value, masked: this.maskSecret(value), source: config.source };
  }

  async testConfig(id: string): Promise<ApiConfigTestResponse> {
    const maintenance = await this.executeMaintenance("manual", id);
    const config = await this.requireDashboardConfig(id);
    const log =
      maintenance.logs.find((entry) => entry.configId === id && entry.eventType === "manual-test") ??
      maintenance.logs.find((entry) => entry.configId === id) ??
      this.fallbackLog(config);

    return {
      configId: id,
      testedAt: config.health.lastCheckedAt ?? new Date().toISOString(),
      status: config.status,
      log,
      health: config.health
    };
  }

  async runMaintenance(): Promise<ApiMaintenanceRunResponse> {
    const result = await this.executeMaintenance("manual");
    return { maintenance: result.maintenance, readiness: result.readiness };
  }

  private async requireDashboardConfig(id: string): Promise<ApiConfigRecord> {
    const dashboard = await this.buildDashboard();
    const config = dashboard.configs.find((entry) => entry.id === id);

    if (!config) {
      throw new BadRequestException(`API config ${id} does not exist.`);
    }

    return config;
  }

  private async buildDashboard(): Promise<ApiKeysDashboardResponse> {
    const runtimeConfigs = await this.buildRuntimeConfigs();
    const stateMap = new Map((await this.database.listApiServiceStates()).map((entry) => [entry.configRef, this.toMutableState(entry)]));
    const configs = this.buildConfigRecords(runtimeConfigs, stateMap);
    const providers = this.buildProviderStatuses(configs);
    const logs = (await this.database.listApiServiceLogs(LOG_LIMIT)).map((entry) => this.toAutomationLog(entry));
    const maintenance = this.toMaintenanceSnapshot(await this.database.getLatestApiMaintenanceRun());
    const readiness = this.buildReadinessReport(providers, configs);

    return {
      configs,
      providers,
      logs,
      readiness,
      maintenance,
      summary: {
        totalConfigs: configs.length,
        activeConfigs: configs.filter((entry) => entry.status === "active" || entry.status === "failover-active").length,
        backupConfigs: configs.filter((entry) => entry.status === "backup").length,
        invalidConfigs: configs.filter((entry) => entry.status === "invalid-key").length,
        rateLimitedConfigs: configs.filter((entry) => entry.status === "rate-limited").length,
        offlineConfigs: configs.filter((entry) => entry.status === "offline").length,
        failoverActiveProviders: providers.filter((entry) => entry.failoverActive).length,
        readyProviders: providers.filter((entry) => entry.readiness === "ready").length,
        warningProviders: providers.filter((entry) => entry.readiness === "warning").length,
        blockedProviders: providers.filter((entry) => entry.readiness === "blocked").length,
        lastRefreshedAt: new Date().toISOString()
      }
    };
  }

  private async executeMaintenance(trigger: ApiMaintenanceTrigger, targetConfigId?: string): Promise<MaintenanceExecutionResult> {
    if (!targetConfigId && this.maintenancePromise) {
      return this.maintenancePromise;
    }

    if (this.maintenancePromise) {
      await this.maintenancePromise;
    }

    const run = async (): Promise<MaintenanceExecutionResult> => {
      await this.bootstrapLegacyConfigs();

      const runId = randomUUID();
      const startedAt = new Date().toISOString();
      await this.database.upsertApiMaintenanceRun({
        id: runId,
        trigger,
        status: "running",
        summary: targetConfigId ? "Testing selected API config." : "Running automated API maintenance.",
        checkedConfigs: 0,
        healthyConfigs: 0,
        failoversActivated: 0,
        warnings: 0,
        startedAt,
        completedAt: null
      });

      const runtimeConfigs = await this.buildRuntimeConfigs();
      const stateMap = new Map((await this.database.listApiServiceStates()).map((entry) => [entry.configRef, this.toMutableState(entry)]));
      const previousActive = new Map<ApiProviderId, string | null>();
      const insertedLogs: ApiAutomationLogEntry[] = [];

      for (const definition of PROVIDER_CATALOG) {
        const activeConfig =
          runtimeConfigs
            .filter((entry) => entry.provider.provider === definition.provider)
            .find((entry) => (stateMap.get(entry.id) ?? this.defaultState(entry.id, entry.provider.provider)).active) ?? null;
        previousActive.set(definition.provider, activeConfig?.id ?? null);
      }

      const targets = targetConfigId ? runtimeConfigs.filter((entry) => entry.id === targetConfigId) : runtimeConfigs;
      if (targetConfigId && !targets.length) {
        throw new BadRequestException(`API config ${targetConfigId} does not exist.`);
      }

      let healthyConfigs = 0;

      for (const config of targets) {
        const previous = stateMap.get(config.id) ?? this.defaultState(config.id, config.provider.provider);
        const outcome = await this.probeConfig(config);
        const next = this.applyProbeOutcome(previous, config, outcome);
        stateMap.set(config.id, next);

        if (outcome.reachable && outcome.authValid) {
          healthyConfigs += 1;
        }

        const log = await this.logProbeIfNeeded(config, previous, next, trigger, outcome);
        if (log) {
          insertedLogs.push(log);
        }
      }

      const selection = await this.applySelection(runtimeConfigs, stateMap, previousActive);
      insertedLogs.push(...selection.logs);

      const configs = this.buildConfigRecords(runtimeConfigs, stateMap);
      const providers = this.buildProviderStatuses(configs);
      const readiness = this.buildReadinessReport(providers, configs);
      const maintenance = this.toMaintenanceSnapshot(
        await this.database.upsertApiMaintenanceRun({
          id: runId,
          trigger,
          status: "completed",
          summary: targetConfigId
            ? `Manual verification finished for ${configs.find((entry) => entry.id === targetConfigId)?.label ?? "selected config"}.`
            : "Background API maintenance completed.",
          checkedConfigs: targets.length,
          healthyConfigs,
          failoversActivated: selection.failoversActivated,
          warnings: readiness.warnings.length,
          startedAt,
          completedAt: new Date().toISOString()
        })
      );

      return { maintenance, readiness, logs: insertedLogs };
    };

    if (targetConfigId) {
      return run();
    }

    this.maintenancePromise = run().finally(() => {
      this.maintenancePromise = null;
    });

    return this.maintenancePromise;
  }

  private async bootstrapLegacyConfigs(): Promise<void> {
    const storedConfigs = await this.database.listApiServiceConfigs();
    const existingProviders = new Set(storedConfigs.map((entry) => entry.provider));
    const legacyRows = await this.database.listApiCredentials();

    for (const row of legacyRows) {
      const definition = MANAGED_KEY_MAP.get(row.key);
      if (!definition || !row.valueCiphertext || !row.enabled || existingProviders.has(definition.provider)) {
        continue;
      }

      await this.database.upsertApiServiceConfig({
        id: `legacy-${definition.provider}`,
        provider: definition.provider,
        label: `${definition.label} Primary`,
        valueCiphertext: row.valueCiphertext,
        endpointUrl: definition.defaultEndpointUrl,
        enabled: true,
        priority: 10,
        isBackup: false,
        autoFailover: true,
        automationEnabled: true,
        maxLatencyMs: definition.defaultMaxLatencyMs,
        notes: "Imported from the legacy API key store."
      });

      await this.database.deleteApiCredential(row.key);
    }
  }

  private async buildRuntimeConfigs(): Promise<RuntimeConfig[]> {
    const storedConfigs = await this.database.listApiServiceConfigs();
    const envValues = this.config.getManagedApiKeyValues();
    const configs: RuntimeConfig[] = storedConfigs.map((entry) => {
      const definition = this.getProviderDefinition(entry.provider);

      return {
        id: entry.id,
        provider: definition,
        label: entry.label,
        endpointUrl: entry.endpointUrl,
        source: "database",
        enabled: entry.enabled,
        priority: entry.priority,
        isBackup: entry.isBackup,
        autoFailover: entry.autoFailover,
        automationEnabled: entry.automationEnabled,
        maxLatencyMs: entry.maxLatencyMs,
        notes: entry.notes,
        secret: entry.valueCiphertext ? this.decrypt(entry.valueCiphertext) : undefined,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt
      };
    });

    for (const definition of PROVIDER_CATALOG) {
      const envValue = envValues[definition.managedKey]?.trim();
      if (!envValue) {
        continue;
      }

      const hasDatabaseConfig = configs.some((entry) => entry.provider.provider === definition.provider);
      configs.push({
        id: `env-${definition.provider}`,
        provider: definition,
        label: `${definition.label} Environment`,
        endpointUrl: definition.defaultEndpointUrl,
        source: "environment",
        enabled: true,
        priority: hasDatabaseConfig ? 90 : 10,
        isBackup: hasDatabaseConfig,
        autoFailover: true,
        automationEnabled: true,
        maxLatencyMs: definition.defaultMaxLatencyMs,
        notes: "Inherited from the process environment.",
        secret: envValue
      });
    }

    return configs.sort((left, right) => {
      if (left.provider.provider === right.provider.provider) {
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }

        if (left.source === right.source) {
          return left.label.localeCompare(right.label);
        }

        return left.source === "database" ? -1 : 1;
      }

      return left.provider.label.localeCompare(right.provider.label);
    });
  }

  private buildConfigRecords(configs: RuntimeConfig[], stateMap: Map<string, MutableApiState>): ApiConfigRecord[] {
    const ranks = new Map<string, number>();

    for (const definition of PROVIDER_CATALOG) {
      const providerConfigs = configs.filter((entry) => entry.provider.provider === definition.provider);
      providerConfigs
        .map((entry) => ({ id: entry.id, score: stateMap.get(entry.id)?.selectionScore ?? -1000, priority: entry.priority }))
        .sort((left, right) => (left.score === right.score ? left.priority - right.priority : right.score - left.score))
        .forEach((entry, index) => {
          ranks.set(entry.id, index + 1);
        });
    }

    return configs.map((config) => {
      const state = stateMap.get(config.id) ?? this.defaultState(config.id, config.provider.provider);
      return this.toConfigRecord(config, state, ranks.get(config.id) ?? 1);
    });
  }

  private buildProviderStatuses(configs: ApiConfigRecord[]): ApiProviderStatus[] {
    const providers: ApiProviderStatus[] = [];

    for (const definition of PROVIDER_CATALOG) {
      const providerConfigs = configs.filter((entry) => entry.provider === definition.provider);
      if (!providerConfigs.length) {
        continue;
      }

      const active = providerConfigs.find((entry) => entry.active) ?? null;
      const healthy = providerConfigs.filter((entry) => entry.health.reachable && entry.health.authValid);
      const warnings: string[] = [];
      const blockers: string[] = [];

      if (!active) {
        const message = `${definition.label} has no healthy active config.`;
        if (definition.requiredForAutomation) {
          blockers.push(message);
        } else {
          warnings.push(message);
        }
      } else {
        if (active.health.rateLimit.risk === "high") {
          warnings.push(`${active.label} is currently near or inside its rate-limit guardrail.`);
        }

        if ((active.health.latencyMs ?? 0) > active.maxLatencyMs) {
          warnings.push(`${active.label} latency is above the configured automation ceiling.`);
        }

        if (healthy.filter((entry) => entry.id !== active.id).length === 0) {
          warnings.push(`${definition.label} has no healthy backup config ready for failover.`);
        }
      }

      const readiness = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";
      const successRate =
        providerConfigs.length > 0
          ? Math.round(providerConfigs.reduce((sum, entry) => sum + entry.memory.recentSuccessRate, 0) / providerConfigs.length)
          : 0;
      const latencyValues = providerConfigs
        .map((entry) => entry.health.latencyMs)
        .filter((value): value is number => Number.isFinite(value));
      const averageLatencyMs =
        latencyValues.length > 0 ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length) : null;

      providers.push({
        provider: definition.provider,
        label: definition.label,
        category: definition.category,
        description: definition.description,
        requiredForAutomation: definition.requiredForAutomation,
        readiness,
        currentStatus: active?.status ?? "offline",
        activeConfigId: active?.id ?? null,
        activeLabel: active?.label ?? null,
        configCount: providerConfigs.length,
        backupCount: providerConfigs.filter((entry) => entry.isBackup).length,
        healthyCount: healthy.length,
        failoverActive: Boolean(active?.failoverActive),
        averageLatencyMs,
        successRate,
        score: active?.selection.value ?? 0,
        rateLimitRisk: active?.health.rateLimit.risk ?? "low"
      });
    }

    return providers;
  }

  private buildReadinessReport(providers: ApiProviderStatus[], configs: ApiConfigRecord[]): ApiReadinessReport {
    if (!configs.length) {
      return {
        checkedAt: new Date().toISOString(),
        state: "warning",
        summary: "No API configs added yet. Add your first external API config to start health checks and failover.",
        blockers: [],
        warnings: []
      };
    }

    const blockers: string[] = [];
    const warnings: string[] = [];

    for (const provider of providers) {
      const active = configs.find((entry) => entry.id === provider.activeConfigId);
      if (!active && provider.requiredForAutomation) {
        blockers.push(`${provider.label} is blocked because no healthy active config is available.`);
        continue;
      }

      if (provider.readiness === "warning") {
        warnings.push(`${provider.label} needs attention before high-pressure automation runs.`);
      }

      if (active && active.health.rateLimit.risk === "high" && provider.requiredForAutomation) {
        blockers.push(`${provider.label} is rate-limited and can block pre-mint automation.`);
      }
    }

    const state = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";
    const readyProviders = providers.filter((entry) => entry.readiness === "ready").length;

    return {
      checkedAt: new Date().toISOString(),
      state,
      summary:
        state === "ready"
          ? `${readyProviders} provider pools are ready for automation.`
          : state === "warning"
            ? `${warnings.length} readiness warning${warnings.length === 1 ? "" : "s"} detected.`
            : `${blockers.length} automation blocker${blockers.length === 1 ? "" : "s"} detected.`,
      blockers,
      warnings
    };
  }

  private async applySelection(
    runtimeConfigs: RuntimeConfig[],
    stateMap: Map<string, MutableApiState>,
    previousActive: Map<ApiProviderId, string | null>
  ): Promise<{ failoversActivated: number; logs: ApiAutomationLogEntry[] }> {
    const logs: ApiAutomationLogEntry[] = [];
    let failoversActivated = 0;

    for (const definition of PROVIDER_CATALOG) {
      const providerConfigs = runtimeConfigs.filter((entry) => entry.provider.provider === definition.provider);
      const scored = providerConfigs
        .map((entry) => {
          const state = stateMap.get(entry.id) ?? this.defaultState(entry.id, definition.provider);
          return { config: entry, state, score: this.calculateSelectionScore(entry, state) };
        })
        .sort((left, right) => (left.score.value === right.score.value ? left.config.priority - right.config.priority : right.score.value - left.score.value));
      const primary = providerConfigs
        .filter((entry) => entry.enabled && entry.secret && !entry.isBackup)
        .sort((left, right) => left.priority - right.priority)[0];
      const activeCandidate = scored.find((entry) => this.canServeTraffic(entry.config, entry.state))?.config ?? null;
      const previousActiveId = previousActive.get(definition.provider) ?? null;

      for (const scoredConfig of scored) {
        const state = stateMap.get(scoredConfig.config.id) ?? this.defaultState(scoredConfig.config.id, definition.provider);
        state.selectionScore = scoredConfig.score.value;
        state.selectionReasons = scoredConfig.score.reasons;
        state.active = activeCandidate?.id === scoredConfig.config.id;
        state.failoverActive = Boolean(activeCandidate && activeCandidate.id === scoredConfig.config.id && primary && primary.id !== activeCandidate.id);
        state.status = this.resolveStatus(scoredConfig.config, state, activeCandidate, primary);

        if (state.reachable && state.authValid && (state.status === "active" || state.status === "backup" || state.status === "failover-active")) {
          state.lastKnownStableAt = state.lastCheckedAt;
          state.lastKnownStableState = state.status;
        }

        stateMap.set(scoredConfig.config.id, state);
        await this.persistState(state);
      }

      if (previousActiveId && activeCandidate && previousActiveId !== activeCandidate.id) {
        const previousConfig = providerConfigs.find((entry) => entry.id === previousActiveId);
        const nextState = stateMap.get(activeCandidate.id) ?? this.defaultState(activeCandidate.id, definition.provider);

        if (primary && activeCandidate.id !== primary.id) {
          nextState.failoverCount += 1;
          stateMap.set(activeCandidate.id, nextState);
          await this.persistState(nextState);
          failoversActivated += 1;
          logs.push(
            await this.insertAutomationLog({
              configId: activeCandidate.id,
              provider: definition.provider,
              apiName: activeCandidate.label,
              eventType: "failover",
              errorType: nextState.errorType,
              action: "Switched provider to healthy backup",
              result: "Failover active",
              message: `${previousConfig?.label ?? definition.label} degraded, so automation switched to ${activeCandidate.label}.`
            })
          );
        } else {
          logs.push(
            await this.insertAutomationLog({
              configId: activeCandidate.id,
              provider: definition.provider,
              apiName: activeCandidate.label,
              eventType: "recovery",
              action: "Returned provider to preferred active config",
              result: "Primary restored",
              message: `${activeCandidate.label} recovered and is back in the active automation pool.`
            })
          );
        }
      }

      if (!previousActiveId && activeCandidate) {
        logs.push(
          await this.insertAutomationLog({
            configId: activeCandidate.id,
            provider: definition.provider,
            apiName: activeCandidate.label,
            eventType: "selection",
            action: "Activated best available config",
            result: "Automation ready",
            message: `${activeCandidate.label} is now active for ${definition.label}.`
          })
        );
      }
    }

    return { failoversActivated, logs };
  }

  private async persistState(state: MutableApiState): Promise<void> {
    await this.database.upsertApiServiceState({
      configRef: state.configRef,
      provider: state.provider,
      status: state.status,
      active: state.active,
      failoverActive: state.failoverActive,
      reachable: state.reachable,
      authValid: state.authValid,
      lastLatencyMs: state.lastLatencyMs,
      lastCheckedAt: state.lastCheckedAt,
      lastSuccessfulAt: state.lastSuccessfulAt,
      lastFailureAt: state.lastFailureAt,
      failureReason: state.failureReason,
      errorType: state.errorType,
      rawErrorMessage: state.rawErrorMessage,
      lastKnownStableAt: state.lastKnownStableAt,
      lastKnownStableState: state.lastKnownStableState,
      observedSuccessCount: state.observedSuccessCount,
      observedFailureCount: state.observedFailureCount,
      timeoutCount: state.timeoutCount,
      authFailureCount: state.authFailureCount,
      rateLimitCount: state.rateLimitCount,
      networkErrorCount: state.networkErrorCount,
      invalidResponseCount: state.invalidResponseCount,
      serverErrorCount: state.serverErrorCount,
      unknownErrorCount: state.unknownErrorCount,
      failoverCount: state.failoverCount,
      recoverySuccessCount: state.recoverySuccessCount,
      latencyHistoryMs: state.latencyHistoryMs,
      rateLimitSnapshot: state.rateLimitSnapshot as unknown as Record<string, unknown>,
      selectionScore: state.selectionScore,
      selectionReasons: state.selectionReasons
    });
  }

  private async logProbeIfNeeded(
    config: RuntimeConfig,
    previous: MutableApiState,
    next: MutableApiState,
    trigger: ApiMaintenanceTrigger,
    outcome: ProbeOutcome
  ): Promise<ApiAutomationLogEntry | null> {
    const becameHealthy = !previous.reachable && next.reachable && next.authValid;
    const becameUnhealthy = previous.errorType !== next.errorType || previous.failureReason !== next.failureReason;

    if (trigger !== "manual" && !becameHealthy && !becameUnhealthy) {
      return null;
    }

    return this.insertAutomationLog({
      configId: config.id,
      provider: config.provider.provider,
      apiName: config.label,
      eventType: trigger === "manual" ? "manual-test" : becameHealthy ? "recovery" : "health-check",
      errorType: next.errorType,
      action: trigger === "manual" ? "Executed connection test" : becameHealthy ? "Returned config to healthy pool" : "Updated health memory",
      result: next.reachable && next.authValid ? "Healthy" : "Attention required",
      message:
        next.reachable && next.authValid
          ? `${config.label} responded in ${outcome.latencyMs ?? 0}ms and passed auth validation.`
          : `${config.label} failed with ${next.errorType ?? "unknown-error"}: ${next.failureReason ?? "Unknown failure."}`
    });
  }

  private async insertAutomationLog(entry: {
    configId?: string | null;
    provider: ApiProviderId;
    apiName: string;
    eventType: string;
    errorType?: ApiErrorType | null;
    action: string;
    result: string;
    message: string;
  }): Promise<ApiAutomationLogEntry> {
    const stored = await this.database.insertApiServiceLog({
      configRef: entry.configId ?? null,
      provider: entry.provider,
      apiName: entry.apiName,
      eventType: entry.eventType,
      errorType: entry.errorType ?? null,
      actionTaken: entry.action,
      result: entry.result,
      message: entry.message
    });

    return this.toAutomationLog(stored);
  }

  private applyProbeOutcome(previous: MutableApiState, config: RuntimeConfig, outcome: ProbeOutcome): MutableApiState {
    const next: MutableApiState = {
      ...previous,
      reachable: outcome.reachable,
      authValid: outcome.authValid,
      lastLatencyMs: outcome.latencyMs,
      lastCheckedAt: outcome.testedAt,
      failureReason: outcome.failureReason,
      errorType: outcome.errorType,
      rawErrorMessage: outcome.rawMessage,
      rateLimitSnapshot: outcome.rateLimit
    };

    if (outcome.latencyMs !== null) {
      next.latencyHistoryMs = [...previous.latencyHistoryMs, outcome.latencyMs].slice(-LATENCY_HISTORY_LIMIT);
    }

    if (outcome.reachable && outcome.authValid) {
      next.lastSuccessfulAt = outcome.testedAt;
      next.observedSuccessCount += 1;
      if (previous.errorType || previous.status === "offline" || previous.status === "rate-limited") {
        next.recoverySuccessCount += 1;
      }
    } else {
      next.lastFailureAt = outcome.testedAt;
      next.observedFailureCount += 1;

      switch (outcome.errorType) {
        case "timeout":
          next.timeoutCount += 1;
          break;
        case "auth-error":
          next.authFailureCount += 1;
          break;
        case "rate-limited":
          next.rateLimitCount += 1;
          break;
        case "network-error":
          next.networkErrorCount += 1;
          break;
        case "invalid-response":
          next.invalidResponseCount += 1;
          break;
        case "server-error":
          next.serverErrorCount += 1;
          break;
        case "unknown-error":
          next.unknownErrorCount += 1;
          break;
        default:
          break;
      }
    }

    next.status = this.resolveHealthStatus(config, next);
    return next;
  }

  private calculateSelectionScore(config: RuntimeConfig, state: MutableApiState): ApiSelectionScore {
    const reasons: string[] = [];

    if (!config.enabled) {
      return { value: -1000, rank: 99, reasons: ["Disabled config"] };
    }

    if (!config.secret) {
      return { value: -950, rank: 99, reasons: ["No secret configured"] };
    }

    let value = config.isBackup ? 60 : 72;
    reasons.push(config.isBackup ? "Backup-ready" : "Primary-preferred");

    if (state.reachable && state.authValid) {
      value += 36;
      reasons.push("Healthy auth");
    }

    if (state.lastLatencyMs !== null) {
      value += Math.max(0, 24 - state.lastLatencyMs / 120);
      reasons.push(`${state.lastLatencyMs}ms latency`);
    }

    const totalAttempts = state.observedSuccessCount + state.observedFailureCount;
    const successRate = totalAttempts > 0 ? (state.observedSuccessCount / totalAttempts) * 100 : 0;
    value += successRate * 0.22;
    value -= state.observedFailureCount * 1.8;
    value -= config.priority * 1.4;
    value -= state.failoverCount * 1.5;
    value += state.recoverySuccessCount * 1.4;

    if (state.errorType === "auth-error") {
      value -= 140;
      reasons.push("Auth invalid");
    } else if (state.errorType === "rate-limited") {
      value -= 90;
      reasons.push("Rate-limit pressure");
    } else if (state.errorType) {
      value -= 55;
      reasons.push("Recent failure");
    }

    if (state.rateLimitSnapshot.risk === "medium") {
      value -= 18;
      reasons.push("Near limit");
    }

    if (state.rateLimitSnapshot.risk === "high") {
      value -= 42;
      reasons.push("Limit guardrail hit");
    }

    return { value: Math.round(value), rank: 0, reasons: reasons.slice(0, 3) };
  }

  private canServeTraffic(config: RuntimeConfig, state: MutableApiState): boolean {
    return Boolean(config.enabled && config.secret && state.reachable && state.authValid);
  }

  private resolveStatus(
    config: RuntimeConfig,
    state: MutableApiState,
    activeCandidate: RuntimeConfig | null,
    primary: RuntimeConfig | undefined
  ): ApiHealthStatus {
    if (activeCandidate?.id === config.id) {
      return primary && primary.id !== config.id ? "failover-active" : "active";
    }

    return this.resolveHealthStatus(config, state);
  }

  private resolveHealthStatus(config: RuntimeConfig, state: MutableApiState): ApiHealthStatus {
    if (!config.enabled || !config.secret) {
      return "offline";
    }

    if (state.errorType === "auth-error") {
      return "invalid-key";
    }

    if (state.errorType === "rate-limited" || state.rateLimitSnapshot.risk === "high") {
      return "rate-limited";
    }

    if (state.reachable && state.authValid) {
      return "backup";
    }

    return "offline";
  }

  private async getRuntimeConfigById(id: string): Promise<RuntimeConfig> {
    const configs = await this.buildRuntimeConfigs();
    const config = configs.find((entry) => entry.id === id);

    if (!config) {
      throw new BadRequestException(`API config ${id} does not exist.`);
    }

    return config;
  }

  private async probeConfig(config: RuntimeConfig): Promise<ProbeOutcome> {
    const testedAt = new Date().toISOString();

    if (!config.enabled) {
      return {
        testedAt,
        reachable: false,
        authValid: false,
        latencyMs: null,
        failureReason: "Config is disabled.",
        errorType: "unknown-error",
        rawMessage: "Config is disabled.",
        rateLimit: this.emptyRateLimit()
      };
    }

    if (!config.secret) {
      return {
        testedAt,
        reachable: false,
        authValid: false,
        latencyMs: null,
        failureReason: "No secret configured.",
        errorType: "unknown-error",
        rawMessage: "No secret configured.",
        rateLimit: this.emptyRateLimit()
      };
    }

    try {
      switch (config.provider.provider) {
        case "opensea":
          return await this.verifyOpenSea(config.secret, config.endpointUrl, testedAt);
        case "etherscan":
          return await this.verifyEtherscan(config.secret, config.endpointUrl, testedAt);
        case "drpc":
          return await this.verifyDrpc(config.secret, config.endpointUrl, testedAt);
        case "openai":
          return await this.verifyOpenAi(config.secret, config.endpointUrl, testedAt);
        default:
          throw new ApiProbeFailure("unknown-error", "Unsupported provider.");
      }
    } catch (error) {
      if (error instanceof ApiProbeFailure) {
        return {
          testedAt,
          reachable: error.reachable,
          authValid: error.authValid,
          latencyMs: null,
          failureReason: error.message,
          errorType: error.errorType,
          rawMessage: error.rawMessage,
          rateLimit: error.rateLimit ?? this.emptyRateLimit()
        };
      }

      return {
        testedAt,
        reachable: false,
        authValid: false,
        latencyMs: null,
        failureReason: error instanceof Error ? error.message : "Unknown probe failure.",
        errorType: "unknown-error",
        rawMessage: error instanceof Error ? error.message : "Unknown probe failure.",
        rateLimit: this.emptyRateLimit()
      };
    }
  }

  private async verifyOpenSea(secret: string, endpointUrl: string, testedAt: string): Promise<ProbeOutcome> {
    this.assertRawToken(secret, {
      label: "OpenSea",
      blockedPatterns: [/^https?:\/\//i, /x-api-key/i, /^curl\b/i],
      invalidInputMessage: "Paste the raw OpenSea API key only."
    });

    const { response, payload, latencyMs, rateLimit } = await this.requestJson(endpointUrl, {
      method: "GET",
      headers: { "x-api-key": secret }
    });

    if (!response.ok) {
      throw this.createResponseFailure(response, payload, rateLimit, `OpenSea request failed with status ${response.status}.`);
    }

    return { testedAt, reachable: true, authValid: true, latencyMs, failureReason: null, errorType: null, rawMessage: null, rateLimit };
  }

  private async verifyEtherscan(secret: string, endpointUrl: string, testedAt: string): Promise<ProbeOutcome> {
    this.assertRawToken(secret, {
      label: "Etherscan",
      blockedPatterns: [/^https?:\/\//i, /etherscan/i, /apikey=/i],
      invalidInputMessage: "Paste the raw Etherscan API key only."
    });

    const url = new URL(endpointUrl);
    url.search = new URLSearchParams({
      chainid: "1",
      module: "stats",
      action: "ethprice",
      apikey: secret
    }).toString();

    const { response, payload, latencyMs, rateLimit } = await this.requestJson(url.toString());
    if (!response.ok) {
      throw this.createResponseFailure(response, payload, rateLimit, `Etherscan request failed with status ${response.status}.`);
    }

    if (String(payload?.status ?? "") !== "1") {
      throw new ApiProbeFailure("auth-error", this.pickApiError(payload, "Etherscan rejected the API key."), null, rateLimit, true, false);
    }

    return { testedAt, reachable: true, authValid: true, latencyMs, failureReason: null, errorType: null, rawMessage: null, rateLimit };
  }

  private async verifyDrpc(secret: string, endpointUrl: string, testedAt: string): Promise<ProbeOutcome> {
    this.assertRawToken(secret, {
      label: "dRPC",
      blockedPatterns: [/^https?:\/\//i, /drpc/i, /^curl\b/i],
      invalidInputMessage: "Paste the raw dRPC API key only."
    });

    const base = endpointUrl.replace(/\/+$/, "");
    const { response, payload, latencyMs, rateLimit } = await this.requestJson(`${base}/${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_blockNumber", params: [] })
    });

    if (!response.ok) {
      throw this.createResponseFailure(response, payload, rateLimit, `dRPC request failed with status ${response.status}.`);
    }

    if (payload?.jsonrpc !== "2.0" || payload?.error || !payload?.result) {
      throw new ApiProbeFailure("invalid-response", this.pickApiError(payload, "dRPC rejected the API request."), null, rateLimit, true, true);
    }

    return { testedAt, reachable: true, authValid: true, latencyMs, failureReason: null, errorType: null, rawMessage: null, rateLimit };
  }

  private async verifyOpenAi(secret: string, endpointUrl: string, testedAt: string): Promise<ProbeOutcome> {
    this.assertRawToken(secret, {
      label: "OpenAI",
      blockedPatterns: [/^https?:\/\//i, /authorization:/i, /^curl\b/i],
      invalidInputMessage: "Paste the raw OpenAI API key only."
    });

    const { response, payload, latencyMs, rateLimit } = await this.requestJson(endpointUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` }
    });

    if (!response.ok) {
      throw this.createResponseFailure(response, payload, rateLimit, `OpenAI request failed with status ${response.status}.`);
    }

    return { testedAt, reachable: true, authValid: true, latencyMs, failureReason: null, errorType: null, rawMessage: null, rateLimit };
  }

  private createResponseFailure(response: Response, payload: any, rateLimit: ApiRateLimitSnapshot, fallback: string): ApiProbeFailure {
    const message = this.pickApiError(payload, fallback);

    if (response.status === 401 || response.status === 403) {
      return new ApiProbeFailure("auth-error", message, message, rateLimit, true, false);
    }

    if (response.status === 429) {
      return new ApiProbeFailure("rate-limited", message, message, { ...rateLimit, risk: "high" }, true, true);
    }

    if (response.status >= 500) {
      return new ApiProbeFailure("server-error", message, message, rateLimit, true, true);
    }

    return new ApiProbeFailure("invalid-response", message, message, rateLimit, true, true);
  }

  private async requestJson(
    url: string,
    init: RequestInit = {}
  ): Promise<{ response: Response; payload: any; latencyMs: number; rateLimit: ApiRateLimitSnapshot }> {
    const started = Date.now();

    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
        headers: {
          Accept: "application/json",
          ...(init.headers ?? {})
        }
      });
      const latencyMs = Date.now() - started;
      const raw = await response.text();
      let payload: any = {};

      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = { raw };
        }
      }

      return { response, payload, latencyMs, rateLimit: this.parseRateLimit(response.headers) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network request failed.";
      if (message.toLowerCase().includes("timeout")) {
        throw new ApiProbeFailure("timeout", "Request timed out.", message, this.emptyRateLimit());
      }

      throw new ApiProbeFailure("network-error", "Unable to reach the endpoint.", message, this.emptyRateLimit());
    }
  }

  private parseRateLimit(headers: Headers): ApiRateLimitSnapshot {
    const limit = this.parseIntegerHeader(headers, ["x-ratelimit-limit", "ratelimit-limit", "x-rate-limit-limit"]);
    const remaining = this.parseIntegerHeader(headers, ["x-ratelimit-remaining", "ratelimit-remaining", "x-rate-limit-remaining"]);
    const resetRaw = headers.get("x-ratelimit-reset") ?? headers.get("ratelimit-reset") ?? headers.get("x-rate-limit-reset");
    let resetAt: string | null = null;

    if (resetRaw) {
      const numeric = Number(resetRaw);
      if (Number.isFinite(numeric)) {
        resetAt = numeric > 1_000_000_000_000 ? new Date(numeric).toISOString() : new Date(Date.now() + numeric * 1000).toISOString();
      } else {
        resetAt = resetRaw;
      }
    }

    const available = limit !== null || remaining !== null || resetAt !== null;
    const used = limit !== null && remaining !== null ? Math.max(limit - remaining, 0) : null;

    return {
      available,
      limit,
      remaining,
      used,
      resetAt,
      windowLabel: resetAt ? "Reset tracked" : null,
      risk: this.resolveRateLimitRisk(limit, remaining)
    };
  }

  private resolveRateLimitRisk(limit: number | null, remaining: number | null): ApiRateLimitRisk {
    if (limit === null || remaining === null || limit <= 0) {
      return "low";
    }

    const ratio = remaining / limit;
    if (ratio <= 0.1) {
      return "high";
    }

    if (ratio <= 0.25) {
      return "medium";
    }

    return "low";
  }

  private parseIntegerHeader(headers: Headers, names: string[]): number | null {
    for (const name of names) {
      const raw = headers.get(name);
      if (!raw) {
        continue;
      }

      const numeric = Number(raw);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }

    return null;
  }

  private emptyRateLimit(): ApiRateLimitSnapshot {
    return { available: false, limit: null, remaining: null, used: null, resetAt: null, windowLabel: null, risk: "low" };
  }

  private toRateLimitSnapshot(value: unknown): ApiRateLimitSnapshot {
    if (!value || typeof value !== "object") {
      return this.emptyRateLimit();
    }

    const snapshot = value as Partial<ApiRateLimitSnapshot>;
    return {
      available: Boolean(snapshot.available),
      limit: snapshot.limit ?? null,
      remaining: snapshot.remaining ?? null,
      used: snapshot.used ?? null,
      resetAt: snapshot.resetAt ?? null,
      windowLabel: snapshot.windowLabel ?? null,
      risk: snapshot.risk ?? "low"
    };
  }

  private toConfigRecord(config: RuntimeConfig, state: MutableApiState, rank: number): ApiConfigRecord {
    const health: ApiProbeHealth = {
      reachable: state.reachable,
      authValid: state.authValid,
      latencyMs: state.lastLatencyMs,
      lastCheckedAt: state.lastCheckedAt,
      lastSuccessfulAt: state.lastSuccessfulAt,
      lastFailureAt: state.lastFailureAt,
      failureReason: state.failureReason,
      errorType: state.errorType,
      rawMessage: state.rawErrorMessage,
      rateLimit: state.rateLimitSnapshot
    };
    const memory = this.buildReliabilityMemory(state);
    const selection: ApiSelectionScore = { value: state.selectionScore, rank, reasons: state.selectionReasons };

    return {
      ...config.provider,
      id: config.id,
      label: config.label,
      endpointUrl: config.endpointUrl,
      source: config.source,
      enabled: config.enabled,
      priority: config.priority,
      isBackup: config.isBackup,
      autoFailover: config.autoFailover,
      automationEnabled: config.automationEnabled,
      maxLatencyMs: config.maxLatencyMs,
      notes: config.notes,
      secretMask: config.secret ? this.maskSecret(config.secret) : "Not configured",
      secretAvailable: Boolean(config.secret),
      revealSupported: Boolean(config.secret),
      copySupported: Boolean(config.secret),
      active: state.active,
      failoverActive: state.failoverActive,
      status: state.status,
      health,
      memory,
      selection,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    };
  }

  private buildReliabilityMemory(state: MutableApiState): ApiReliabilityMemory {
    const totalAttempts = state.observedSuccessCount + state.observedFailureCount;
    const averageLatencyMs =
      state.latencyHistoryMs.length > 0
        ? Math.round(state.latencyHistoryMs.reduce((sum, value) => sum + value, 0) / state.latencyHistoryMs.length)
        : null;

    return {
      recentSuccessRate: totalAttempts > 0 ? Math.round((state.observedSuccessCount / totalAttempts) * 100) : 0,
      recentFailureCount: state.observedFailureCount,
      averageLatencyMs,
      latencyHistoryMs: state.latencyHistoryMs,
      failureCount: state.observedFailureCount,
      timeoutCount: state.timeoutCount,
      authFailureCount: state.authFailureCount,
      rateLimitCount: state.rateLimitCount,
      networkErrorCount: state.networkErrorCount,
      invalidResponseCount: state.invalidResponseCount,
      serverErrorCount: state.serverErrorCount,
      unknownErrorCount: state.unknownErrorCount,
      failoverFrequency: state.failoverCount,
      recoverySuccessHistory: state.recoverySuccessCount,
      lastKnownStableAt: state.lastKnownStableAt,
      lastKnownStableState: state.lastKnownStableState
    };
  }

  private defaultState(configRef: string, provider: ApiProviderId): MutableApiState {
    return {
      configRef,
      provider,
      status: "offline",
      active: false,
      failoverActive: false,
      reachable: false,
      authValid: false,
      lastLatencyMs: null,
      lastCheckedAt: null,
      lastSuccessfulAt: null,
      lastFailureAt: null,
      failureReason: null,
      errorType: null,
      rawErrorMessage: null,
      lastKnownStableAt: null,
      lastKnownStableState: null,
      observedSuccessCount: 0,
      observedFailureCount: 0,
      timeoutCount: 0,
      authFailureCount: 0,
      rateLimitCount: 0,
      networkErrorCount: 0,
      invalidResponseCount: 0,
      serverErrorCount: 0,
      unknownErrorCount: 0,
      failoverCount: 0,
      recoverySuccessCount: 0,
      latencyHistoryMs: [],
      rateLimitSnapshot: this.emptyRateLimit(),
      selectionScore: 0,
      selectionReasons: ["No benchmark yet"]
    };
  }

  private toMutableState(entry: Omit<MutableApiState, "rateLimitSnapshot"> & { rateLimitSnapshot: unknown }): MutableApiState {
    return {
      ...entry,
      latencyHistoryMs: entry.latencyHistoryMs ?? [],
      rateLimitSnapshot: this.toRateLimitSnapshot(entry.rateLimitSnapshot),
      selectionReasons: entry.selectionReasons ?? []
    };
  }

  private toAutomationLog(entry: {
    id: string;
    configRef: string | null;
    provider: ApiProviderId;
    apiName: string;
    eventType: string;
    errorType: ApiErrorType | null;
    actionTaken: string;
    result: string;
    message: string;
    createdAt: string;
  }): ApiAutomationLogEntry {
    return {
      id: entry.id,
      timestamp: entry.createdAt,
      configId: entry.configRef,
      provider: entry.provider,
      apiName: entry.apiName,
      eventType: entry.eventType,
      errorType: entry.errorType,
      action: entry.actionTaken,
      result: entry.result,
      message: entry.message
    };
  }

  private toMaintenanceSnapshot(entry: ApiMaintenanceSnapshot | null): ApiMaintenanceSnapshot {
    if (entry) {
      return entry;
    }

    return {
      id: "maintenance-idle",
      trigger: "bootstrap",
      status: "idle",
      summary: "No maintenance run has completed yet.",
      startedAt: new Date(0).toISOString(),
      completedAt: null,
      checkedConfigs: 0,
      healthyConfigs: 0,
      failoversActivated: 0,
      warnings: 0
    };
  }

  private shouldRunMaintenance(maintenance: ApiMaintenanceSnapshot): boolean {
    if (maintenance.status === "running") {
      return false;
    }

    const completedAt = maintenance.completedAt ? new Date(maintenance.completedAt).getTime() : 0;
    return Date.now() - completedAt > MAINTENANCE_INTERVAL_MS;
  }

  private normalizeEndpointUrl(value: string | undefined, fallback: string): string {
    return value?.trim() ? value.trim() : fallback;
  }

  private normalizePriority(value: number | undefined): number {
    const priority = Number(value ?? 10);
    return Number.isFinite(priority) ? Math.max(1, Math.min(999, Math.round(priority))) : 10;
  }

  private normalizeLatency(value: number | undefined, fallback: number): number {
    const latency = Number(value ?? fallback);
    return Number.isFinite(latency) ? Math.max(500, Math.min(30_000, Math.round(latency))) : fallback;
  }

  private getProviderDefinition(provider: ApiProviderId): ApiProviderDescriptor {
    const definition = PROVIDER_MAP.get(provider);
    if (!definition) {
      throw new BadRequestException(`Unsupported provider ${provider}.`);
    }

    return definition;
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

  private assertRawToken(
    value: string,
    options: {
      label: string;
      blockedPatterns: RegExp[];
      invalidInputMessage: string;
    }
  ): void {
    if (!value.trim()) {
      throw new BadRequestException(`${options.label} key is empty.`);
    }

    if (options.blockedPatterns.some((pattern) => pattern.test(value))) {
      throw new BadRequestException(options.invalidInputMessage);
    }

    if (/\s/.test(value)) {
      throw new BadRequestException(`${options.label} key must be a single token with no spaces.`);
    }
  }

  private maskSecret(value: string): string {
    if (value.length <= 8) {
      return `${value.slice(0, 2)}${"*".repeat(Math.max(4, value.length - 2))}`;
    }

    return `${value.slice(0, 8)}${"*".repeat(Math.max(6, value.length - 12))}${value.slice(-4)}`;
  }

  private fallbackLog(config: ApiConfigRecord): ApiAutomationLogEntry {
    return {
      id: `fallback-${config.id}`,
      timestamp: config.health.lastCheckedAt ?? new Date().toISOString(),
      configId: config.id,
      provider: config.provider,
      apiName: config.label,
      eventType: "manual-test",
      errorType: config.health.errorType ?? null,
      action: "Used latest stored health result",
      result: config.status,
      message: config.health.failureReason ?? `${config.label} last responded at ${config.health.lastCheckedAt ?? "an unknown time"}.`
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
