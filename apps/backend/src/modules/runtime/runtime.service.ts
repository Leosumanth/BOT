import { Injectable } from "@nestjs/common";
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
import { AdaptiveFeedbackLoop, MintStrategyEngine, WalletStrategyEngine } from "@mintbot/bot";
import { AppConfigService } from "../../config/app-config.service.js";
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
export class RuntimeService {
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
  readonly flashbots?: FlashbotsBundleClient;

  constructor(
    config: AppConfigService,
    queueService: QueueService
  ) {
    this.rpcRouter = new RpcRouter(config.getRpcEndpoints());
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
    this.flashbots = config.flashbotsAuthPrivateKey
      ? new FlashbotsBundleClient(config.flashbotsRelayUrl, config.flashbotsAuthPrivateKey)
      : undefined;
  }
}
