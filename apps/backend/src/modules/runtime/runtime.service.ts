import { Injectable } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import {
  BlockTimingEngine,
  CompetitionAnalyzer,
  ContractAnalyzer,
  Eip1559GasStrategy,
  FlashbotsBundleClient,
  MintTransactionBuilder,
  NonceManager,
  PredictiveGasModel,
  PresignedTransactionService,
  RpcRouter
} from "@mintbot/blockchain";
import type { NonceStore } from "@mintbot/blockchain";
import type { RpcEndpointConfig } from "@mintbot/shared";
import { AdaptiveFeedbackLoop, MintStrategyEngine, WalletStrategyEngine } from "@mintbot/bot";
import { AppConfigService } from "../../config/app-config.service.js";
import { DatabaseService } from "../../database/database.service.js";
import { QueueService } from "../queues/queue.service.js";

class RedisNonceStore implements NonceStore {
  constructor(private readonly queueService: QueueService) {}

  async get(key: string): Promise<string | null> {
    return this.queueService.redis.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.queueService.redis.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.queueService.redis.del(key);
  }
}

@Injectable()
export class RuntimeService implements OnModuleInit {
  readonly rpcRouter: RpcRouter;
  readonly analyzer: ContractAnalyzer;
  readonly blockTiming: BlockTimingEngine;
  readonly gasPredictor: PredictiveGasModel;
  readonly competitionAnalyzer: CompetitionAnalyzer;
  readonly gasStrategy: Eip1559GasStrategy;
  readonly nonceManager: NonceManager;
  readonly transactionBuilder: MintTransactionBuilder;
  readonly presignedTransactions: PresignedTransactionService;
  readonly feedbackLoop: AdaptiveFeedbackLoop;
  readonly walletStrategy: WalletStrategyEngine;
  readonly mintStrategy: MintStrategyEngine;
  flashbots?: FlashbotsBundleClient;

  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService,
    queueService: QueueService
  ) {
    const envRpcEndpoints = config.getRpcEndpoints();
    this.rpcRouter = new RpcRouter(envRpcEndpoints);
    this.analyzer = new ContractAnalyzer(this.rpcRouter);
    this.blockTiming = new BlockTimingEngine();
    this.gasPredictor = new PredictiveGasModel();
    this.competitionAnalyzer = new CompetitionAnalyzer();
    this.gasStrategy = new Eip1559GasStrategy();
    this.nonceManager = new NonceManager(new RedisNonceStore(queueService));
    this.transactionBuilder = new MintTransactionBuilder(this.rpcRouter);
    this.presignedTransactions = new PresignedTransactionService();
    this.feedbackLoop = new AdaptiveFeedbackLoop();
    this.walletStrategy = new WalletStrategyEngine();
    this.mintStrategy = new MintStrategyEngine();
    const flashbotsConfig = config.getFlashbotsConfig();
    this.flashbots = flashbotsConfig.relayUrl && flashbotsConfig.authPrivateKey
      ? new FlashbotsBundleClient(flashbotsConfig.relayUrl, flashbotsConfig.authPrivateKey)
      : undefined;
  }

  async onModuleInit(): Promise<void> {
    await this.database.ensureSchema();
    const customEndpoints = await this.database.listRpcEndpoints();
    for (const endpoint of customEndpoints) {
      this.rpcRouter.upsertConfig(endpoint);
    }
  }

  isEnvRpcKey(key: string): boolean {
    return this.config.getRpcEndpoints().some((endpoint) => endpoint.key === key);
  }

  async saveCustomRpcEndpoint(endpoint: RpcEndpointConfig): Promise<void> {
    await this.database.upsertRpcEndpoint(endpoint);
    this.rpcRouter.upsertConfig(endpoint);
  }

  async deleteCustomRpcEndpoint(key: string): Promise<boolean> {
    if (this.isEnvRpcKey(key)) {
      return false;
    }

    const removed = await this.database.deleteRpcEndpoint(key);
    if (removed) {
      this.rpcRouter.removeConfig(key);
    }

    return removed;
  }
}
