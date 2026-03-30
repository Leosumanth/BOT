import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import type { WalletUpdateRequest, WalletUpsertRequest } from "@mintbot/shared";

const CHAIN_KEYS = ["ethereum", "base"] as const;
const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class WalletUpsertDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: WalletUpsertRequest["label"];

  @Transform(({ value }) => trimString(value))
  @Matches(PRIVATE_KEY_PATTERN)
  privateKey!: WalletUpsertRequest["privateKey"];

  @IsIn(CHAIN_KEYS)
  chain!: WalletUpsertRequest["chain"];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

export class WalletUpdateDto {
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: WalletUpdateRequest["label"];

  @IsOptional()
  @IsBoolean()
  enabled?: WalletUpdateRequest["enabled"];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
