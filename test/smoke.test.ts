const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveStartMode } = require("../src/start");
const security = require("../src/security");
const claims = require("../src/claims");
const mintAutomation = require("../src/mint-automation");
const {
  buildDiscoveryPlan,
  humanizeSlug,
  resolveMintSourceAdapter
} = require("../src/mint-source-adapters");
const mintSources = require("../src/mint-sources");
const integrations = require("../src/integrations");
const { simulateMintMethod } = require("../src/bot");
const { normalizeConfig } = require("../src/config");
const { createDefaultPersistentState, normalizePersistentState } = require("../src/database");
const { createIdleRunState, createRedisCoordinator, resolveQueueConfig } = require("../src/queue");
const { resolveHost, resolvePort } = require("../src/server");
const {
  applyMintAutofillToTask,
  extractOpenSeaCollectionSlug,
  parseOpenSeaMintRadarEntries,
  seaDropContractAddressForChain
} = require("../src/dashboard-server");

const sampleAbi = [
  {
    type: "function",
    name: "publicMint",
    stateMutability: "payable",
    inputs: [{ name: "quantity", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "saleActive",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "publicSalePrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  }
];

function withEnv(overrides, work) {
  const originalValues = new Map();

  for (const [key, value] of Object.entries(overrides)) {
    originalValues.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return work();
  } finally {
    for (const [key, value] of originalValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("start mode resolution chooses dashboard for hosted UI envs", () => {
  assert.equal(resolveStartMode({ PORT: "3000" }), "dashboard");
  assert.equal(resolveStartMode({ BOT_MODE: "worker" }), "worker");
  assert.equal(
    resolveStartMode({
      RPC_URL: "https://rpc.example",
      PRIVATE_KEY: `0x${"11".repeat(32)}`,
      CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111"
    }),
    "bot"
  );
});

test("security helpers encrypt, decrypt, hash, and verify secrets", () => {
  withEnv({ ENCRYPTION_KEY: "smoke-test-encryption-key" }, () => {
    const ciphertext = security.encryptSecret("super-secret");
    assert.match(ciphertext, /^v1\./);
    assert.equal(security.decryptSecret(ciphertext), "super-secret");
  });

  const passwordHash = security.hashPassword("hunter2");
  assert.equal(security.verifyPassword("hunter2", passwordHash), true);
  assert.equal(security.verifyPassword("wrong-password", passwordHash), false);
  assert.equal(security.hashToken("abc123").length, 64);
  assert.ok(security.generateSessionToken().length >= 40);
});

test("claim helpers resolve wallet records, mappings, templates, and cookies", () => {
  const walletClaims = {
    default: { proof: ["0xabc"], nested: { tier: "public" } },
    "0x1111111111111111111111111111111111111111": { allowance: 2 }
  };

  const resolvedRecord = claims.resolveWalletClaimRecord(walletClaims, {
    walletAddress: "0x1111111111111111111111111111111111111111"
  });
  assert.deepEqual(resolvedRecord, { allowance: 2 });

  const mapped = claims.extractMappedClaimRecord(
    {
      data: {
        merkle: { proof: ["0x1", "0x2"] },
        maxMint: 3
      }
    },
    {
      proof: "merkle.proof",
      quantity: "maxMint"
    },
    "data"
  );
  assert.deepEqual(mapped, { proof: ["0x1", "0x2"], quantity: 3 });

  const merged = claims.mergeClaimRecords(
    { nested: { proof: ["0xabc"] }, allow: 1 },
    { nested: { signature: "0xsig" }, allow: 2 }
  );
  assert.deepEqual(merged, {
    nested: { proof: ["0xabc"], signature: "0xsig" },
    allow: 2
  });

  const templated = claims.applyTemplatePlaceholders(
    {
      recipient: "{{wallet}}",
      label: "wallet {{walletIndex}} / {{project}}"
    },
    {
      walletAddress: "0x1111111111111111111111111111111111111111",
      walletIndex: 2,
      projectKey: "mint-pass"
    }
  );
  assert.deepEqual(templated, {
    recipient: "0x1111111111111111111111111111111111111111",
    label: "wallet 2 / mint-pass"
  });

  assert.equal(
    claims.buildCookieHeader({ session: "abc", theme: "dark" }),
    "session=abc; theme=dark"
  );
  assert.equal(
    claims.hasClaimAutomation({
      claimIntegrationEnabled: true,
      walletClaims: { default: { proof: ["0xabc"] } }
    }),
    true
  );
});

test("mint automation detects a mint function and infers placeholder args", () => {
  const analysis = mintAutomation.buildMintFunctionAnalysis(sampleAbi);
  assert.equal(analysis.bestCandidate?.name, "publicMint");
  assert.deepEqual(analysis.detectedFunctions, ["publicMint"]);

  const resolved = mintAutomation.resolveMintFunctionFromAbi(sampleAbi, "");
  assert.equal(resolved.mintFunction, "publicMint");

  const args = mintAutomation.inferMintArgsFromAbi(sampleAbi, "publicMint", {
    quantity: 2,
    walletAddress: "0x1111111111111111111111111111111111111111"
  });
  assert.deepEqual(args, [2]);

  const startDetection = mintAutomation.detectMintStartFunctionsFromAbi(sampleAbi);
  assert.equal(startDetection.saleActiveFunction, "saleActive");
  assert.equal(startDetection.enabled, true);
});

test("mint source adapters and selection normalize marketplace targets", async () => {
  assert.equal(buildDiscoveryPlan("opensea").steps[0], "official_api");
  assert.equal(humanizeSlug("mint-pass_v2"), "Mint Pass V2");

  const openseaContext = resolveMintSourceAdapter("opensea", {
    sourceTarget: "https://opensea.io/collection/test-drop?tab=overview",
    sourceStage: "public"
  });
  assert.equal(openseaContext.valid, true);
  assert.equal(openseaContext.projectSlug, "test-drop");
  assert.equal(openseaContext.canonicalUrl, "https://opensea.io/collection/test-drop");

  const selection = mintSources.normalizeMintSourceSelection({
    sourceType: "opensea",
    sourceTarget: "https://opensea.io/collection/test-drop",
    sourceStage: "allowlist",
    sourceConfig: { authMode: "session_cookie" }
  });
  assert.equal(selection.sourceType, "opensea");
  assert.equal(selection.sourceStage, "allowlist");
  assert.equal(selection.sourceContext.projectSlug, "test-drop");
  assert.equal(selection.sourceConfig.authMode, "session_cookie");

  assert.doesNotThrow(() => {
    mintSources.validateMintSourceSelection("opensea", selection);
  });

  const preparedConfig = await mintSources.prepareMintSourceConfig(
    {
      sourceType: "opensea",
      sourceTarget: "https://opensea.io/collection/test-drop",
      sourceStage: "public",
      sourceConfig: { authMode: "session_cookie" }
    },
    {
      logger: { info() {} }
    }
  );
  assert.equal(preparedConfig.sourceSummary.includes("OpenSea"), true);
  assert.equal(preparedConfig.sourceProjectSlug, "test-drop");
});

test("integration helpers normalize settings and OpenSea payloads", () => {
  const normalizedCollection = integrations.normalizeOpenSeaCollection(
    {
      collection: "test-drop",
      name: "Test Drop",
      contracts: [
        {
          address: "0x1111111111111111111111111111111111111111",
          chain: "ethereum",
          name: "Drop",
          standard: "erc721"
        },
        {
          address: "0x1111111111111111111111111111111111111111",
          chain: "ethereum",
          name: "Drop",
          standard: "erc721"
        }
      ]
    },
    { slug: "fallback-slug" }
  );

  assert.equal(normalizedCollection.slug, "test-drop");
  assert.equal(normalizedCollection.contracts.length, 1);

  const clientSettings = withEnv(
    {
      OPENAI_API_KEY: "env-openai-key",
      ETHERSCAN_API_KEY: undefined
    },
    () =>
      integrations.buildClientSettings(
        { profileName: "qa", theme: "custom", resultsPath: "./dist/results.json" },
        { explorerApiKey: "saved-explorer-key" },
        {
          explorerApiKey: { status: "healthy", checkedAt: "2026-03-28T00:00:00.000Z" },
          openaiApiKey: { status: "healthy" }
        }
      )
  );

  assert.equal(clientSettings.explorerApiKeyConfigured, true);
  assert.equal(clientSettings.explorerApiKeySource, "saved");
  assert.equal(clientSettings.openaiApiKeyConfigured, true);
  assert.equal(clientSettings.openaiApiKeySource, "env");
});

test("config normalization accepts realistic test data and auto-detects ABI behavior", () => {
  const normalized = normalizeConfig({
    RPC_URL: "https://example-rpc.local",
    PRIVATE_KEY: `0x${"11".repeat(32)}`,
    CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111",
    ABI_JSON: JSON.stringify(sampleAbi),
    CHAIN_KEY: "base",
    SOURCE_TYPE: "opensea",
    SOURCE_TARGET: "https://opensea.io/collection/test-drop",
    SOURCE_STAGE: "public",
    QUANTITY_PER_WALLET: "2",
    MINT_VALUE_ETH: "0.02",
    WAIT_FOR_RECEIPT: "true",
    SIMULATE_TRANSACTION: "true",
    DRY_RUN: "true",
    TX_TIMEOUT_MS: "30000",
    READY_CHECK_ARGS: "[]"
  });

  assert.equal(normalized.mintFunction, "publicMint");
  assert.deepEqual(normalized.detectedMintFunctions, ["publicMint"]);
  assert.equal(normalized.sourceProjectSlug, "test-drop");
  assert.equal(normalized.quantityPerWallet, 2);
  assert.equal(normalized.dryRun, true);
  assert.equal(normalized.mintStartDetectionEnabled, true);
});

test("database and queue helpers normalize local state safely", async () => {
  assert.deepEqual(createDefaultPersistentState(), {
    tasks: [],
    rpcNodes: [],
    settings: {
      profileName: "local",
      theme: "quantum-operator",
      resultsPath: "./dist/mint-results.json"
    }
  });

  assert.deepEqual(normalizePersistentState({ tasks: "bad", rpcNodes: null, settings: {} }), {
    tasks: [],
    rpcNodes: [],
    settings: {
      profileName: "local",
      theme: "quantum-operator",
      resultsPath: "./dist/mint-results.json"
    }
  });

  assert.throws(() => {
    withEnv({ DATABASE_URL: undefined }, () => require("../src/database").createDatabase());
  }, /DATABASE_URL is required/);

  const queueConfig = resolveQueueConfig({
    QUEUE_MODE: "redis",
    REDIS_URL: "redis://127.0.0.1:6379",
    REDIS_NAMESPACE: "qa"
  });
  assert.equal(queueConfig.enabled, true);
  assert.equal(queueConfig.queueKey, "qa:queue");

  const idleState = createIdleRunState(queueConfig);
  assert.equal(idleState.queueMode, "redis");
  assert.deepEqual(idleState.queuedTaskIds, []);

  const localCoordinator = await createRedisCoordinator(resolveQueueConfig({ QUEUE_MODE: "local" }));
  assert.equal(localCoordinator.enabled, false);
  assert.deepEqual(await localCoordinator.listQueuedJobs(), []);
});

test("server host/port helpers honor env fallbacks", () => {
  withEnv({ HOST: undefined, PORT: undefined }, () => {
    assert.equal(resolveHost(), "127.0.0.1");
    assert.equal(resolvePort(), 3000);
  });

  withEnv({ HOST: "0.0.0.0", PORT: "4567" }, () => {
    assert.equal(resolveHost(), "0.0.0.0");
    assert.equal(resolvePort(), 4567);
  });
});

test("dashboard radar parser extracts live and upcoming OpenSea drops", () => {
  const sampleHtml = `
    <main>
      <a href="/collection/gummiez/overview">
        Gummiez By everytimezone Minting now 0.0005 ETH Total items 3,333
      </a>
      <a href="https://opensea.io/collection/phygitals-30th-edition">
        Phygitals: 30th Edition By PhygitalsTeam Mint price 0.012 ETH Total items 1,000 Mint starts in :host{display:inline-block;white-space:nowrap;line-height:var(--number-flow-char-height,1em)!important} span[will-change:transform].number{padding:calc(var(--number-flow-mask-height,0.25em)/2) 0} 00 : 02 : 12 : 33
      </a>
      <a href="/blog/creator-spotlight">
        Creator Spotlight
      </a>
    </main>
  `;

  assert.equal(extractOpenSeaCollectionSlug("/collection/gummiez/overview"), "gummiez");
  assert.equal(
    extractOpenSeaCollectionSlug("https://opensea.io/collection/phygitals-30th-edition"),
    "phygitals-30th-edition"
  );

  const entries = parseOpenSeaMintRadarEntries(sampleHtml, {
    pageLabel: "Smoke Feed"
  });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].slug, "gummiez");
  assert.equal(entries[0].status, "live");
  assert.equal(entries[0].priceText, "0.0005 ETH");
  assert.equal(entries[1].status, "upcoming");
  assert.match(entries[1].scheduleText, /Starts in 00 : 02 : 12 : 33/);
  assert.doesNotMatch(entries[1].scheduleText, /:host|display:inline-block|number-flow/i);
  assert.match(entries[1].warnings[0] || "", /countdown widget noise/i);
});

test("dashboard radar parser can recover mint metadata from nearby OpenSea card context", () => {
  const sampleHtml = `
    <article>
      <a href="/collection/house-cats/overview">
        House Cats
      </a>
      <div>
        By HouseCatsNFT Minting now 0.0008 ETH Total items 5,555
      </div>
    </article>
  `;

  const entries = parseOpenSeaMintRadarEntries(sampleHtml, {
    pageLabel: "Context Feed"
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].slug, "house-cats");
  assert.equal(entries[0].status, "live");
  assert.equal(entries[0].priceText, "0.0008 ETH");
});

test("dashboard autofill applies SeaDrop public mint route, schedule, and blocker state", () => {
  const baseTask = {
    contractAddress: "0x1111111111111111111111111111111111111111",
    abiJson: JSON.stringify(sampleAbi),
    mintFunction: "",
    mintArgs: "",
    quantityPerWallet: 1,
    priceEth: "",
    platform: "Generic EVM (auto-detect)",
    useSchedule: false,
    waitUntilIso: "",
    schedulePending: false,
    mintStartDetectionEnabled: true,
    mintStartDetectionConfig: {
      enabled: true,
      saleActiveFunction: "saleActive"
    },
    sourceExecutionBlocker: ""
  };

  const nextTask = applyMintAutofillToTask(baseTask, {
    mintFunction: "mintPublic",
    mintArgs: [
      "0xD479349A4818A5523BC36464cD9ea746f03CCB4B",
      "0x0000a26b00c1F0DF003000390027140000fAa719",
      "{{wallet}}",
      1
    ],
    priceEth: "0.01",
    platform: "OpenSea SeaDrop",
    contractAddressOverride: "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5",
    abiOverride: [
      {
        type: "function",
        name: "mintPublic",
        stateMutability: "payable",
        inputs: [
          { name: "nftContract", type: "address" },
          { name: "feeRecipient", type: "address" },
          { name: "minterIfNotPayer", type: "address" },
          { name: "quantity", type: "uint256" }
        ],
        outputs: []
      }
    ],
    mintStartDetection: {
      enabled: false,
      signals: []
    },
    launchRecommendation: {
      mode: "utc",
      waitUntilIso: "2026-04-02T17:00:00.000Z"
    },
    executionBlocker:
      "This collection restricts mint calls to approved payer contracts, so a direct wallet mint task will not succeed without the project's relayer or website-backed flow."
  });

  assert.equal(nextTask.contractAddress, "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5");
  assert.match(nextTask.abiJson, /mintPublic/);
  assert.equal(nextTask.mintFunction, "mintPublic");
  assert.equal(
    nextTask.mintArgs,
    JSON.stringify([
      "0xD479349A4818A5523BC36464cD9ea746f03CCB4B",
      "0x0000a26b00c1F0DF003000390027140000fAa719",
      "{{wallet}}",
      1
    ])
  );
  assert.equal(nextTask.priceEth, "0.01");
  assert.equal(nextTask.platform, "OpenSea SeaDrop");
  assert.equal(nextTask.useSchedule, true);
  assert.equal(nextTask.waitUntilIso, "2026-04-02T17:00:00.000Z");
  assert.equal(nextTask.schedulePending, true);
  assert.equal(nextTask.mintStartDetectionEnabled, false);
  assert.equal(
    nextTask.sourceExecutionBlocker,
    "This collection restricts mint calls to approved payer contracts, so a direct wallet mint task will not succeed without the project's relayer or website-backed flow."
  );
});

test("dashboard knows the SeaDrop shared mint contract on Base", () => {
  assert.equal(
    seaDropContractAddressForChain("base"),
    "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5"
  );
  assert.equal(
    seaDropContractAddressForChain("ethereum"),
    "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5"
  );
});

test("mint simulation accepts estimateGas fallback when staticCall returns a false revert", async () => {
  const staticCallError = Object.assign(new Error("missing revert data"), {
    shortMessage: "missing revert data"
  });
  const observedCalls = [];
  const method = {
    async staticCall(...callArgs) {
      observedCalls.push({
        kind: "staticCall",
        callArgs
      });
      throw staticCallError;
    },
    async estimateGas(...callArgs) {
      observedCalls.push({
        kind: "estimateGas",
        callArgs
      });
      return 135104n;
    }
  };
  const args = ["0x1111111111111111111111111111111111111111", 1];
  const overrides = {
    value: 400000000000000n
  };

  const simulation = await simulateMintMethod(method, args, overrides);

  assert.equal(simulation.success, true);
  assert.equal(simulation.estimatedGas, 135104n);
  assert.equal(simulation.usedGasEstimateFallback, true);
  assert.equal(simulation.staticCallError, staticCallError);
  assert.deepEqual(observedCalls, [
    {
      kind: "staticCall",
      callArgs: [...args, overrides]
    },
    {
      kind: "estimateGas",
      callArgs: [...args, overrides]
    }
  ]);
});
