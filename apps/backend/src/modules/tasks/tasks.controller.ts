import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import type { ApiEnvelope, StartBotRequest, TaskRecord } from "@mintbot/shared";
import { TasksService } from "./tasks.service.js";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async list(): Promise<ApiEnvelope<TaskRecord[]>> {
    return { data: await this.tasksService.list() };
  }

  @Post()
  async create(@Body() body: StartBotRequest): Promise<ApiEnvelope<{ accepted: boolean }>> {
    return { data: await this.tasksService.create(body) };
  }

  @Post(":taskId/stop")
  async stop(@Param("taskId") taskId: string): Promise<ApiEnvelope<{ accepted: boolean; removedFromQueue: boolean }>> {
    return { data: await this.tasksService.stop(taskId) };
  }

  @Delete(":taskId")
  async remove(@Param("taskId") taskId: string): Promise<ApiEnvelope<{ removed: boolean }>> {
    return { data: await this.tasksService.delete(taskId) };
  }
}
