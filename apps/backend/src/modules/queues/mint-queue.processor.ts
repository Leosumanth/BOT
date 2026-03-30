import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Worker } from "bullmq";
import { MintBotEngine } from "@mintbot/bot";
import type { MintJobInput } from "@mintbot/shared";
import { QueueService } from "./queue.service.js";
import { WalletsService } from "../wallets/wallets.service.js";
import { RuntimeService } from "../runtime/runtime.service.js";
import { DatabaseService } from "../../database/database.service.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { BotControlRegistry } from "../bot/bot-control.registry.js";
import { deserializeMintJob } from "../../utils/json.js";
import { AppConfigService } from "../../config/app-config.service.js";
import { RustExecutionBridgeService } from "../rust-execution/rust-execution-bridge.service.js";

@Injectable()
export class MintQueueProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MintQueueProcessor.name);
  private worker?: Worker<Record<string, unknown>>;

  constructor(
    private readonly queues: QueueService,
    private readonly wallets: WalletsService,
    private readonly runtime: RuntimeService,
    private readonly database: DatabaseService,
    private readonly realtime: RealtimeGateway,
    private readonly control: BotControlRegistry,
    private readonly config: AppConfigService,
    private readonly rustExecution: RustExecutionBridgeService
  ) {}

  onModuleInit(): void {
    if (!this.config.enableInlineWorker) {
      this.logger.log("Inline worker disabled by configuration.");
      return;
    }

    this.worker = this.createWorker();
    this.logger.log("Mint queue processor started.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  createWorker(): Worker<Record<string, unknown>> {
    return new Worker<Record<string, unknown>>(
      this.queues.mintQueue.name,
      async (bullJob) => {
        const job = deserializeMintJob(bullJob.data);
        if (this.control.isStopped(job.id)) {
          this.control.clear(job.id);
          await this.database.insertLog({
            jobId: job.id,
            level: "warning",
            eventType: "job.stopped",
            message: `Job ${job.id} was stopped before execution.`,
            payload: job
          });
          return;
        }

        const analysis =
          job.target.mintFunction
            ? null
            : await this.runtime.analyzer.analyze(job.target.chain, job.target.contractAddress);

        if (analysis) {
          await this.database.upsertContractAnalysis(analysis);
          job.target.mintFunction = analysis.detectedMintFunction?.signature;
          job.target.valueWei = job.target.valueWei ?? analysis.priceWei ?? undefined;
        }

        const wallets = await this.wallets.getUnlockedWallets(job.walletIds);
        const walletMetrics = (await this.database.summarizeWalletPerformance()).map((row) => ({
          walletId: row.walletId,
          address: row.address,
          successfulMints: row.successfulMints,
          failedMints: row.failedMints,
          totalGasSpentWei: BigInt(row.totalGasSpentWei ?? 0),
          pnlWei: BigInt(row.pnlWei ?? 0),
          recentSuccessRate:
            row.successfulMints + row.failedMints > 0 ? row.successfulMints / (row.successfulMints + row.failedMints) : 0.5,
          avgLatencyMs: 0,
          lastUsedAt: row.updatedAt,
          stealthScore: 0.7,
          updatedAt: row.updatedAt
        }));
        const engine = new MintBotEngine({
          rpcRouter: this.runtime.rpcRouter,
          nonceManager: this.runtime.nonceManager,
          transactionBuilder: this.runtime.transactionBuilder,
          gasStrategy: this.runtime.gasStrategy,
          gasPredictor: this.runtime.gasPredictor,
          blockTiming: this.runtime.blockTiming,
          competitionAnalyzer: this.runtime.competitionAnalyzer,
          walletStrategy: this.runtime.walletStrategy,
          mintStrategy: this.runtime.mintStrategy,
          feedbackLoop: this.runtime.feedbackLoop,
          presignedTransactions: this.runtime.presignedTransactions,
          flashbots: this.runtime.flashbots,
          executionAdapter: this.config.enableRustExecutor ? this.rustExecution : undefined,
          telemetry: {
            publish: async (event) => {
              await this.database.insertLog({
                jobId: event.jobId,
                level: event.level,
                eventType: `bot.${event.phase}`,
                message: event.message,
                payload: event
              });
              this.realtime.emitTelemetry(event);
            }
          }
        });

        const output = await engine.execute({
          job,
          wallets,
          contractAnalysis: analysis,
          walletMetrics,
          queuedAtMs: new Date(job.createdAt).getTime()
        });

        await this.database.saveMintResult(job, output.result);
        this.realtime.emitJobStatus(output.result);
        this.realtime.emitWalletMetrics(output.metrics);
        this.control.clear(job.id);
      },
      {
        connection: this.queues.redis,
        concurrency: 4
      }
    );
  }
}
