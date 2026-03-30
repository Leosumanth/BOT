import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { MintJobInput } from "@mintbot/shared";
import { AppConfigService } from "../../config/app-config.service.js";
import { serializeMintJob } from "../../utils/json.js";

@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly redis: Redis;
  readonly mintQueue: Queue<Record<string, unknown>>;
  readonly trackerQueue: Queue<Record<string, unknown>>;

  constructor(config: AppConfigService) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });

    this.mintQueue = new Queue<Record<string, unknown>>(config.mintQueueName, {
      connection: this.redis
    });

    this.trackerQueue = new Queue<Record<string, unknown>>(config.trackerQueueName, {
      connection: this.redis
    });
  }

  async enqueueMintJob(job: MintJobInput): Promise<void> {
    await this.mintQueue.add(job.id, serializeMintJob(job), {
      jobId: job.id,
      attempts: Math.max(1, job.policy.maxRetries),
      backoff: {
        type: "exponential",
        delay: job.policy.retryDelayMs
      },
      removeOnComplete: 250,
      removeOnFail: 500
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.mintQueue.close(), this.trackerQueue.close(), this.redis.quit()]);
  }
}
