import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import type { ApiEnvelope, WalletRecord } from "@mintbot/shared";
import { WalletsService } from "./wallets.service.js";
import { WalletUpdateDto, WalletUpsertDto } from "./wallets.dto.js";

@Controller("wallets")
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  async list(): Promise<ApiEnvelope<WalletRecord[]>> {
    return { data: await this.walletsService.list() };
  }

  @Post()
  async create(@Body() body: WalletUpsertDto): Promise<ApiEnvelope<WalletRecord>> {
    return { data: await this.walletsService.create(body) };
  }

  @Patch(":walletId")
  async update(
    @Param("walletId", new ParseUUIDPipe()) walletId: string,
    @Body() body: WalletUpdateDto
  ): Promise<ApiEnvelope<WalletRecord>> {
    const wallet = await this.walletsService.update(walletId, body);
    if (!wallet) {
      throw new NotFoundException(`Wallet ${walletId} was not found.`);
    }

    return { data: wallet };
  }

  @Delete(":walletId")
  async remove(@Param("walletId", new ParseUUIDPipe()) walletId: string): Promise<ApiEnvelope<{ removed: boolean }>> {
    return { data: { removed: await this.walletsService.delete(walletId) } };
  }
}
