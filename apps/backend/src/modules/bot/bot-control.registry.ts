import { Injectable } from "@nestjs/common";

@Injectable()
export class BotControlRegistry {
  private readonly stoppedJobs = new Set<string>();

  stop(jobId: string): void {
    this.stoppedJobs.add(jobId);
  }

  clear(jobId: string): void {
    this.stoppedJobs.delete(jobId);
  }

  isStopped(jobId: string): boolean {
    return this.stoppedJobs.has(jobId);
  }
}
