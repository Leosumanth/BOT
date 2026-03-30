import { Body, Controller, Post } from "@nestjs/common";
import type { ApiEnvelope, StartBotRequest, StopBotRequest } from "@mintbot/shared";
import { BotService } from "./bot.service.js";

@Controller("bot")
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post("start")
  async start(@Body() body: StartBotRequest): Promise<ApiEnvelope<{ accepted: boolean }>> {
    await this.botService.start(body.job);
    return { data: { accepted: true } };
  }

  @Post("stop")
  async stop(@Body() body: StopBotRequest): Promise<ApiEnvelope<{ accepted: boolean }>> {
    await this.botService.stop(body);
    return { data: { accepted: true } };
  }
}
