import { Body, Controller, Get, Post } from "@nestjs/common";
import type { ApiEnvelope, WalletRecord, WalletUpsertRequest } from "@mintbot/shared";
import { WalletsService } from "./wallets.service.js";

@Controller("wallets")
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  async list(): Promise<ApiEnvelope<WalletRecord[]>> {
    return { data: await this.walletsService.list() };
  }

  @Post()
  async create(@Body() body: WalletUpsertRequest): Promise<ApiEnvelope<WalletRecord>> {
    return { data: await this.walletsService.create(body) };
  }
}
