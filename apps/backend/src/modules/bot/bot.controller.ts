import { Body, Controller, Post } from "@nestjs/common";
import type { ApiEnvelope, StartBotRequest, StopBotRequest } from "@mintbot/shared";
import { BotService } from "./bot.service.js";
import { StartBotRequestDto, StopBotRequestDto, toStartBotRequest, toStopBotRequest } from "../../common/validation/mint-job.dto.js";

@Controller("bot")
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post("start")
  async start(@Body() body: StartBotRequestDto): Promise<ApiEnvelope<{ accepted: boolean }>> {
    const request = toStartBotRequest(body);
    await this.botService.start(request.job);
    return { data: { accepted: true } };
  }

  @Post("stop")
  async stop(@Body() body: StopBotRequestDto): Promise<ApiEnvelope<{ accepted: boolean }>> {
    const request = toStopBotRequest(body);
    await this.botService.stop(request);
    return { data: { accepted: true } };
  }
}
