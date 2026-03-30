import { BadRequestException, Injectable } from "@nestjs/common";
import type { RpcEndpointConfig, RpcEndpointImportRequest, RpcEndpointRecord, RpcManagementResponse } from "@mintbot/shared";
import { SUPPORTED_CHAINS } from "@mintbot/shared";
import { RuntimeService } from "../runtime/runtime.service.js";
import { DatabaseService } from "../../database/database.service.js";

@Injectable()
export class RpcService {
  constructor(
    private readonly runtime: RuntimeService,
    private readonly database: DatabaseService
  ) {}

  async list(): Promise<RpcManagementResponse> {
    const storedEndpoints = await this.database.listRpcEndpoints();
    const storedMap = new Map(storedEndpoints.map((endpoint) => [endpoint.key, endpoint]));
    const endpoints: RpcEndpointRecord[] = this.runtime.rpcRouter
      .getConfigs()
      .map((endpoint) => {
        const stored = storedMap.get(endpoint.key);
        return stored
          ? {
              ...endpoint,
              source: "database" as const,
              createdAt: stored.createdAt,
              updatedAt: stored.updatedAt
            }
          : {
              ...endpoint,
              source: "env" as const
            };
      })
      .sort((left, right) => left.chain.localeCompare(right.chain) || left.transport.localeCompare(right.transport) || left.priority - right.priority);

    return {
      endpoints,
      health: this.runtime.rpcRouter.getHealthSnapshot(),
      rankings: SUPPORTED_CHAINS.flatMap((chain) =>
        (["http", "ws"] as const).map((transport) => ({
          chain: chain.key,
          transport,
          endpointKeys: this.runtime.rpcRouter.getRankedConfigs(chain.key, transport).map((entry) => entry.key)
        }))
      )
    };
  }

  async create(request: RpcEndpointImportRequest): Promise<RpcEndpointRecord> {
    const endpoint: RpcEndpointConfig = {
      key: this.buildKey(request),
      label: request.label.trim(),
      chain: request.chain,
      transport: request.transport,
      provider: request.provider,
      url: request.url.trim(),
      priority: request.priority,
      enabled: request.enabled ?? true
    };

    if (!endpoint.label || !endpoint.url) {
      throw new BadRequestException("RPC label and URL are required.");
    }

    const record = await this.database.upsertRpcEndpoint(endpoint);
    this.runtime.rpcRouter.upsertConfig(record);
    return record;
  }

  async warm(): Promise<RpcManagementResponse> {
    await this.runtime.rpcRouter.warm();
    return this.list();
  }

  async remove(key: string): Promise<{ removed: boolean }> {
    if (this.runtime.isEnvRpcKey(key)) {
      throw new BadRequestException("Environment-backed RPC endpoints are read-only from the dashboard.");
    }

    return {
      removed: await this.runtime.deleteCustomRpcEndpoint(key)
    };
  }

  private buildKey(request: RpcEndpointImportRequest): string {
    if (request.key?.trim()) {
      return request.key.trim();
    }

    const slug = request.label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return `custom-${request.chain}-${request.transport}-${slug || Date.now().toString(36)}`;
  }
}
