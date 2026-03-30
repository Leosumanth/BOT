import { Global, Module } from "@nestjs/common";
import { RuntimeService } from "./runtime.service.js";

@Global()
@Module({
  providers: [RuntimeService],
  exports: [RuntimeService]
})
export class RuntimeModule {}
