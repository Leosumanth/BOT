import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { ChainKey, WalletRecord, WalletUpdateRequest, WalletUpsertRequest } from "@mintbot/shared";
import { nowIso } from "@mintbot/shared";
import { AppConfigService } from "../../config/app-config.service.js";
import { DatabaseService } from "../../database/database.service.js";
import type { UnlockedWallet } from "@mintbot/bot";

@Injectable()
export class WalletsService {
  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService
  ) {}

  async list(): Promise<WalletRecord[]> {
    return this.database.listWallets();
  }

  async create(request: WalletUpsertRequest): Promise<WalletRecord> {
    const timestamp = nowIso();
    const encryptedPrivateKey = this.encrypt(request.privateKey);

    return this.database.insertWallet({
      id: randomUUID(),
      label: request.label,
      address: this.deriveAddress(request.privateKey),
      encryptedPrivateKey,
      chain: request.chain,
      enabled: true,
      tags: request.tags ?? [],
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  async update(walletId: string, request: WalletUpdateRequest): Promise<WalletRecord | null> {
    return this.database.updateWallet(walletId, request);
  }

  async delete(walletId: string): Promise<boolean> {
    return this.database.deleteWallet(walletId);
  }

  async getUnlockedWallets(walletIds: string[]): Promise<UnlockedWallet[]> {
    const wallets = await this.database.listWallets();

    return wallets
      .filter((wallet) => walletIds.includes(wallet.id) && wallet.enabled)
      .map((wallet) => ({
        id: wallet.id,
        label: wallet.label,
        address: wallet.address,
        privateKey: this.decrypt(wallet.encryptedPrivateKey) as `0x${string}`,
        chain: wallet.chain as ChainKey
      }));
  }

  private deriveAddress(privateKey: string): `0x${string}` {
    return privateKeyToAccount(privateKey as `0x${string}`).address;
  }

  private encrypt(value: string): string {
    const key = createHash("sha256").update(this.config.encryptionSecret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  private decrypt(payload: string): string {
    const key = createHash("sha256").update(this.config.encryptionSecret).digest();
    const buffer = Buffer.from(payload, "base64");
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }
}
