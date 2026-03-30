export type ChainKey = "ethereum" | "base";

export interface SupportedChainDefinition {
  key: ChainKey;
  id: number;
  label: string;
  nativeCurrency: string;
  blockExplorer: string;
}

export const SUPPORTED_CHAINS: SupportedChainDefinition[] = [
  {
    key: "ethereum",
    id: 1,
    label: "Ethereum",
    nativeCurrency: "ETH",
    blockExplorer: "https://etherscan.io"
  },
  {
    key: "base",
    id: 8453,
    label: "Base",
    nativeCurrency: "ETH",
    blockExplorer: "https://basescan.org"
  }
];

export const CHAIN_LOOKUP = Object.fromEntries(SUPPORTED_CHAINS.map((chain) => [chain.key, chain])) as Record<
  ChainKey,
  SupportedChainDefinition
>;
