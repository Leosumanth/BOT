import { base, mainnet, type Chain } from "viem/chains";
import type { ChainKey } from "@mintbot/shared";

export function resolveViemChain(chain: ChainKey): Chain {
  switch (chain) {
    case "base":
      return base;
    case "ethereum":
    default:
      return mainnet;
  }
}
