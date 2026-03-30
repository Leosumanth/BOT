import { id } from "ethers";

export const MINT_FUNCTION_SIGNATURES = [
  "function mint(uint256 quantity)",
  "function mint(uint256 quantity, bytes32[] proof)",
  "function mint(address to, uint256 quantity)",
  "function mintPublic(uint256 quantity)",
  "function publicMint(uint256 quantity)",
  "function saleMint(uint256 quantity)",
  "function mintTo(address to, uint256 quantity)"
];

export const PRICE_FUNCTION_SIGNATURES = [
  "function mintPrice() view returns (uint256)",
  "function publicSalePrice() view returns (uint256)",
  "function price() view returns (uint256)",
  "function cost() view returns (uint256)"
];

export const SUPPLY_FUNCTION_SIGNATURES = [
  "function maxSupply() view returns (uint256)",
  "function collectionSize() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function maxPerWallet() view returns (uint256)"
];

export function selectorFor(signature: string): string {
  return id(signature).slice(0, 10);
}
