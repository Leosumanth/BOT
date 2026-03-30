import type { MintExecutionAttempt, WalletPerformanceMetric } from "@mintbot/shared";
import { nowIso } from "@mintbot/shared";
import type { UnlockedWallet } from "../engine/types.js";

export class WalletPerformanceService {
  summarize(wallets: UnlockedWallet[], attempts: MintExecutionAttempt[]): WalletPerformanceMetric[] {
    return wallets.map((wallet) => {
      const walletAttempts = attempts.filter((attempt) => attempt.walletId === wallet.id);

      return {
        walletId: wallet.id,
        address: wallet.address,
        successfulMints: walletAttempts.filter((attempt) => attempt.success).length,
        failedMints: walletAttempts.filter((attempt) => !attempt.success).length,
        totalGasSpentWei: 0n,
        pnlWei: 0n,
        updatedAt: nowIso()
      };
    });
  }
}
