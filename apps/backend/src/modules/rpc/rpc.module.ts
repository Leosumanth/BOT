import { Module } from "@nestjs/common";
import { RpcController } from "./rpc.controller.js";
import { RpcService } from "./rpc.service.js";

@Module({
  controllers: [RpcController],
  providers: [RpcService]
})
export class RpcModule {}
