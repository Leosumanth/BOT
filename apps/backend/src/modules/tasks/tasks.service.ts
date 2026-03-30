import { Injectable } from "@nestjs/common";
import type { StartBotRequest, StopBotRequest, TaskRecord } from "@mintbot/shared";
import { BotService } from "../bot/bot.service.js";
import { BotControlRegistry } from "../bot/bot-control.registry.js";
import { QueueService } from "../queues/queue.service.js";
import { DatabaseService } from "../../database/database.service.js";

@Injectable()
export class TasksService {
  constructor(
    private readonly bot: BotService,
    private readonly control: BotControlRegistry,
    private readonly queues: QueueService,
    private readonly database: DatabaseService
  ) {}

  async list(): Promise<TaskRecord[]> {
    return this.database.listJobs();
  }

  async create(request: StartBotRequest): Promise<{ accepted: boolean }> {
    await this.bot.start(request.job);
    return { accepted: true };
  }

  async stop(jobId: string): Promise<{ accepted: boolean; removedFromQueue: boolean }> {
    let removedFromQueue = false;

    try {
      removedFromQueue = await this.queues.removeMintJob(jobId);
    } catch {
      removedFromQueue = false;
    }

    await this.bot.stop({ jobId } satisfies StopBotRequest);
    const message = removedFromQueue ? "Removed from queue before execution." : "Stop requested for the current task.";
    await this.database.markJobStopped(jobId, message);

    return {
      accepted: true,
      removedFromQueue
    };
  }

  async delete(jobId: string): Promise<{ removed: boolean }> {
    try {
      await this.queues.removeMintJob(jobId);
    } catch {
      // If the BullMQ job is already active or missing we still proceed with history cleanup.
    }

    this.control.stop(jobId);
    await this.database.deleteJob(jobId);

    return { removed: true };
  }
}
