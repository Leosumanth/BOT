import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Redis } from "ioredis";
import type { RustMintExecutionRequest, RustMintExecutionResult } from "@mintbot/shared";
import { QueueService } from "../queues/queue.service.js";
import { AppConfigService } from "../../config/app-config.service.js";
import { toJsonSafe } from "../../utils/json.js";

interface PendingRustExecution {
  promise: Promise<RustMintExecutionResult>;
  resolve: (result: RustMintExecutionResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

@Injectable()
export class RustExecutionBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RustExecutionBridgeService.name);
  private readonly pending = new Map<string, PendingRustExecution>();
  private ready = false;
  private subscriber?: Redis;

  constructor(
    private readonly queues: QueueService,
    private readonly config: AppConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.enableRustExecutor) {
      this.logger.log("Rust executor bridge disabled by configuration.");
      return;
    }

    this.subscriber = this.queues.redis.duplicate();
    this.subscriber.on("error", (error) => {
      this.logger.error(`Rust executor subscriber error: ${error.message}`);
    });
    this.subscriber.on("message", (channel, message) => {
      if (channel === this.config.rustResultChannel) {
        void this.handleResultMessage(message);
      }
    });

    try {
      await this.subscribeWithTimeout(this.config.rustResultChannel, 5_000);
      this.ready = true;
      this.logger.log(`Rust executor bridge subscribed to ${this.config.rustResultChannel}.`);
    } catch (error) {
      this.ready = false;
      this.logger.error(
        `Rust executor bridge unavailable: ${error instanceof Error ? error.message : "Subscription failed."}`
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const [jobId, entry] of this.pending.entries()) {
      clearTimeout(entry.timeout);
      entry.reject(new Error(`Rust bridge shutting down before ${jobId} completed.`));
    }

    this.pending.clear();
    await this.subscriber?.quit();
  }

  async execute(request: RustMintExecutionRequest): Promise<RustMintExecutionResult> {
    if (!this.config.enableRustExecutor) {
      throw new Error("Rust executor bridge is disabled.");
    }

    if (!this.ready) {
      throw new Error("Rust executor bridge is unavailable. Check Redis connectivity and worker health.");
    }

    const cached = await this.getSuccessfulResult(request.jobId);
    if (cached) {
      return cached;
    }

    const existing = this.pending.get(request.jobId);
    if (existing) {
      return existing.promise;
    }

    let resolveExecution!: (result: RustMintExecutionResult) => void;
    let rejectExecution!: (error: Error) => void;
    const promise = new Promise<RustMintExecutionResult>((resolve, reject) => {
      resolveExecution = resolve;
      rejectExecution = reject;
    });

    const timeout = setTimeout(() => {
      this.pending.delete(request.jobId);
      void this.queues.redis.del(this.inflightKey(request.jobId));
      rejectExecution(new Error(`Rust executor timed out for ${request.jobId}.`));
    }, this.config.rustExecutionTimeoutMs);

    this.pending.set(request.jobId, {
      promise,
      resolve: resolveExecution,
      reject: rejectExecution,
      timeout
    });

    try {
      const claimed = await this.queues.redis.set(
        this.inflightKey(request.jobId),
        JSON.stringify({ queuedAt: new Date().toISOString() }),
        "PX",
        this.config.rustExecutionTimeoutMs + 30_000,
        "NX"
      );

      if (claimed === "OK") {
        await this.queues.redis.rpush(this.config.rustMintQueueName, JSON.stringify(toJsonSafe(request)));
      } else {
        this.logger.warn(`Rust execution ${request.jobId} is already inflight; awaiting existing result.`);
      }
    } catch (error) {
      clearTimeout(timeout);
      this.pending.delete(request.jobId);
      await this.queues.redis.del(this.inflightKey(request.jobId));
      rejectExecution(error instanceof Error ? error : new Error("Failed to dispatch Rust execution job."));
    }

    return promise;
  }

  private async handleResultMessage(message: string): Promise<void> {
    const parsed = JSON.parse(message) as RustMintExecutionResult;
    if (!parsed?.jobId || !parsed?.status) {
      return;
    }

    await this.queues.redis.del(this.inflightKey(parsed.jobId));

    if (parsed.status === "success") {
      await this.queues.redis.set(this.resultKey(parsed.jobId), JSON.stringify(parsed), "PX", this.config.rustSuccessResultTtlMs);
    }

    const pending = this.pending.get(parsed.jobId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(parsed.jobId);
    pending.resolve(parsed);
  }

  private async getSuccessfulResult(jobId: string): Promise<RustMintExecutionResult | null> {
    const raw = await this.queues.redis.get(this.resultKey(jobId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as RustMintExecutionResult;
    return parsed.status === "success" ? parsed : null;
  }

  private inflightKey(jobId: string): string {
    return `rust:mint:inflight:${jobId}`;
  }

  private resultKey(jobId: string): string {
    return `rust:mint:result:${jobId}`;
  }

  private async subscribeWithTimeout(channel: string, timeoutMs: number): Promise<void> {
    if (!this.subscriber) {
      throw new Error("Redis subscriber is not initialized.");
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        this.subscriber.subscribe(channel),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error(`Timed out subscribing to ${channel} after ${timeoutMs}ms.`));
          }, timeoutMs);
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
