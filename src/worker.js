require("dotenv").config();

const crypto = require("crypto");
const { ethers } = require("ethers");
const { AbortRunError, formatError, runMintBot } = require("./bot");
const { defaultInputValues, normalizeConfig } = require("./config");
const { createDatabase, normalizePersistentState } = require("./database");
const {
  resolveIntegrationSecrets,
  secretStorageKeys,
  sendConfiguredAlert
} = require("./integrations");
const { createRedisCoordinator, resolveQueueConfig } = require("./queue");
const { decryptSecret } = require("./security");

const chainCatalog = [
  { key: "ethereum", label: "Ethereum", chainId: 1 },
  { key: "sepolia", label: "Sepolia", chainId: 11155111 },
  { key: "base", label: "Base", chainId: 8453 },
  { key: "base_sepolia", label: "Base Sepolia", chainId: 84532 },
  { key: "arbitrum", label: "Arbitrum One", chainId: 42161 },
  { key: "blast", label: "Blast", chainId: 81457 }
];

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hashForId(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 12);
}

function parseList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(/[\r\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function truncateMiddle(value, start = 8, end = 6) {
  if (!value || value.length <= start + end + 3) {
    return value || "";
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function deriveAddress(privateKey) {
  return new ethers.Wallet(privateKey).address;
}

function buildEnvWalletEntries() {
  const keys = parseList(process.env.PRIVATE_KEYS || process.env.PRIVATE_KEY);
  const records = [];
  const keyMap = new Map();
  const knownAddresses = new Set();
  const createdAt = new Date().toISOString();

  keys.forEach((privateKey, index) => {
    try {
      const address = deriveAddress(privateKey);
      const addressLower = address.toLowerCase();
      if (knownAddresses.has(addressLower)) {
        return;
      }

      const id = `wallet_env_${addressLower}`;
      records.push({
        id,
        label: `Env Wallet ${index + 1}`,
        address,
        addressShort: truncateMiddle(address),
        group: "Env",
        status: "ready",
        source: "env",
        hasSecret: true,
        createdAt,
        updatedAt: createdAt
      });
      keyMap.set(id, privateKey);
      knownAddresses.add(addressLower);
    } catch {
      // Ignore invalid env keys.
    }
  });

  return {
    records,
    keyMap
  };
}

function buildEnvRpcNodes() {
  const urls = parseList(process.env.RPC_URLS || process.env.RPC_URL);
  const chainKey = String(process.env.DEFAULT_RPC_CHAIN_KEY || "base_sepolia").trim() || "base_sepolia";
  const knownUrls = new Set();

  return urls.reduce((nodes, url, index) => {
    if (knownUrls.has(url)) {
      return nodes;
    }

    nodes.push({
      id: `rpc_env_${hashForId(url)}`,
      name: `Env RPC ${index + 1}`,
      url,
      chainKey,
      enabled: true,
      group: "Env",
      source: "env",
      lastHealth: null
    });
    knownUrls.add(url);
    return nodes;
  }, []);
}

function mergeWalletInventories(storedWallets, envWallets) {
  const merged = [...storedWallets];
  const knownAddresses = new Set(storedWallets.map((wallet) => wallet.address.toLowerCase()));

  envWallets.forEach((wallet) => {
    if (knownAddresses.has(wallet.address.toLowerCase())) {
      return;
    }

    merged.push(wallet);
    knownAddresses.add(wallet.address.toLowerCase());
  });

  return merged;
}

function mergeRpcInventories(storedRpcNodes, envRpcNodes) {
  const merged = [...storedRpcNodes];
  const knownUrls = new Set(storedRpcNodes.map((node) => node.url));

  envRpcNodes.forEach((node) => {
    if (knownUrls.has(node.url)) {
      return;
    }

    merged.push(node);
    knownUrls.add(node.url);
  });

  return merged;
}

function chainLabel(chainKey) {
  return chainCatalog.find((entry) => entry.key === chainKey)?.label || chainKey || "Unknown";
}

function createEmptySummary(total = 0) {
  return {
    total,
    success: 0,
    failed: 0,
    stopped: 0,
    hashes: []
  };
}

function summarizeResults(results) {
  return results.reduce(
    (summary, result) => {
      summary.total += 1;
      if (result.status === "success" || result.status === "submitted") {
        summary.success += 1;
      } else if (result.status === "stopped") {
        summary.stopped += 1;
      } else if (result.status === "failed") {
        summary.failed += 1;
      }

      if (result.txHash) {
        summary.hashes.push(result.txHash);
      }

      return summary;
    },
    createEmptySummary(0)
  );
}

async function loadIntegrationSecrets(database) {
  const encryptedSecrets = {};

  for (const [secretName, storageKey] of Object.entries(secretStorageKeys)) {
    const ciphertext = await database.getSecret(storageKey);
    if (!ciphertext) {
      continue;
    }

    encryptedSecrets[secretName] = decryptSecret(ciphertext);
  }

  return resolveIntegrationSecrets(encryptedSecrets);
}

async function loadExecutionState(database) {
  const persistentState = normalizePersistentState(await database.loadState());
  const storedWallets = await database.listWallets();
  const { records: envWallets } = buildEnvWalletEntries();
  const envRpcNodes = buildEnvRpcNodes();

  return {
    ...persistentState,
    wallets: mergeWalletInventories(storedWallets, envWallets),
    rpcNodes: mergeRpcInventories(persistentState.rpcNodes, envRpcNodes)
  };
}

async function resolveWalletPrivateKeys(database, walletIds) {
  const { keyMap } = buildEnvWalletEntries();
  const privateKeys = [];

  for (const walletId of walletIds) {
    if (keyMap.has(walletId)) {
      privateKeys.push(keyMap.get(walletId));
      continue;
    }

    const storedSecret = await database.getStoredWalletSecret(walletId);
    if (!storedSecret?.secret_ciphertext) {
      throw new Error(`Wallet secret not found for wallet ${walletId}`);
    }

    privateKeys.push(decryptSecret(storedSecret.secret_ciphertext));
  }

  return privateKeys;
}

async function buildConfigForTask(database, state, task) {
  const walletIds = Array.isArray(task.walletIds) ? task.walletIds : [];
  const rpcNodeIds = Array.isArray(task.rpcNodeIds) ? task.rpcNodeIds : [];
  const wallets = state.wallets.filter((wallet) => walletIds.includes(wallet.id));
  if (wallets.length === 0) {
    throw new Error("Select at least one wallet before running a task");
  }

  const privateKeys = await resolveWalletPrivateKeys(database, walletIds);
  if (privateKeys.length !== walletIds.length) {
    throw new Error("One or more selected wallets could not be resolved");
  }

  const configuredRpcNodes = state.rpcNodes.filter(
    (node) =>
      node.enabled &&
      node.chainKey === task.chainKey &&
      (rpcNodeIds.length === 0 || rpcNodeIds.includes(node.id))
  );

  if (configuredRpcNodes.length === 0) {
    throw new Error(`No enabled RPC nodes configured for ${task.chainKey}`);
  }

  const chain = chainCatalog.find((entry) => entry.key === task.chainKey);

  return normalizeConfig({
    ...defaultInputValues,
    RPC_URLS: configuredRpcNodes.map((node) => node.url).join("\n"),
    PRIVATE_KEYS: privateKeys.join("\n"),
    CONTRACT_ADDRESS: task.contractAddress,
    ABI_JSON: task.abiJson,
    MINT_FUNCTION: task.mintFunction,
    MINT_ARGS: task.mintArgs,
    MINT_VALUE_ETH: task.priceEth,
    GAS_STRATEGY: task.gasStrategy,
    GAS_LIMIT: task.gasLimit,
    MAX_FEE_GWEI: task.maxFeeGwei,
    MAX_PRIORITY_FEE_GWEI: task.maxPriorityFeeGwei,
    GAS_BOOST_PERCENT: task.gasBoostPercent,
    PRIORITY_BOOST_PERCENT: task.priorityBoostPercent,
    WAIT_FOR_RECEIPT: task.waitForReceipt,
    SIMULATE_TRANSACTION: task.simulateTransaction,
    DRY_RUN: task.dryRun,
    WARMUP_RPC: task.warmupRpc,
    CONTINUE_ON_ERROR: task.continueOnError,
    WALLET_MODE: task.walletMode,
    WAIT_UNTIL_ISO: task.useSchedule ? task.waitUntilIso : "",
    READY_CHECK_FUNCTION: task.readyCheckFunction,
    READY_CHECK_ARGS: task.readyCheckArgs,
    READY_CHECK_MODE: task.readyCheckMode,
    READY_CHECK_EXPECTED: task.readyCheckExpected,
    READY_CHECK_INTERVAL_MS: task.readyCheckIntervalMs,
    POLL_INTERVAL_MS: task.pollIntervalMs,
    TX_TIMEOUT_MS: task.txTimeoutMs,
    MAX_RETRIES: task.maxRetries,
    RETRY_DELAY_MS: task.retryDelayMs,
    RETRY_WINDOW_MS: task.retryWindowMs,
    START_JITTER_MS: task.startJitterMs,
    MIN_BALANCE_ETH: task.minBalanceEth,
    NONCE_OFFSET: task.nonceOffset,
    SMART_GAS_REPLACEMENT: task.smartGasReplacement,
    REPLACEMENT_BUMP_PERCENT: task.replacementBumpPercent,
    REPLACEMENT_MAX_ATTEMPTS: task.replacementMaxAttempts,
    PRIVATE_RELAY_ENABLED: task.privateRelayEnabled,
    PRIVATE_RELAY_URL: task.privateRelayUrl,
    PRIVATE_RELAY_METHOD: task.privateRelayMethod,
    PRIVATE_RELAY_HEADERS_JSON: task.privateRelayHeadersJson,
    PRIVATE_RELAY_ONLY: task.privateRelayOnly,
    EXECUTION_TRIGGER_MODE: task.executionTriggerMode,
    TRIGGER_CONTRACT_ADDRESS: task.triggerContractAddress,
    TRIGGER_EVENT_SIGNATURE: task.triggerEventSignature,
    TRIGGER_EVENT_CONDITION: task.triggerEventCondition,
    TRIGGER_MEMPOOL_SIGNATURE: task.triggerMempoolSignature,
    TRIGGER_TIMEOUT_MS: task.triggerTimeoutMs,
    TRANSFER_AFTER_MINTED: task.transferAfterMinted,
    TRANSFER_ADDRESS: task.transferAddress,
    CHAIN_ID: chain ? String(chain.chainId) : "",
    RESULTS_PATH: state.settings.resultsPath || "./dist/mint-results.json"
  });
}

async function updateTaskRuntime(database, taskId, patch) {
  const current = await database.getTaskRuntime(taskId);

  return database.upsertTaskRuntime({
    taskId,
    status: patch.status || current?.status || "draft",
    progress: patch.progress || current?.progress || { phase: "Ready", percent: 0 },
    summary: patch.summary || current?.summary || createEmptySummary(0),
    active: patch.active ?? current?.active ?? false,
    queued: patch.queued ?? current?.queued ?? false,
    error: patch.error === undefined ? current?.error || null : patch.error,
    workerId: patch.workerId === undefined ? current?.workerId || null : patch.workerId,
    startedAt: patch.startedAt === undefined ? current?.startedAt || null : patch.startedAt,
    lastRunAt: patch.lastRunAt === undefined ? current?.lastRunAt || null : patch.lastRunAt
  });
}

async function notifyRunEvent(database, state, eventType, context = {}) {
  try {
    const secrets = await loadIntegrationSecrets(database);
    await sendConfiguredAlert({
      settings: state.settings,
      storedSecrets: secrets,
      eventType,
      task: context.task,
      chainLabel: chainLabel(context.task?.chainKey),
      summary: context.summary,
      error: context.error
    });
  } catch (error) {
    console.error(`Alert dispatch failed: ${formatError(error)}`);
  }
}

async function startWorker() {
  const queueConfig = resolveQueueConfig(process.env);
  if (!queueConfig.enabled) {
    throw new Error("Set QUEUE_MODE=redis and REDIS_URL before starting the worker.");
  }

  const workerId = queueConfig.workerId || `worker_${process.pid}`;
  const database = createDatabase();
  await database.ensureSchema();
  await database.ensureBaseState();

  const queue = await createRedisCoordinator(
    {
      ...queueConfig,
      workerId
    },
    {
      blocking: true,
      subscribe: true
    }
  );

  let currentTaskId = null;
  let currentAbortController = null;

  await queue.subscribeToControl((message) => {
    if (message?.type !== "stop-task") {
      return;
    }

    if (message.payload?.taskId && message.payload.taskId === currentTaskId) {
      currentAbortController?.abort();
    }
  });

  console.log(`Redis worker ${workerId} listening on ${queueConfig.redisUrl}`);

  while (true) {
    const job = await queue.dequeueTask();
    if (!job?.taskId) {
      continue;
    }

    currentTaskId = job.taskId;
    currentAbortController = new AbortController();

    let state = null;
    let task = null;

    try {
      state = await loadExecutionState(database);
      task = state.tasks.find((entry) => entry.id === job.taskId) || null;
      if (!task) {
        throw new Error(`Task ${job.taskId} no longer exists`);
      }

      const startedAt = new Date().toISOString();
      const walletCount = Array.isArray(task.walletIds) ? task.walletIds.length : 0;

      await updateTaskRuntime(database, job.taskId, {
        status: "running",
        progress: {
          phase: "Preparing",
          percent: 8
        },
        summary: createEmptySummary(walletCount),
        active: true,
        queued: false,
        error: null,
        workerId,
        startedAt
      });
      await queue.setRunState({
        status: "running",
        activeTaskId: job.taskId,
        startedAt,
        workerId,
        queueMode: "redis"
      });
      await queue.publishEvent("task-sync", { taskId: job.taskId });
      await notifyRunEvent(database, state, "run_start", { task });

      const config = await buildConfigForTask(database, state, task);
      const result = await runMintBot(config, {
        signal: currentAbortController.signal,
        onLog(entry) {
          void queue.publishEvent("log", {
            taskId: job.taskId,
            entry
          }).catch((error) => {
            console.error("Unable to publish worker log event:");
            console.error(error);
          });
        }
      });

      const summary = summarizeResults(result.results);
      const completedAt = new Date().toISOString();
      await updateTaskRuntime(database, job.taskId, {
        status: "completed",
        progress: {
          phase: "Completed",
          percent: 100
        },
        summary,
        active: false,
        queued: false,
        error: null,
        workerId,
        startedAt: null,
        lastRunAt: completedAt
      });
      await database.insertTaskHistory({
        id: createId("history"),
        taskId: job.taskId,
        ranAt: completedAt,
        summary
      });
      await database.pruneTaskHistory(job.taskId, 8);
      await queue.publishEvent("task-sync", { taskId: job.taskId });
      await notifyRunEvent(database, state, "run_success", {
        task,
        summary
      });
    } catch (error) {
      const stopped =
        error instanceof AbortRunError || Boolean(currentAbortController?.signal.aborted);
      const failedAt = new Date().toISOString();
      const walletCount = Array.isArray(task?.walletIds) ? task.walletIds.length : 0;
      await updateTaskRuntime(database, job.taskId, {
        status: stopped ? "stopped" : "failed",
        progress: {
          phase: stopped ? "Stopped" : "Failed",
          percent: stopped ? 0 : 100
        },
        summary: createEmptySummary(walletCount),
        active: false,
        queued: false,
        error: formatError(error),
        workerId,
        startedAt: null,
        lastRunAt: failedAt
      });
      await queue.publishEvent("log", {
        taskId: job.taskId,
        entry: {
          level: "error",
          message: formatError(error),
          timestamp: failedAt
        }
      });
      await queue.publishEvent("task-sync", { taskId: job.taskId });

      if (state && task) {
        await notifyRunEvent(database, state, stopped ? "run_stopped" : "run_failure", {
          task,
          error: formatError(error)
        });
      }
    } finally {
      currentTaskId = null;
      currentAbortController = null;
      await queue.clearRunState();
    }
  }
}

async function main() {
  await startWorker();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Worker startup failed:");
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  main,
  startWorker
};
