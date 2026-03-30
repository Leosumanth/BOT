import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool } from "pg";
import type { QueryResultRow } from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type {
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

interface StoredApiCredentialRecord {
  key: ManagedApiKey;
  valueCiphertext: string | null;
  valueHint: string;
  enabled: boolean;
  createdAt: string;
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

  async insertWallet(wallet: WalletRecord): Promise<WalletRecord> {
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
        coalesce(encrypted_private_key, secret_ciphertext) as "encryptedPrivateKey",
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
        coalesce(encrypted_private_key, secret_ciphertext) as "encryptedPrivateKey",
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
