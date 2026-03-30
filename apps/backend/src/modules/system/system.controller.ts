import { Controller, Get } from "@nestjs/common";
import type { ApiEnvelope, SystemOverview } from "@mintbot/shared";
import { SystemService } from "./system.service.js";

@Controller("system")
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get()
  overview(): ApiEnvelope<SystemOverview> {
    return { data: this.systemService.getOverview() };
  }
}
