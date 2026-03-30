import { Body, Controller, Get, Post } from "@nestjs/common";
import type { ApiEnvelope, ContractAnalysisResult, ContractAnalyzerRequest } from "@mintbot/shared";
import { ContractsService } from "./contracts.service.js";

@Controller("contracts")
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  async list(): Promise<ApiEnvelope<ContractAnalysisResult[]>> {
    return { data: await this.contractsService.list() };
  }

  @Post("analyze")
  async analyze(@Body() body: ContractAnalyzerRequest): Promise<ApiEnvelope<ContractAnalysisResult>> {
    return { data: await this.contractsService.analyze(body) };
  }
}
