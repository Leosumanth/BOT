import type { ChainKey } from "@mintbot/shared";

export interface NonceStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export class NonceManager {
  private readonly inFlight = new Map<string, number>();

  constructor(private readonly store: NonceStore) {}

  async reserveNonce(params: {
    chain: ChainKey;
    address: `0x${string}`;
    fetchFromChain: () => Promise<number>;
  }): Promise<number> {
    const key = this.key(params.chain, params.address);
    const localNonce = this.inFlight.get(key);

    if (typeof localNonce === "number") {
      const next = localNonce + 1;
      this.inFlight.set(key, next);
      await this.store.set(key, String(next));
      return localNonce;
    }

    const stored = await this.store.get(key);
    const chainNonce = await params.fetchFromChain();
    const nextNonce = stored ? Math.max(Number(stored), chainNonce) : chainNonce;

    this.inFlight.set(key, nextNonce + 1);
    await this.store.set(key, String(nextNonce + 1));
    return nextNonce;
  }

  async reset(chain: ChainKey, address: `0x${string}`): Promise<void> {
    const key = this.key(chain, address);
    this.inFlight.delete(key);
    await this.store.del(key);
  }

  private key(chain: ChainKey, address: `0x${string}`): string {
    return `nonce:${chain}:${address.toLowerCase()}`;
  }
}
