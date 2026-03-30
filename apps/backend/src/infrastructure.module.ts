import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AdminTokenGuard } from "./auth/admin-token.guard.js";
import { AppConfigService } from "./config/app-config.service.js";
import { DatabaseService } from "./database/database.service.js";

@Global()
@Module({
  providers: [
    AppConfigService,
    DatabaseService,
    AdminTokenGuard,
    {
      provide: APP_GUARD,
      useClass: AdminTokenGuard
    }
  ],
  exports: [AppConfigService, DatabaseService]
})
export class InfrastructureModule {}
