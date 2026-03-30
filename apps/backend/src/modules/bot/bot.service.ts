import { Injectable } from "@nestjs/common";
import type { MintJobInput, StopBotRequest } from "@mintbot/shared";
import { QueueService } from "../queues/queue.service.js";
import { DatabaseService } from "../../database/database.service.js";
import { BotControlRegistry } from "./bot-control.registry.js";

@Injectable()
export class BotService {
  constructor(
    private readonly queues: QueueService,
    private readonly database: DatabaseService,
    private readonly control: BotControlRegistry
  ) {}

  async start(job: MintJobInput): Promise<void> {
    await this.database.createMintJob(job);
    await this.queues.enqueueMintJob(job);
  }

  async stop(request: StopBotRequest): Promise<void> {
    this.control.stop(request.jobId);
    await this.database.insertLog({
      jobId: request.jobId,
      level: "warning",
      eventType: "job.stop-requested",
      message: `Stop requested for job ${request.jobId}.`,
      payload: request
    });
  }
}
