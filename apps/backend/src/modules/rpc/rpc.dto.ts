import { BadRequestException } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from "class-validator";
import type { RpcEndpointImportRequest } from "@mintbot/shared";

const CHAIN_KEYS = ["ethereum", "base"] as const;
const TRANSPORTS = ["http", "ws"] as const;
const PROVIDERS = ["alchemy", "quicknode", "custom"] as const;
const HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;
const WS_URL_PATTERN = /^wss?:\/\/\S+$/i;

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class RpcEndpointImportDto {
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(150)
  key?: RpcEndpointImportRequest["key"];

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(120)
  label!: RpcEndpointImportRequest["label"];

  @IsIn(CHAIN_KEYS)
  chain!: RpcEndpointImportRequest["chain"];

  @IsIn(TRANSPORTS)
  transport!: RpcEndpointImportRequest["transport"];

  @IsIn(PROVIDERS)
  provider!: RpcEndpointImportRequest["provider"];

  @Transform(({ value }) => trimString(value))
  @Matches(/^\S+$/)
  url!: RpcEndpointImportRequest["url"];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  priority!: RpcEndpointImportRequest["priority"];

  @IsOptional()
  @IsBoolean()
  enabled?: RpcEndpointImportRequest["enabled"];
}

export function toRpcEndpointImportRequest(dto: RpcEndpointImportDto): RpcEndpointImportRequest {
  const urlPattern = dto.transport === "ws" ? WS_URL_PATTERN : HTTP_URL_PATTERN;
  if (!urlPattern.test(dto.url)) {
    throw new BadRequestException(
      dto.transport === "ws" ? "WebSocket RPC URLs must start with ws:// or wss://." : "HTTP RPC URLs must start with http:// or https://."
    );
  }

  return {
    key: dto.key || undefined,
    label: dto.label,
    chain: dto.chain,
    transport: dto.transport,
    provider: dto.provider,
    url: dto.url,
    priority: dto.priority,
    enabled: dto.enabled
  };
}
