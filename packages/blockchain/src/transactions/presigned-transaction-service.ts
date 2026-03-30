import { ethers } from "ethers";
import { privateKeyToAccount } from "viem/accounts";
import type { GasStrategyResult } from "@mintbot/shared";
import type { BuiltMintTransaction } from "./mint-transaction-builder.js";

export interface PresignParams {
  privateKey: `0x${string}`;
  nonce: number;
  chainId: number;
  gas: bigint;
  transaction: BuiltMintTransaction;
  fees: GasStrategyResult;
}

export class PresignedTransactionService {
  async sign(params: PresignParams): Promise<`0x${string}`> {
    const account = privateKeyToAccount(params.privateKey);

    const signed = await account.signTransaction({
      chainId: params.chainId,
      nonce: params.nonce,
      gas: params.gas,
      maxFeePerGas: params.fees.maxFeePerGas,
      maxPriorityFeePerGas: params.fees.maxPriorityFeePerGas,
      to: params.transaction.to,
      data: params.transaction.data,
      value: params.transaction.value,
      type: "eip1559"
    });

    return signed;
  }

  recoverSigner(rawTransaction: `0x${string}`): string {
    return ethers.Transaction.from(rawTransaction).from ?? ethers.ZeroAddress;
  }
}
