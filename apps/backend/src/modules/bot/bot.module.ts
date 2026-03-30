import { Module } from "@nestjs/common";
import { BotControlRegistry } from "./bot-control.registry.js";
import { BotController } from "./bot.controller.js";
import { BotService } from "./bot.service.js";
import { MintQueueProcessor } from "../queues/mint-queue.processor.js";
import { WalletsModule } from "../wallets/wallets.module.js";

@Module({
  imports: [WalletsModule],
  controllers: [BotController],
  providers: [BotService, BotControlRegistry, MintQueueProcessor],
  exports: [BotService, BotControlRegistry]
})
export class BotModule {}
