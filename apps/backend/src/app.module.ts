import { Module } from "@nestjs/common";
import { AnalyticsModule } from "./modules/analytics/analytics.module.js";
import { BotModule } from "./modules/bot/bot.module.js";
import { ContractsModule } from "./modules/contracts/contracts.module.js";
import { QueueModule } from "./modules/queues/queue.module.js";
import { RealtimeModule } from "./modules/realtime/realtime.module.js";
import { RustExecutionModule } from "./modules/rust-execution/rust-execution.module.js";
import { RuntimeModule } from "./modules/runtime/runtime.module.js";
import { TrackerModule } from "./modules/tracker/tracker.module.js";
import { WalletsModule } from "./modules/wallets/wallets.module.js";
import { InfrastructureModule } from "./infrastructure.module.js";

@Module({
  imports: [InfrastructureModule, RealtimeModule, QueueModule, RustExecutionModule, RuntimeModule, WalletsModule, ContractsModule, AnalyticsModule, TrackerModule, BotModule]
})
export class AppModule {}
