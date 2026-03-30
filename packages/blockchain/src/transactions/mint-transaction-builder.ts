import { parseAbi, encodeFunctionData } from "viem";
import type { ChainKey, MintTargetConfig } from "@mintbot/shared";
import { RpcRouter } from "../clients/rpc-router.js";

export interface BuiltMintTransaction {
  chain: ChainKey;
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
  gasEstimate: bigint;
}

export class MintTransactionBuilder {
  constructor(private readonly rpcRouter: RpcRouter) {}

  async build(target: MintTargetConfig): Promise<BuiltMintTransaction> {
    const signature = target.mintFunction ?? "function mint(uint256 quantity)";
    const abi = parseAbi([signature]);
    const functionName = signature.match(/function\s+([^(]+)/)?.[1] as string | undefined;

    if (!functionName) {
      throw new Error(`Unable to infer function name from signature: ${signature}`);
    }

    const data = encodeFunctionData({
      abi: abi as any,
      functionName: functionName as any,
      args: target.mintArgs as never
    });

    const gasEstimate = await this.rpcRouter.executeWithFailover(target.chain, (runtime) =>
      runtime.publicClient.estimateGas({
        to: target.contractAddress,
        data,
        value: target.valueWei ?? 0n
      })
    );

    return {
      chain: target.chain,
      to: target.contractAddress,
      data,
      value: target.valueWei ?? 0n,
      gasEstimate
    };
  }
}
