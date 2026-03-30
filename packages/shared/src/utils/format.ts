export function bigintToHex(value: bigint): `0x${string}` {
  return `0x${value.toString(16)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
