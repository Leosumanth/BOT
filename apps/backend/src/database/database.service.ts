import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ContractAnalysisResult, MintExecutionAttempt, MintJobInput, MintJobResult, WalletRecord } from "@mintbot/shared";
import { AppConfigService } from "../config/app-config.service.js";
import { stringifyJson } from "../utils/json.js";

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

  async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
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
      insert into wallets (id, label, address, encrypted_private_key, chain, enabled, tags, created_at, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
      returning
        id,
        label,
        address,
        encrypted_private_key as "encryptedPrivateKey",
        chain,
        enabled,
        tags,
        created_at as "createdAt",
        updated_at as "updatedAt"
      `,
      [
        wallet.id,
        wallet.label,
        wallet.address,
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
        encrypted_private_key as "encryptedPrivateKey",
        chain,
        enabled,
        tags,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from wallets
      order by created_at desc
      `
    );
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

  async createMintJob(job: MintJobInput): Promise<void> {
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
