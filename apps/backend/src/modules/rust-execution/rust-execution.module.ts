import { Global, Module } from "@nestjs/common";
import { RustExecutionBridgeService } from "./rust-execution-bridge.service.js";

@Global()
@Module({
  providers: [RustExecutionBridgeService],
  exports: [RustExecutionBridgeService]
})
export class RustExecutionModule {}
