import type { PendingMintActivity, ChainKey } from "@mintbot/shared";
import { nowIso } from "@mintbot/shared";
import { ContractAnalyzer } from "../analyzer/contract-analyzer.js";
import { RpcRouter } from "../clients/rpc-router.js";

export class MempoolListener {
  private readonly unwatchers: Array<() => void> = [];

  constructor(
    private readonly rpcRouter: RpcRouter,
    private readonly analyzer: ContractAnalyzer
  ) {}

  start(chain: ChainKey, onActivity: (activity: PendingMintActivity) => Promise<void> | void): void {
    const client = this.rpcRouter.getPreferredPublicClient(chain, "ws");

    const unwatch = client.watchPendingTransactions({
      onTransactions: async (hashes) => {
        for (const hash of hashes) {
          try {
            const tx = await client.getTransaction({ hash });
            if (!tx.to || !tx.input || tx.input === "0x") {
              continue;
            }

            const decoded = this.analyzer.decodeCalldata(tx.input);
            if (!decoded.candidate) {
              continue;
            }

            await onActivity({
              chain,
              txHash: hash,
              from: tx.from,
              to: tx.to,
              valueWei: tx.value,
              selector: tx.input.slice(0, 10) as `0x${string}`,
              nonce: tx.nonce,
              gasLimit: tx.gas,
              gasPriceWei: tx.gasPrice ?? null,
              maxFeePerGas: tx.maxFeePerGas ?? null,
              maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? null,
              detectedAt: nowIso(),
              confidence: decoded.candidate.score / 100
            });
          } catch {
            continue;
          }
        }
      }
    });

    this.unwatchers.push(unwatch);
  }

  stop(): void {
    while (this.unwatchers.length) {
      const unwatch = this.unwatchers.pop();
      unwatch?.();
    }
  }
}
