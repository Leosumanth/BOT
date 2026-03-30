import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool } from "pg";
import type { QueryResultRow } from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type {
  ApiErrorType,
  ApiHealthStatus,
  ApiMaintenanceStatus,
  ApiMaintenanceTrigger,
  ApiProviderId,
  ContractAnalysisResult,
  ManagedApiKey,
  MintExecutionAttempt,
  MintJobInput,
  MintJobResult,
  RpcEndpointConfig,
  RpcEndpointRecord,
  TaskRecord,
  WalletRecord,
  WalletUpdateRequest
} from "@mintbot/shared";
import { AppConfigService } from "../config/app-config.service.js";
import { stringifyJson } from "../utils/json.js";
import type { StoredWalletRecord } from "../modules/wallets/wallet.types.js";

interface StoredApiCredentialRecord {
  key: ManagedApiKey;
  valueCiphertext: string | null;
  valueHint: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredApiServiceConfigRecord {
  id: string;
  provider: ApiProviderId;
  label: string;
  valueCiphertext: string | null;
  endpointUrl: string;
  enabled: boolean;
  priority: number;
  isBackup: boolean;
  autoFailover: boolean;
  automationEnabled: boolean;
  maxLatencyMs: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredApiServiceStateRecord {
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
  rateLimitSnapshot: Record<string, unknown>;
  selectionScore: number;
  selectionReasons: string[];
  updatedAt: string;
}

interface StoredApiServiceLogRecord {
  id: string;
  configRef: string | null;
  provider: ApiProviderId;
  apiName: string;
  eventType: string;
  errorType: ApiErrorType | null;
  actionTaken: string;
  result: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface StoredApiMaintenanceRunRecord {
  id: string;
  trigger: ApiMaintenanceTrigger;
  status: ApiMaintenanceStatus;
  summary: string;
  checkedConfigs: number;
  healthyConfigs: number;
  failoversActivated: number;
  warnings: number;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(private readonly config: AppConfigService) {
    this.pool = new Pool({
      connectionString: this.config.databaseUrl
    });
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query("select 1");
    await this.ensureSchema();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  async ensureSchema(): Promise<void> {
    const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
    await this.pool.query(schema);
    this.logger.log("Database schema ensured.");
  }

  async insertWallet(wallet: StoredWalletRecord): Promise<WalletRecord> {
    const [row] = await this.query<WalletRecord>(
      `
      insert into wallets (
        id,
        label,
        address,
        address_short,
        secret_ciphertext,
        encrypted_private_key,
        wallet_group,
        status,
        source,
        chain,
        enabled,
        tags,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $5, 'Imported', 'ready', 'stored', $6, $7, $8::jsonb, $9, $10)
      returning
        id,
        label,
        address,
        coalesce(chain, 'ethereum') as chain,
        coalesce(enabled, true) as enabled,
        coalesce(tags, '[]'::jsonb) as tags,
        created_at as "createdAt",
        updated_at as "updatedAt"
      `,
      [
        wallet.id,
        wallet.label,
        wallet.address,
        `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`,
        wallet.encryptedPrivateKey,
        wallet.chain,
        wallet.enabled,
        JSON.stringify(wallet.tags ?? []),
        wallet.createdAt,
        wallet.updatedAt
      ]
    );

    return row;
  }

  async listWallets(): Promise<WalletRecord[]> {
    return this.query<WalletRecord>(
      `
      select
        id,
        label,
        address,
        coalesce(chain, 'ethereum') as chain,
        coalesce(enabled, true) as enabled,
        coalesce(tags, '[]'::jsonb) as tags,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from wallets
      order by created_at desc
      `
    );
  }

  async listStoredWallets(): Promise<StoredWalletRecord[]> {
    return this.query<StoredWalletRecord>(
      `
      select
        id,
        label,
        address,
        coalesce(encrypted_private_key, secret_ciphertext) as "encryptedPrivateKey",
        coalesce(chain, 'ethereum') as chain,
        coalesce(enabled, true) as enabled,
        coalesce(tags, '[]'::jsonb) as tags,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from wallets
      order by created_at desc
      `
    );
  }

  async updateWallet(walletId: string, request: WalletUpdateRequest): Promise<WalletRecord | null> {
    const [row] = await this.query<WalletRecord>(
      `
      update wallets
      set
        label = coalesce($2, label),
        tags = coalesce($3::jsonb, tags),
        enabled = coalesce($4, enabled),
        updated_at = now()
      where id = $1
      returning
        id,
        label,
        address,
        coalesce(chain, 'ethereum') as chain,
        coalesce(enabled, true) as enabled,
        coalesce(tags, '[]'::jsonb) as tags,
        created_at as "createdAt",
        updated_at as "updatedAt"
      `,
      [walletId, request.label ?? null, request.tags ? JSON.stringify(request.tags) : null, request.enabled ?? null]
    );

    return row ?? null;
  }

  async deleteWallet(walletId: string): Promise<boolean> {
    const rows = await this.query<{ id: string }>(
      `
      delete from wallets
      where id = $1
      returning id
      `,
      [walletId]
    );

    return rows.length > 0;
  }

  async upsertContractAnalysis(analysis: ContractAnalysisResult): Promise<void> {
    await this.pool.query(
      `
      insert into contracts (address, chain, mint_function, price_wei, max_supply, max_per_wallet, abi_fragments, warnings, scanned_at)
      values ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
      on conflict (address, chain)
      do update set
        mint_function = excluded.mint_function,
        price_wei = excluded.price_wei,
        max_supply = excluded.max_supply,
        max_per_wallet = excluded.max_per_wallet,
        abi_fragments = excluded.abi_fragments,
        warnings = excluded.warnings,
        scanned_at = excluded.scanned_at
      `,
      [
        analysis.contractAddress,
        analysis.chain,
        JSON.stringify(analysis.detectedMintFunction),
        analysis.priceWei?.toString() ?? null,
        analysis.maxSupply?.toString() ?? null,
        analysis.maxPerWallet?.toString() ?? null,
        JSON.stringify(analysis.abiFragments),
        JSON.stringify(analysis.warnings),
        analysis.scannedAt
      ]
    );
  }

  async listContracts(): Promise<ContractAnalysisResult[]> {
    const rows = await this.query<any>(
      `
      select
        address,
        chain,
        mint_function as "detectedMintFunction",
        price_wei as "priceWei",
        max_supply as "maxSupply",
        max_per_wallet as "maxPerWallet",
        abi_fragments as "abiFragments",
        warnings,
        scanned_at as "scannedAt"
      from contracts
      order by scanned_at desc
      limit 50
      `
    );

    return rows.map((row) => ({
      contractAddress: row.address,
      chain: row.chain,
      detectedMintFunction: row.detectedMintFunction,
      priceWei: row.priceWei ? BigInt(row.priceWei) : null,
      maxSupply: row.maxSupply ? BigInt(row.maxSupply) : null,
      maxPerWallet: row.maxPerWallet ? BigInt(row.maxPerWallet) : null,
      abiFragments: row.abiFragments ?? [],
      warnings: row.warnings ?? [],
      scannedAt: row.scannedAt
    }));
  }

  async upsertRpcEndpoint(endpoint: RpcEndpointConfig): Promise<RpcEndpointRecord> {
    const [row] = await this.query<RpcEndpointRecord>(
      `
      insert into rpc_endpoints (key, label, chain, transport, provider, url, priority, enabled, created_at, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
      on conflict (key)
      do update set
        label = excluded.label,
        chain = excluded.chain,
        transport = excluded.transport,
        provider = excluded.provider,
        url = excluded.url,
        priority = excluded.priority,
        enabled = excluded.enabled,
        updated_at = now()
      returning
        key,
        label,
        chain,
        transport,
        provider,
        url,
        priority,
        enabled,
        'database' as source,
        created_at as "createdAt",
        updated_at as "updatedAt"
      `,
      [endpoint.key, endpoint.label, endpoint.chain, endpoint.transport, endpoint.provider, endpoint.url, endpoint.priority, endpoint.enabled]
    );

    return row;
  }

  async listRpcEndpoints(): Promise<RpcEndpointRecord[]> {
    return this.query<RpcEndpointRecord>(
      `
      select
        key,
        label,
        chain,
        transport,
        provider,
        url,
        priority,
        enabled,
        'database' as source,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from rpc_endpoints
      order by chain asc, transport asc, priority asc, created_at asc
      `
    );
  }

  async deleteRpcEndpoint(key: string): Promise<boolean> {
    const rows = await this.query<{ key: string }>(
      `
      delete from rpc_endpoints
      where key = $1
      returning key
      `,
      [key]
    );

    return rows.length > 0;
  }

  async upsertApiCredential(entry: {
    key: ManagedApiKey;
    valueCiphertext: string | null;
    valueHint: string;
    enabled: boolean;
  }): Promise<StoredApiCredentialRecord> {
    const [row] = await this.query<StoredApiCredentialRecord>(
      `
      insert into api_credentials (key, value_ciphertext, value_hint, enabled, created_at, updated_at)
      values ($1, $2, $3, $4, now(), now())
      on conflict (key)
      do update set
        value_ciphertext = excluded.value_ciphertext,
        value_hint = excluded.value_hint,
        enabled = excluded.enabled,
        updated_at = now()
      returning
        key,
        value_ciphertext as "valueCiphertext",
        value_hint as "valueHint",
        enabled,
        created_at as "createdAt",
        updated_at as "updatedAt"
      `,
      [entry.key, entry.valueCiphertext, entry.valueHint, entry.enabled]
    );

    return row;
  }

  async listApiCredentials(): Promise<StoredApiCredentialRecord[]> {
    return this.query<StoredApiCredentialRecord>(
      `
      select
        key,
        value_ciphertext as "valueCiphertext",
        value_hint as "valueHint",
        enabled,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from api_credentials
      order by key asc
      `
    );
  }

  async deleteApiCredential(key: ManagedApiKey): Promise<boolean> {
    const rows = await this.query<{ key: ManagedApiKey }>(
      `
      delete from api_credentials
      where key = $1
      returning key
      `,
      [key]
    );

    return rows.length > 0;
  }

  async upsertApiServiceConfig(entry: {
    id: string;
    provider: ApiProviderId;
    label: string;
    valueCiphertext: string | null;
    endpointUrl: string;
    enabled: boolean;
    priority: number;
    isBackup: boolean;
    autoFailover: boolean;
    automationEnabled: boolean;
    maxLatencyMs: number;
    notes: string;
  }): Promise<StoredApiServiceConfigRecord> {
    const [row] = await this.query<StoredApiServiceConfigRecord>(
      `
      insert into api_service_configs (
        id,
        provider,
        label,
        value_ciphertext,
        endpoint_url,
        enabled,
        priority,
        is_backup,
        auto_failover,
        automation_enabled,
        max_latency_ms,
        notes,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())
      on conflict (id)
      do update set
        provider = excluded.provider,
        label = excluded.label,
        value_ciphertext = excluded.value_ciphertext,
        endpoint_url = excluded.endpoint_url,
        enabled = excluded.enabled,
        priority = excluded.priority,
        is_backup = excluded.is_backup,
        auto_failover = excluded.auto_failover,
        automation_enabled = excluded.automation_enabled,
        max_latency_ms = excluded.max_latency_ms,
        notes = excluded.notes,
        updated_at = now()
      returning
        id,
        provider,
        label,
        value_ciphertext as "valueCiphertext",
        endpoint_url as "endpointUrl",
        enabled,
        priority,
        is_backup as "isBackup",
        auto_failover as "autoFailover",
        automation_enabled as "automationEnabled",
        max_latency_ms as "maxLatencyMs",
        notes,
        created_at as "createdAt",
        updated_at as "updatedAt"
      `,
      [
        entry.id,
        entry.provider,
        entry.label,
        entry.valueCiphertext,
        entry.endpointUrl,
        entry.enabled,
        entry.priority,
        entry.isBackup,
        entry.autoFailover,
        entry.automationEnabled,
        entry.maxLatencyMs,
        entry.notes
      ]
    );

    return row;
  }

  async getApiServiceConfig(id: string): Promise<StoredApiServiceConfigRecord | null> {
    const [row] = await this.query<StoredApiServiceConfigRecord>(
      `
      select
        id,
        provider,
        label,
        value_ciphertext as "valueCiphertext",
        endpoint_url as "endpointUrl",
        enabled,
        priority,
        is_backup as "isBackup",
        auto_failover as "autoFailover",
        automation_enabled as "automationEnabled",
        max_latency_ms as "maxLatencyMs",
        notes,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from api_service_configs
      where id = $1
      `,
      [id]
    );

    return row ?? null;
  }

  async listApiServiceConfigs(): Promise<StoredApiServiceConfigRecord[]> {
    return this.query<StoredApiServiceConfigRecord>(
      `
      select
        id,
        provider,
        label,
        value_ciphertext as "valueCiphertext",
        endpoint_url as "endpointUrl",
        enabled,
        priority,
        is_backup as "isBackup",
        auto_failover as "autoFailover",
        automation_enabled as "automationEnabled",
        max_latency_ms as "maxLatencyMs",
        notes,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from api_service_configs
      order by provider asc, priority asc, created_at asc
      `
    );
  }

  async deleteApiServiceConfig(id: string): Promise<boolean> {
    const rows = await this.query<{ id: string }>(
      `
      delete from api_service_configs
      where id = $1
      returning id
      `,
      [id]
    );

    return rows.length > 0;
  }

  async upsertApiServiceState(entry: {
    configRef: string;
    provider: ApiProviderId;
    status: ApiHealthStatus;
    active: boolean;
    failoverActive: boolean;
    reachable: boolean;
    authValid: boolean;
    lastLatencyMs?: number | null;
    lastCheckedAt?: string | null;
    lastSuccessfulAt?: string | null;
    lastFailureAt?: string | null;
    failureReason?: string | null;
    errorType?: ApiErrorType | null;
    rawErrorMessage?: string | null;
    lastKnownStableAt?: string | null;
    lastKnownStableState?: ApiHealthStatus | null;
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
    rateLimitSnapshot: Record<string, unknown>;
    selectionScore: number;
    selectionReasons: string[];
  }): Promise<StoredApiServiceStateRecord> {
    const [row] = await this.query<StoredApiServiceStateRecord>(
      `
      insert into api_service_state (
        config_ref,
        provider,
        status,
        active,
        failover_active,
        reachable,
        auth_valid,
        last_latency_ms,
        last_checked_at,
        last_successful_at,
        last_failure_at,
        failure_reason,
        error_type,
        raw_error_message,
        last_known_stable_at,
        last_known_stable_state,
        observed_success_count,
        observed_failure_count,
        timeout_count,
        auth_failure_count,
        rate_limit_count,
        network_error_count,
        invalid_response_count,
        server_error_count,
        unknown_error_count,
        failover_count,
        recovery_success_count,
        latency_history_ms,
        rate_limit_snapshot,
        selection_score,
        selection_reasons,
        updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27::jsonb, $28::jsonb, $29, $30::jsonb, now()
      )
      on conflict (config_ref)
      do update set
        provider = excluded.provider,
        status = excluded.status,
        active = excluded.active,
        failover_active = excluded.failover_active,
        reachable = excluded.reachable,
        auth_valid = excluded.auth_valid,
        last_latency_ms = excluded.last_latency_ms,
        last_checked_at = excluded.last_checked_at,
        last_successful_at = excluded.last_successful_at,
        last_failure_at = excluded.last_failure_at,
        failure_reason = excluded.failure_reason,
        error_type = excluded.error_type,
        raw_error_message = excluded.raw_error_message,
        last_known_stable_at = excluded.last_known_stable_at,
        last_known_stable_state = excluded.last_known_stable_state,
        observed_success_count = excluded.observed_success_count,
        observed_failure_count = excluded.observed_failure_count,
        timeout_count = excluded.timeout_count,
        auth_failure_count = excluded.auth_failure_count,
        rate_limit_count = excluded.rate_limit_count,
        network_error_count = excluded.network_error_count,
        invalid_response_count = excluded.invalid_response_count,
        server_error_count = excluded.server_error_count,
        unknown_error_count = excluded.unknown_error_count,
        failover_count = excluded.failover_count,
        recovery_success_count = excluded.recovery_success_count,
        latency_history_ms = excluded.latency_history_ms,
        rate_limit_snapshot = excluded.rate_limit_snapshot,
        selection_score = excluded.selection_score,
        selection_reasons = excluded.selection_reasons,
        updated_at = now()
      returning
        config_ref as "configRef",
        provider,
        status,
        active,
        failover_active as "failoverActive",
        reachable,
        auth_valid as "authValid",
        last_latency_ms as "lastLatencyMs",
        last_checked_at as "lastCheckedAt",
        last_successful_at as "lastSuccessfulAt",
        last_failure_at as "lastFailureAt",
        failure_reason as "failureReason",
        error_type as "errorType",
        raw_error_message as "rawErrorMessage",
        last_known_stable_at as "lastKnownStableAt",
        last_known_stable_state as "lastKnownStableState",
        observed_success_count as "observedSuccessCount",
        observed_failure_count as "observedFailureCount",
        timeout_count as "timeoutCount",
        auth_failure_count as "authFailureCount",
        rate_limit_count as "rateLimitCount",
        network_error_count as "networkErrorCount",
        invalid_response_count as "invalidResponseCount",
        server_error_count as "serverErrorCount",
        unknown_error_count as "unknownErrorCount",
        failover_count as "failoverCount",
        recovery_success_count as "recoverySuccessCount",
        latency_history_ms as "latencyHistoryMs",
        rate_limit_snapshot as "rateLimitSnapshot",
        selection_score::float8 as "selectionScore",
        selection_reasons as "selectionReasons",
        updated_at as "updatedAt"
      `,
      [
        entry.configRef,
        entry.provider,
        entry.status,
        entry.active,
        entry.failoverActive,
        entry.reachable,
        entry.authValid,
        entry.lastLatencyMs ?? null,
        entry.lastCheckedAt ?? null,
        entry.lastSuccessfulAt ?? null,
        entry.lastFailureAt ?? null,
        entry.failureReason ?? null,
        entry.errorType ?? null,
        entry.rawErrorMessage ?? null,
        entry.lastKnownStableAt ?? null,
        entry.lastKnownStableState ?? null,
        entry.observedSuccessCount,
        entry.observedFailureCount,
        entry.timeoutCount,
        entry.authFailureCount,
        entry.rateLimitCount,
        entry.networkErrorCount,
        entry.invalidResponseCount,
        entry.serverErrorCount,
        entry.unknownErrorCount,
        entry.failoverCount,
        entry.recoverySuccessCount,
        stringifyJson(entry.latencyHistoryMs),
        stringifyJson(entry.rateLimitSnapshot),
        entry.selectionScore,
        stringifyJson(entry.selectionReasons)
      ]
    );

    return row;
  }

  async listApiServiceStates(): Promise<StoredApiServiceStateRecord[]> {
    return this.query<StoredApiServiceStateRecord>(
      `
      select
        config_ref as "configRef",
        provider,
        status,
        active,
        failover_active as "failoverActive",
        reachable,
        auth_valid as "authValid",
        last_latency_ms as "lastLatencyMs",
        last_checked_at as "lastCheckedAt",
        last_successful_at as "lastSuccessfulAt",
        last_failure_at as "lastFailureAt",
        failure_reason as "failureReason",
        error_type as "errorType",
        raw_error_message as "rawErrorMessage",
        last_known_stable_at as "lastKnownStableAt",
        last_known_stable_state as "lastKnownStableState",
        observed_success_count as "observedSuccessCount",
        observed_failure_count as "observedFailureCount",
        timeout_count as "timeoutCount",
        auth_failure_count as "authFailureCount",
        rate_limit_count as "rateLimitCount",
        network_error_count as "networkErrorCount",
        invalid_response_count as "invalidResponseCount",
        server_error_count as "serverErrorCount",
        unknown_error_count as "unknownErrorCount",
        failover_count as "failoverCount",
        recovery_success_count as "recoverySuccessCount",
        latency_history_ms as "latencyHistoryMs",
        rate_limit_snapshot as "rateLimitSnapshot",
        selection_score::float8 as "selectionScore",
        selection_reasons as "selectionReasons",
        updated_at as "updatedAt"
      from api_service_state
      order by updated_at desc
      `
    );
  }

  async deleteApiServiceState(configRef: string): Promise<void> {
    await this.pool.query(
      `
      delete from api_service_state
      where config_ref = $1
      `,
      [configRef]
    );
  }

  async insertApiServiceLog(params: {
    configRef?: string | null;
    provider: ApiProviderId;
    apiName: string;
    eventType: string;
    errorType?: ApiErrorType | null;
    actionTaken: string;
    result: string;
    message: string;
    payload?: unknown;
  }): Promise<StoredApiServiceLogRecord> {
    const [row] = await this.query<StoredApiServiceLogRecord>(
      `
      insert into api_service_logs (
        id,
        config_ref,
        provider,
        api_name,
        event_type,
        error_type,
        action_taken,
        result,
        message,
        payload,
        created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
      returning
        id,
        config_ref as "configRef",
        provider,
        api_name as "apiName",
        event_type as "eventType",
        error_type as "errorType",
        action_taken as "actionTaken",
        result,
        message,
        payload,
        created_at as "createdAt"
      `,
      [
        randomUUID(),
        params.configRef ?? null,
        params.provider,
        params.apiName,
        params.eventType,
        params.errorType ?? null,
        params.actionTaken,
        params.result,
        params.message,
        stringifyJson(params.payload ?? {})
      ]
    );

    return row;
  }

  async listApiServiceLogs(limit = 60): Promise<StoredApiServiceLogRecord[]> {
    return this.query<StoredApiServiceLogRecord>(
      `
      select
        id,
        config_ref as "configRef",
        provider,
        api_name as "apiName",
        event_type as "eventType",
        error_type as "errorType",
        action_taken as "actionTaken",
        result,
        message,
        payload,
        created_at as "createdAt"
      from api_service_logs
      order by created_at desc
      limit $1
      `,
      [limit]
    );
  }

  async upsertApiMaintenanceRun(entry: {
    id: string;
    trigger: ApiMaintenanceTrigger;
    status: ApiMaintenanceStatus;
    summary: string;
    checkedConfigs: number;
    healthyConfigs: number;
    failoversActivated: number;
    warnings: number;
    startedAt: string;
    completedAt?: string | null;
  }): Promise<StoredApiMaintenanceRunRecord> {
    const [row] = await this.query<StoredApiMaintenanceRunRecord>(
      `
      insert into api_service_maintenance_runs (
        id,
        trigger,
        status,
        summary,
        checked_configs,
        healthy_configs,
        failovers_activated,
        warnings,
        started_at,
        completed_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      on conflict (id)
      do update set
        trigger = excluded.trigger,
        status = excluded.status,
        summary = excluded.summary,
        checked_configs = excluded.checked_configs,
        healthy_configs = excluded.healthy_configs,
        failovers_activated = excluded.failovers_activated,
        warnings = excluded.warnings,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        updated_at = now()
      returning
        id,
        trigger,
        status,
        summary,
        checked_configs as "checkedConfigs",
        healthy_configs as "healthyConfigs",
        failovers_activated as "failoversActivated",
        warnings,
        started_at as "startedAt",
        completed_at as "completedAt",
        updated_at as "updatedAt"
      `,
      [
        entry.id,
        entry.trigger,
        entry.status,
        entry.summary,
        entry.checkedConfigs,
        entry.healthyConfigs,
        entry.failoversActivated,
        entry.warnings,
        entry.startedAt,
        entry.completedAt ?? null
      ]
    );

    return row;
  }

  async getLatestApiMaintenanceRun(): Promise<StoredApiMaintenanceRunRecord | null> {
    const [row] = await this.query<StoredApiMaintenanceRunRecord>(
      `
      select
        id,
        trigger,
        status,
        summary,
        checked_configs as "checkedConfigs",
        healthy_configs as "healthyConfigs",
        failovers_activated as "failoversActivated",
        warnings,
        started_at as "startedAt",
        completed_at as "completedAt",
        updated_at as "updatedAt"
      from api_service_maintenance_runs
      order by started_at desc
      limit 1
      `
    );

    return row ?? null;
  }

  async createMintJob(job: MintJobInput): Promise<void> {
    await this.pool.query(
      `
      insert into jobs (
        id,
        status,
        chain,
        contract_address,
        mint_function,
        quantity,
        value_wei,
        wallet_ids,
        gas_strategy,
        use_flashbots,
        simulate_first,
        source,
        last_message,
        created_at,
        updated_at
      )
      values ($1, 'queued', $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $13)
      on conflict (id)
      do update set
        status = excluded.status,
        chain = excluded.chain,
        contract_address = excluded.contract_address,
        mint_function = excluded.mint_function,
        quantity = excluded.quantity,
        value_wei = excluded.value_wei,
        wallet_ids = excluded.wallet_ids,
        gas_strategy = excluded.gas_strategy,
        use_flashbots = excluded.use_flashbots,
        simulate_first = excluded.simulate_first,
        source = excluded.source,
        last_message = excluded.last_message,
        deleted_at = null,
        updated_at = excluded.updated_at
      `,
      [
        job.id,
        job.target.chain,
        job.target.contractAddress,
        job.target.mintFunction ?? null,
        job.target.quantity,
        job.target.valueWei?.toString() ?? null,
        JSON.stringify(job.walletIds),
        job.gasStrategy,
        job.policy.useFlashbots,
        job.policy.simulateFirst,
        job.source,
        "Queued for execution.",
        job.createdAt
      ]
    );

    await this.insertLog({
      jobId: job.id,
      level: "info",
      eventType: "job.created",
      message: `Mint job ${job.id} created.`,
      payload: job
    });
  }

  async saveMintResult(job: MintJobInput, result: MintJobResult): Promise<void> {
    for (const attempt of result.attempts) {
      await this.insertTransaction(job, attempt);
      await this.pool.query(
        `
        insert into mints (id, job_id, wallet_id, contract_address, chain, quantity, value_wei, status, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
        on conflict (id)
        do update set status = excluded.status, updated_at = excluded.updated_at
        `,
        [
          `${job.id}:${attempt.walletId}`,
          job.id,
          attempt.walletId,
          job.target.contractAddress,
          job.target.chain,
          job.target.quantity,
          (job.target.valueWei ?? 0n).toString(),
          attempt.success ? "confirmed" : "failed"
        ]
      );
    }

    await this.pool.query(
      `
      update jobs
      set
        status = $2,
        last_message = $3,
        updated_at = now()
      where id = $1
      `,
      [job.id, result.status, `Completed with ${result.confirmedCount} confirmed and ${result.failedCount} failed attempts.`]
    );

    await this.insertLog({
      jobId: job.id,
      level: result.failedCount > 0 ? "warning" : "info",
      eventType: "job.completed",
      message: `Mint job ${job.id} completed with ${result.confirmedCount} confirmations.`,
      payload: result
    });
  }

  async insertTransaction(job: MintJobInput, attempt: MintExecutionAttempt): Promise<void> {
    await this.pool.query(
      `
      insert into transactions (
        id, job_id, wallet_id, chain, contract_address, tx_hash, status, nonce, rpc_key, flashbots_bundle_hash, error_message, submitted_at, confirmed_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      on conflict (id) do nothing
      `,
      [
        randomUUID(),
        job.id,
        attempt.walletId,
        job.target.chain,
        job.target.contractAddress,
        attempt.txHash ?? null,
        attempt.success ? "confirmed" : "failed",
        attempt.nonce ?? null,
        attempt.rpcKey ?? null,
        attempt.flashbotsBundleHash ?? null,
        attempt.error ?? null,
        attempt.submittedAt,
        attempt.confirmedAt ?? null
      ]
    );
  }

  async insertLog(params: {
    jobId?: string;
    level: string;
    eventType: string;
    message: string;
    payload?: unknown;
  }): Promise<void> {
    await this.pool.query(
      `
      insert into logs (id, job_id, level, event_type, message, payload, created_at)
      values ($1, $2, $3, $4, $5, $6::jsonb, now())
      `,
      [randomUUID(), params.jobId ?? null, params.level, params.eventType, params.message, stringifyJson(params.payload ?? {})]
    );
  }

  async markJobStopped(jobId: string, message: string): Promise<void> {
    await this.pool.query(
      `
      update jobs
      set
        status = 'stopped',
        last_message = $2,
        stopped_at = coalesce(stopped_at, now()),
        updated_at = now()
      where id = $1 and deleted_at is null
      `,
      [jobId, message]
    );
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.pool.query("delete from logs where job_id = $1", [jobId]);
    await this.pool.query("delete from transactions where job_id = $1", [jobId]);
    await this.pool.query("delete from mints where job_id = $1", [jobId]);
    await this.pool.query("delete from jobs where id = $1", [jobId]);
  }

  async listJobs(limit = 50): Promise<TaskRecord[]> {
    const rows = await this.query<any>(
      `
      select
        j.id,
        j.status,
        j.chain,
        j.contract_address as "contractAddress",
        j.mint_function as "mintFunction",
        j.quantity,
        j.value_wei as "valueWei",
        j.wallet_ids as "walletIds",
        j.gas_strategy as "gasStrategy",
        j.use_flashbots as "useFlashbots",
        j.simulate_first as "simulateFirst",
        j.source,
        j.created_at as "createdAt",
        j.updated_at as "updatedAt",
        j.stopped_at as "stoppedAt",
        j.last_message as "lastMessage",
        count(t.id)::int as "attemptCount",
        count(*) filter (where t.status = 'confirmed')::int as "confirmedCount",
        count(*) filter (where t.status = 'failed')::int as "failedCount"
      from jobs j
      left join transactions t on t.job_id = j.id
      where j.deleted_at is null
      group by
        j.id,
        j.status,
        j.chain,
        j.contract_address,
        j.mint_function,
        j.quantity,
        j.value_wei,
        j.wallet_ids,
        j.gas_strategy,
        j.use_flashbots,
        j.simulate_first,
        j.source,
        j.created_at,
        j.updated_at,
        j.stopped_at,
        j.last_message
      order by j.created_at desc
      limit $1
      `,
      [limit]
    );

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      chain: row.chain,
      contractAddress: row.contractAddress,
      mintFunction: row.mintFunction,
      quantity: row.quantity,
      valueWei: row.valueWei ? BigInt(row.valueWei) : null,
      walletIds: row.walletIds ?? [],
      gasStrategy: row.gasStrategy,
      useFlashbots: row.useFlashbots,
      simulateFirst: row.simulateFirst,
      source: row.source,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      stoppedAt: row.stoppedAt,
      lastMessage: row.lastMessage,
      attemptCount: row.attemptCount ?? 0,
      confirmedCount: row.confirmedCount ?? 0,
      failedCount: row.failedCount ?? 0
    }));
  }

  async listRecentLogs(limit = 50): Promise<any[]> {
    return this.query<any>(
      `
      select id, job_id as "jobId", level, event_type as "eventType", message, payload, created_at as "createdAt"
      from logs
      order by created_at desc
      limit $1
      `,
      [limit]
    );
  }

  async listRecentTransactions(limit = 50): Promise<any[]> {
    return this.query<any>(
      `
      select
        id,
        job_id as "jobId",
        wallet_id as "walletId",
        chain,
        contract_address as "contractAddress",
        tx_hash as "txHash",
        status,
        nonce,
        rpc_key as "rpcKey",
        flashbots_bundle_hash as "flashbotsBundleHash",
        error_message as "errorMessage",
        submitted_at as "submittedAt",
        confirmed_at as "confirmedAt"
      from transactions
      order by submitted_at desc
      limit $1
      `,
      [limit]
    );
  }

  async summarizeWalletPerformance(): Promise<any[]> {
    return this.query<any>(
      `
      select
        w.id as "walletId",
        w.address,
        count(*) filter (where t.status = 'confirmed')::int as "successfulMints",
        count(*) filter (where t.status = 'failed')::int as "failedMints",
        0::numeric as "totalGasSpentWei",
        0::numeric as "pnlWei",
        coalesce(max(t.submitted_at), now()) as "updatedAt"
      from wallets w
      left join transactions t on t.wallet_id = w.id
      group by w.id, w.address
      order by "successfulMints" desc, "failedMints" asc
      `
    );
  }
}
