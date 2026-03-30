import { Transform } from "class-transformer";
import { IsIn, Matches } from "class-validator";
import type { ContractAnalyzerRequest } from "@mintbot/shared";

const CHAIN_KEYS = ["ethereum", "base"] as const;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class ContractAnalyzerDto {
  @IsIn(CHAIN_KEYS)
  chain!: ContractAnalyzerRequest["chain"];

  @Transform(({ value }) => trimString(value))
  @Matches(ADDRESS_PATTERN)
  contractAddress!: ContractAnalyzerRequest["contractAddress"];
}
