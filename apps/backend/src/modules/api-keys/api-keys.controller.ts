import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import type {
  ApiEnvelope,
  ApiKeyRecord,
  ApiKeysDashboardResponse,
  ApiKeyTestResponse,
  ApiKeyUpsertRequest,
  ManagedApiKey
} from "@mintbot/shared";
import { ApiKeysService } from "./api-keys.service.js";

@Controller("api-keys")
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  async list(): Promise<ApiEnvelope<ApiKeysDashboardResponse>> {
    return { data: await this.apiKeysService.list() };
  }

  @Post("test")
  async testAll(): Promise<ApiEnvelope<ApiKeyTestResponse>> {
    return { data: await this.apiKeysService.testAll() };
  }

  @Patch(":key")
  async update(
    @Param("key") key: ManagedApiKey,
    @Body() body: ApiKeyUpsertRequest
  ): Promise<ApiEnvelope<ApiKeyRecord>> {
    return { data: await this.apiKeysService.upsert(key, body) };
  }

  @Delete(":key")
  async remove(@Param("key") key: ManagedApiKey): Promise<ApiEnvelope<{ removed: boolean }>> {
    return { data: await this.apiKeysService.remove(key) };
  }
}
