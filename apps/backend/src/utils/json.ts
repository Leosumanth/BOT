import type { MintJobInput } from "@mintbot/shared";

export function toJsonSafe<T>(value: T): T {
  if (typeof value === "bigint") {
    return value.toString() as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJsonSafe(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)])
    ) as T;
  }

  return value;
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(toJsonSafe(value));
}

export function serializeMintJob(job: MintJobInput): Record<string, unknown> {
  return toJsonSafe(job) as Record<string, unknown>;
}

export function deserializeMintJob(payload: Record<string, any>): MintJobInput {
  return {
    ...payload,
    target: {
      ...payload.target,
      valueWei: payload.target?.valueWei ? BigInt(payload.target.valueWei) : undefined
    },
    manualGas: payload.manualGas
      ? {
          maxFeePerGas: BigInt(payload.manualGas.maxFeePerGas),
          maxPriorityFeePerGas: BigInt(payload.manualGas.maxPriorityFeePerGas)
        }
      : undefined
  } as MintJobInput;
}
