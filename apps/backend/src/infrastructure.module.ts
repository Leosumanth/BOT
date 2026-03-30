import { Global, Module } from "@nestjs/common";
import { AppConfigService } from "./config/app-config.service.js";
import { DatabaseService } from "./database/database.service.js";

@Global()
@Module({
  providers: [AppConfigService, DatabaseService],
  exports: [AppConfigService, DatabaseService]
})
export class InfrastructureModule {}
