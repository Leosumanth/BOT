import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import type { ApiEnvelope, RpcEndpointImportRequest, RpcEndpointRecord, RpcManagementResponse } from "@mintbot/shared";
import { RpcService } from "./rpc.service.js";
import { RpcEndpointImportDto, toRpcEndpointImportRequest } from "./rpc.dto.js";

@Controller("rpc")
export class RpcController {
  constructor(private readonly rpcService: RpcService) {}

  @Get()
  async list(): Promise<ApiEnvelope<RpcManagementResponse>> {
    return { data: await this.rpcService.list() };
  }

  @Post()
  async create(@Body() body: RpcEndpointImportDto): Promise<ApiEnvelope<RpcEndpointRecord>> {
    return { data: await this.rpcService.create(toRpcEndpointImportRequest(body)) };
  }

  @Post("warm")
  async warm(): Promise<ApiEnvelope<RpcManagementResponse>> {
    return { data: await this.rpcService.warm() };
  }

  @Delete(":key")
  async remove(@Param("key") key: string): Promise<ApiEnvelope<{ removed: boolean }>> {
    return { data: await this.rpcService.remove(key) };
  }
}
