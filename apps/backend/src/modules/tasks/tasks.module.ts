import { Module } from "@nestjs/common";
import { BotModule } from "../bot/bot.module.js";
import { TasksController } from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";

@Module({
  imports: [BotModule],
  controllers: [TasksController],
  providers: [TasksService]
})
export class TasksModule {}
