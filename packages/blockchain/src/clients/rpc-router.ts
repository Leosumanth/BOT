import type { PublicClient, Transport, WalletClient } from "viem";
import { createPublicClient, createWalletClient, http, webSocket } from "viem";
import type { RpcEndpointConfig, RpcHealthSnapshot } from "@mintbot/shared";
import { nowIso } from "@mintbot/shared";
import type { ChainKey } from "@mintbot/shared";
import { resolveViemChain } from "./chain-registry.js";

interface EndpointRuntime {
  config: RpcEndpointConfig;
  publicClient: PublicClient<Transport>;
  walletClient: WalletClient<Transport>;
  health: RpcHealthSnapshot;
}

export class RpcRouter {
  private readonly endpoints = new Map<string, EndpointRuntime>();

  constructor(configs: RpcEndpointConfig[]) {
    for (const config of configs.filter((entry) => entry.enabled)) {
      const transport = config.transport === "ws" ? webSocket(config.url) : http(config.url, { retryCount: 0 });
      const chain = resolveViemChain(config.chain);
      this.endpoints.set(config.key, {
        config,
        publicClient: createPublicClient({ chain, transport }),
        walletClient: createWalletClient({ chain, transport }),
        health: {
          endpointKey: config.key,
          latencyMs: Number.POSITIVE_INFINITY,
          successRate: 1,
          failureCount: 0,
          lastCheckedAt: nowIso(),
          live: true
        }
      });
    }
  }

  getHealthSnapshot(chain?: ChainKey): RpcHealthSnapshot[] {
    return [...this.endpoints.values()]
      .filter((entry) => !chain || entry.config.chain === chain)
      .map((entry) => ({ ...entry.health }));
  }

  getConfigs(chain?: ChainKey, transport?: RpcEndpointConfig["transport"]): RpcEndpointConfig[] {
    return [...this.endpoints.values()]
      .filter((entry) => !chain || entry.config.chain === chain)
      .filter((entry) => !transport || entry.config.transport === transport)
      .map((entry) => entry.config);
  }

  async warm(chain?: ChainKey): Promise<RpcHealthSnapshot[]> {
    const runtimes = [...this.endpoints.values()].filter((entry) => !chain || entry.config.chain === chain);

    await Promise.all(
      runtimes.map(async (runtime) => {
        const startedAt = performance.now();

        try {
          await runtime.publicClient.getBlockNumber();
          runtime.health.latencyMs = Math.round(performance.now() - startedAt);
          runtime.health.successRate = Math.min(1, runtime.health.successRate + 0.02);
          runtime.health.live = true;
        } catch {
          runtime.health.failureCount += 1;
          runtime.health.successRate = Math.max(0, runtime.health.successRate - 0.15);
          runtime.health.live = false;
        } finally {
          runtime.health.lastCheckedAt = nowIso();
        }
      })
    );

    return this.getHealthSnapshot(chain);
  }

  getPreferredPublicClient(chain: ChainKey, transport?: RpcEndpointConfig["transport"]): PublicClient<Transport> {
    const runtime = this.getPreferredRuntime(chain, transport);
    return runtime.publicClient;
  }

  getPreferredWalletClient(chain: ChainKey, transport?: RpcEndpointConfig["transport"]): WalletClient<Transport> {
    const runtime = this.getPreferredRuntime(chain, transport);
    return runtime.walletClient;
  }

  async executeWithFailover<T>(
    chain: ChainKey,
    fn: (runtime: EndpointRuntime) => Promise<T>,
    transport?: RpcEndpointConfig["transport"]
  ): Promise<T> {
    const candidates = this.sortCandidates(chain, transport);
    const errors: string[] = [];

    for (const runtime of candidates) {
      const startedAt = performance.now();

      try {
        const result = await fn(runtime);
        runtime.health.latencyMs = Math.round(performance.now() - startedAt);
        runtime.health.successRate = Math.min(1, runtime.health.successRate + 0.04);
        runtime.health.live = true;
        runtime.health.lastCheckedAt = nowIso();
        return result;
      } catch (error) {
        runtime.health.failureCount += 1;
        runtime.health.successRate = Math.max(0, runtime.health.successRate - 0.2);
        runtime.health.live = false;
        runtime.health.lastCheckedAt = nowIso();
        errors.push(`${runtime.config.label}: ${error instanceof Error ? error.message : "Unknown RPC failure"}`);
      }
    }

    throw new Error(`All RPC endpoints failed for ${chain}. ${errors.join(" | ")}`);
  }

  private getPreferredRuntime(chain: ChainKey, transport?: RpcEndpointConfig["transport"]): EndpointRuntime {
    const runtime = this.sortCandidates(chain, transport)[0];
    if (!runtime) {
      throw new Error(`No RPC endpoints registered for ${chain}${transport ? ` (${transport})` : ""}`);
    }

    return runtime;
  }

  private sortCandidates(chain: ChainKey, transport?: RpcEndpointConfig["transport"]): EndpointRuntime[] {
    return [...this.endpoints.values()]
      .filter((entry) => entry.config.chain === chain)
      .filter((entry) => !transport || entry.config.transport === transport)
      .sort((left, right) => {
        const leftScore = this.scoreRuntime(left);
        const rightScore = this.scoreRuntime(right);
        return rightScore - leftScore;
      });
  }

  private scoreRuntime(runtime: EndpointRuntime): number {
    const latencyScore = Number.isFinite(runtime.health.latencyMs) ? 1000 / Math.max(runtime.health.latencyMs, 1) : 0;
    const availabilityScore = runtime.health.live ? 20 : 0;
    const priorityScore = Math.max(0, 10 - runtime.config.priority);
    return latencyScore + availabilityScore + priorityScore + runtime.health.successRate * 100 - runtime.health.failureCount * 5;
  }
}
