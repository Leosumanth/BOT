import { BadRequestException } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Min, ValidateNested } from "class-validator";
import type { MintJobInput, StartBotRequest, StopBotRequest } from "@mintbot/shared";

const CHAIN_KEYS = ["ethereum", "base"] as const;
const GAS_STRATEGIES = ["adaptive", "aggressive", "manual"] as const;
const JOB_SOURCES = ["manual", "mempool", "tracker", "auto-analyzer"] as const;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const BIGINT_STRING_PATTERN = /^\d+$/;

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class MintTargetDto {
  @IsIn(CHAIN_KEYS)
  chain!: MintJobInput["target"]["chain"];

  @Transform(({ value }) => trimString(value))
  @Matches(ADDRESS_PATTERN)
  contractAddress!: MintJobInput["target"]["contractAddress"];

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  collectionSlug?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  mintFunction?: string;

  @IsArray()
  mintArgs!: unknown[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @Matches(BIGINT_STRING_PATTERN)
  valueWei?: string;
}

export class ManualGasDto {
  @Transform(({ value }) => trimString(value))
  @Matches(BIGINT_STRING_PATTERN)
  maxFeePerGas!: string;

  @Transform(({ value }) => trimString(value))
  @Matches(BIGINT_STRING_PATTERN)
  maxPriorityFeePerGas!: string;
}

export class MintExecutionPolicyDto {
  @IsBoolean()
  simulateFirst!: boolean;

  @IsBoolean()
  useFlashbots!: boolean;

  @IsBoolean()
  usePresignedTransactions!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRetries!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  retryDelayMs!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  walletConcurrency!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  rpcFailoverBudget!: number;
}

export class MintJobDto {
  @IsUUID()
  id!: string;

  @ValidateNested()
  @Type(() => MintTargetDto)
  target!: MintTargetDto;

  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("4", { each: true })
  walletIds!: string[];

  @IsIn(GAS_STRATEGIES)
  gasStrategy!: MintJobInput["gasStrategy"];

  @IsOptional()
  @ValidateNested()
  @Type(() => ManualGasDto)
  manualGas?: ManualGasDto;

  @ValidateNested()
  @Type(() => MintExecutionPolicyDto)
  policy!: MintExecutionPolicyDto;

  @IsIn(JOB_SOURCES)
  source!: MintJobInput["source"];

  @IsDateString()
  createdAt!: string;
}

export class StartBotRequestDto {
  @ValidateNested()
  @Type(() => MintJobDto)
  job!: MintJobDto;
}

export class StopBotRequestDto {
  @IsUUID()
  jobId!: string;
}

export function toStartBotRequest(dto: StartBotRequestDto): StartBotRequest {
  if (dto.job.gasStrategy === "manual" && !dto.job.manualGas) {
    throw new BadRequestException("Manual gas settings are required when gasStrategy is manual.");
  }

  if (dto.job.gasStrategy !== "manual" && dto.job.manualGas) {
    throw new BadRequestException("manualGas can only be provided when gasStrategy is manual.");
  }

  return {
    job: {
      id: dto.job.id,
      target: {
        chain: dto.job.target.chain,
        contractAddress: dto.job.target.contractAddress,
        collectionSlug: dto.job.target.collectionSlug || undefined,
        mintFunction: dto.job.target.mintFunction || undefined,
        mintArgs: dto.job.target.mintArgs,
        quantity: dto.job.target.quantity,
        valueWei: dto.job.target.valueWei ? BigInt(dto.job.target.valueWei) : undefined
      },
      walletIds: [...dto.job.walletIds],
      gasStrategy: dto.job.gasStrategy,
      manualGas: dto.job.manualGas
        ? {
            maxFeePerGas: BigInt(dto.job.manualGas.maxFeePerGas),
            maxPriorityFeePerGas: BigInt(dto.job.manualGas.maxPriorityFeePerGas)
          }
        : undefined,
      policy: {
        simulateFirst: dto.job.policy.simulateFirst,
        useFlashbots: dto.job.policy.useFlashbots,
        usePresignedTransactions: dto.job.policy.usePresignedTransactions,
        maxRetries: dto.job.policy.maxRetries,
        retryDelayMs: dto.job.policy.retryDelayMs,
        walletConcurrency: dto.job.policy.walletConcurrency,
        rpcFailoverBudget: dto.job.policy.rpcFailoverBudget
      },
      source: dto.job.source,
      createdAt: dto.job.createdAt
    }
  };
}

export function toStopBotRequest(dto: StopBotRequestDto): StopBotRequest {
  return {
    jobId: dto.jobId
  };
}
