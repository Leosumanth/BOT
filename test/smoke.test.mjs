import assert from "node:assert/strict";
import { createRealtimeAuthToken, extractAdminToken, isExpectedAdminToken, verifyRealtimeAuthToken } from "../apps/backend/dist/auth/auth.utils.js";
import { deserializeMintJob, serializeMintJob } from "../apps/backend/dist/utils/json.js";
import { MintStrategyEngine } from "../packages/bot/dist/strategy/mint-strategy-engine.js";

function run(name, fn) {
  fn();
  console.log(`PASS ${name}`);
}

run("backend auth helpers validate admin and realtime tokens", () => {
  const adminToken = "0123456789abcdef0123456789abcdef";
  const headers = {
    authorization: `Bearer ${adminToken}`
  };
  const realtimeToken = createRealtimeAuthToken(adminToken, 60);

  assert.equal(extractAdminToken(headers), adminToken);
  assert.equal(isExpectedAdminToken(adminToken, adminToken), true);
  assert.equal(isExpectedAdminToken(adminToken, `${adminToken}x`), false);
  assert.equal(verifyRealtimeAuthToken(realtimeToken, adminToken), true);
  assert.equal(verifyRealtimeAuthToken(realtimeToken, `${adminToken}x`), false);
});

run("mint job serialization round-trips bigint fields for the active queue payload format", () => {
  const job = {
    id: "7a4fe7f4-4343-433b-9162-91bfab8da912",
    target: {
      chain: "ethereum",
      contractAddress: "0x1111111111111111111111111111111111111111",
      mintFunction: "mint(uint256)",
      mintArgs: [1],
      quantity: 1,
      valueWei: 1000000000000000n
    },
    walletIds: ["f347f846-89b5-4fe8-b55b-10d4812360d1"],
    gasStrategy: "manual",
    manualGas: {
      maxFeePerGas: 25000000000n,
      maxPriorityFeePerGas: 2000000000n
    },
    policy: {
      simulateFirst: true,
      useFlashbots: true,
      usePresignedTransactions: true,
      maxRetries: 3,
      retryDelayMs: 1500,
      walletConcurrency: 2,
      rpcFailoverBudget: 2
    },
    source: "manual",
    createdAt: "2026-03-30T10:22:33.456Z"
  };

  const roundTripped = deserializeMintJob(serializeMintJob(job));

  assert.equal(roundTripped.target.valueWei, job.target.valueWei);
  assert.equal(roundTripped.manualGas?.maxFeePerGas, job.manualGas?.maxFeePerGas);
  assert.equal(roundTripped.manualGas?.maxPriorityFeePerGas, job.manualGas?.maxPriorityFeePerGas);
  assert.deepEqual(roundTripped.walletIds, job.walletIds);
});

run("strategy decisions explicitly flag heuristic profitability when no live market data exists", () => {
  const engine = new MintStrategyEngine();
  const decision = engine.evaluate({
    job: {
      id: "2b0e2e66-b7d3-4768-8953-e6c518f4cb2d",
      target: {
        chain: "ethereum",
        contractAddress: "0x2222222222222222222222222222222222222222",
        mintFunction: "mint(uint256)",
        mintArgs: [1],
        quantity: 1,
        valueWei: 1000000000000000n
      },
      walletIds: ["c6ee2cab-84b4-4a28-a326-bf43561bf2ff"],
      gasStrategy: "adaptive",
      policy: {
        simulateFirst: true,
        useFlashbots: true,
        usePresignedTransactions: true,
        maxRetries: 2,
        retryDelayMs: 1000,
        walletConcurrency: 1,
        rpcFailoverBudget: 1
      },
      source: "manual",
      createdAt: "2026-03-30T10:22:33.456Z"
    },
    contractAnalysis: {
      contractAddress: "0x2222222222222222222222222222222222222222",
      chain: "ethereum",
      detectedMintFunction: {
        name: "mint",
        signature: "mint(uint256)",
        argsTemplate: [1],
        payable: true,
        score: 0.92
      },
      priceWei: 1000000000000000n,
      maxSupply: 10000n,
      maxPerWallet: 2n,
      abiFragments: [],
      warnings: [],
      scannedAt: "2026-03-30T10:22:33.456Z"
    },
    gasEstimate: 150000n,
    gasRecommendation: {
      chain: "ethereum",
      urgency: "high",
      predictedBaseFeePerGas: 1000000000n,
      competitorP90MaxFeePerGas: 3000000000n,
      competitorP90PriorityFeePerGas: 1000000000n,
      maxFeePerGas: 3000000000n,
      maxPriorityFeePerGas: 1000000000n,
      confidence: 0.8,
      reasoning: ["smoke test"]
    },
    gasPrediction: {
      chain: "ethereum",
      observedAt: "2026-03-30T10:22:33.456Z",
      latestBaseFeePerGas: 1000000000n,
      predictedNextBaseFeePerGas: 1100000000n,
      accelerationScore: 0.4,
      trend: "stable",
      confidence: 0.7
    },
    timing: {
      chain: "ethereum",
      latestBlockNumber: 22000000n,
      averageBlockTimeMs: 12000,
      predictedNextBlockAt: "2026-03-30T10:22:45.456Z",
      msUntilNextBlock: 8000,
      recommendedLeadTimeMs: 4000,
      recommendedDelayMs: 2000,
      confidence: 0.72
    },
    competition: {
      chain: "ethereum",
      contractAddress: "0x2222222222222222222222222222222222222222",
      observedAt: "2026-03-30T10:22:33.456Z",
      pendingTransactions: 6,
      competingWallets: 4,
      whaleWallets: 1,
      waveVelocity: 0.6,
      hypeScore: 0.55,
      medianMaxFeePerGas: 2500000000n,
      p90MaxFeePerGas: 3000000000n,
      medianPriorityFeePerGas: 900000000n,
      p90PriorityFeePerGas: 1000000000n,
      topPriorityFeePerGas: 1200000000n
    },
    chainBias: 0.2,
    walletSuccessRate: 0.8
  });

  assert.match(decision.reason, /^Heuristic opportunity/);
  assert.equal(decision.riskFlags.some((flag) => flag.startsWith("heuristic-profitability:")), true);
  assert.ok(decision.confidence <= 0.92);
});

console.log("Smoke verification completed.");
