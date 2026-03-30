import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import type {
  ApiEnvelope,
  ApiConfigCreateRequest,
  ApiConfigRecord,
  ApiConfigTestResponse,
  ApiConfigUpdateRequest,
  ApiDraftKeyTestRequest,
  ApiDraftKeyTestResponse,
  ApiKeysDashboardResponse,
  ApiMaintenanceRunResponse
} from "@mintbot/shared";
import { ApiKeysService } from "./api-keys.service.js";
import { ApiConfigCreateDto, ApiConfigUpdateDto, ApiDraftKeyTestDto } from "./api-keys.dto.js";

@Controller("api-keys")
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  async list(): Promise<ApiEnvelope<ApiKeysDashboardResponse>> {
    return { data: await this.apiKeysService.list() };
  }

  @Post("configs")
  async create(@Body() body: ApiConfigCreateDto): Promise<ApiEnvelope<ApiConfigRecord>> {
    return { data: await this.apiKeysService.create(body) };
  }

  @Patch("configs/:id")
  async update(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: ApiConfigUpdateDto): Promise<ApiEnvelope<ApiConfigRecord>> {
    return { data: await this.apiKeysService.update(id, body) };
  }

  @Delete("configs/:id")
  async remove(@Param("id", new ParseUUIDPipe()) id: string): Promise<ApiEnvelope<{ removed: boolean }>> {
    return { data: await this.apiKeysService.remove(id) };
  }

  @Post("configs/:id/test")
  async testConfig(@Param("id", new ParseUUIDPipe()) id: string): Promise<ApiEnvelope<ApiConfigTestResponse>> {
    return { data: await this.apiKeysService.testConfig(id) };
  }

  @Post("test-draft")
  async testDraft(@Body() body: ApiDraftKeyTestDto): Promise<ApiEnvelope<ApiDraftKeyTestResponse>> {
    return { data: await this.apiKeysService.testDraft(body) };
  }

  @Post("maintenance/run")
  async runMaintenance(): Promise<ApiEnvelope<ApiMaintenanceRunResponse>> {
    return { data: await this.apiKeysService.runMaintenance() };
  }
}
