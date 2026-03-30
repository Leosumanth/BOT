import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from "class-validator";
import type { ApiConfigCreateRequest, ApiConfigUpdateRequest, ApiDraftKeyTestRequest } from "@mintbot/shared";

const PROVIDERS = ["opensea", "etherscan", "drpc", "openai"] as const;
const ENDPOINT_PATTERN = /^https?:\/\/\S+$/i;

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class ApiConfigCreateDto {
  @IsIn(PROVIDERS)
  provider!: ApiConfigCreateRequest["provider"];

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(120)
  label?: ApiConfigCreateRequest["label"];

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  value!: ApiConfigCreateRequest["value"];

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @Matches(ENDPOINT_PATTERN)
  endpointUrl?: ApiConfigCreateRequest["endpointUrl"];

  @IsOptional()
  @IsBoolean()
  enabled?: ApiConfigCreateRequest["enabled"];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  priority?: ApiConfigCreateRequest["priority"];

  @IsOptional()
  @IsBoolean()
  isBackup?: ApiConfigCreateRequest["isBackup"];

  @IsOptional()
  @IsBoolean()
  autoFailover?: ApiConfigCreateRequest["autoFailover"];

  @IsOptional()
  @IsBoolean()
  automationEnabled?: ApiConfigCreateRequest["automationEnabled"];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  maxLatencyMs?: ApiConfigCreateRequest["maxLatencyMs"];

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(2000)
  notes?: ApiConfigCreateRequest["notes"];
}

export class ApiConfigUpdateDto {
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(120)
  label?: ApiConfigUpdateRequest["label"];

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  value?: ApiConfigUpdateRequest["value"];

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @Matches(ENDPOINT_PATTERN)
  endpointUrl?: ApiConfigUpdateRequest["endpointUrl"];

  @IsOptional()
  @IsBoolean()
  enabled?: ApiConfigUpdateRequest["enabled"];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  priority?: ApiConfigUpdateRequest["priority"];

  @IsOptional()
  @IsBoolean()
  isBackup?: ApiConfigUpdateRequest["isBackup"];

  @IsOptional()
  @IsBoolean()
  autoFailover?: ApiConfigUpdateRequest["autoFailover"];

  @IsOptional()
  @IsBoolean()
  automationEnabled?: ApiConfigUpdateRequest["automationEnabled"];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  maxLatencyMs?: ApiConfigUpdateRequest["maxLatencyMs"];

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(2000)
  notes?: ApiConfigUpdateRequest["notes"];
}

export class ApiDraftKeyTestDto {
  @IsIn(PROVIDERS)
  provider!: ApiDraftKeyTestRequest["provider"];

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  value!: ApiDraftKeyTestRequest["value"];
}
