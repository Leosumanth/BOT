import { Injectable } from "@nestjs/common";
import type { ContractAnalysisResult, ContractAnalyzerRequest } from "@mintbot/shared";
import { DatabaseService } from "../../database/database.service.js";
import { RuntimeService } from "../runtime/runtime.service.js";

@Injectable()
export class ContractsService {
  constructor(
    private readonly runtime: RuntimeService,
    private readonly database: DatabaseService
  ) {}

  async analyze(request: ContractAnalyzerRequest): Promise<ContractAnalysisResult> {
    const analysis = await this.runtime.analyzer.analyze(request.chain, request.contractAddress);
    await this.database.upsertContractAnalysis(analysis);
    return analysis;
  }

  async list(): Promise<ContractAnalysisResult[]> {
    return this.database.listContracts();
  }
}
