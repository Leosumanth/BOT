import { Controller, Get } from "@nestjs/common";
import type { ApiEnvelope, AnalyticsSummary, DashboardBootstrapResponse } from "@mintbot/shared";
import { AnalyticsService } from "./analytics.service.js";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("dashboard")
  async dashboard(): Promise<ApiEnvelope<DashboardBootstrapResponse>> {
    return { data: await this.analyticsService.getDashboardBootstrap() };
  }

  @Get("summary")
  async summary(): Promise<ApiEnvelope<AnalyticsSummary>> {
    return { data: await this.analyticsService.getSummary() };
  }
}
