require("dotenv").config();

const fs = require("fs");
const http = require("http");
const path = require("path");
const { ethers } = require("ethers");
const { AbortRunError, formatError, runMintBot } = require("./bot");
const { defaultInputValues, normalizeConfig } = require("./config");

const webRoot = path.resolve(process.cwd(), "web");
const statePath = path.resolve(process.cwd(), "dist", "dashboard-state.json");

const clients = new Set();
const chainCatalog = [
  { key: "ethereum", label: "Ethereum", chainId: 1 },
  { key: "sepolia", label: "Sepolia", chainId: 11155111 },
  { key: "base", label: "Base", chainId: 8453 },
  { key: "base_sepolia", label: "Base Sepolia", chainId: 84532 },
  { key: "arbitrum", label: "Arbitrum One", chainId: 42161 },
  { key: "blast", label: "Blast", chainId: 81457 }
];

let appState = null;
let runController = null;
let activeTaskId = null;
let liveLogs = [];
let runStartedAt = null;

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function broadcast(type, payload) {
  const body = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    client.write(body);
  }
}

function ensureStateDirectory() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
}

function readStateFile() {
  ensureStateDirectory();
  if (!fs.existsSync(statePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeStateFile() {
  ensureStateDirectory();
  fs.writeFileSync(statePath, `${JSON.stringify(appState, null, 2)}\n`, "utf8");
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

function makeWalletRecord(privateKey, label, group = "Imported") {
  const address = deriveAddress(privateKey);

  return {
    id: createId("wallet"),
    label,
    address,
    addressShort: truncateMiddle(address),
    privateKey,
    group,
    status: "ready",
    createdAt: new Date().toISOString()
  };
}

function ensureWalletImport(targetState, privateKeys, group) {
  const knownAddresses = new Set(targetState.wallets.map((wallet) => wallet.address.toLowerCase()));
  privateKeys.forEach((privateKey, index) => {
    try {
      const address = deriveAddress(privateKey);
      if (knownAddresses.has(address.toLowerCase())) {
        return;
      }

      targetState.wallets.push(
        makeWalletRecord(privateKey, `Wallet ${targetState.wallets.length + 1 + index}`, group)
      );
      knownAddresses.add(address.toLowerCase());
    } catch {
      // Ignore invalid keys during bootstrap; explicit imports return an error instead.
    }
  });
}

function ensureRpcImport(targetState, urls, group, chainKey = "base_sepolia") {
  const knownUrls = new Set(targetState.rpcNodes.map((node) => node.url));
  urls.forEach((url, index) => {
    if (knownUrls.has(url)) {
      return;
    }

    targetState.rpcNodes.push({
      id: createId("rpc"),
      name: `${group} RPC ${targetState.rpcNodes.length + 1 + index}`,
      url,
      chainKey,
      enabled: true,
      group
    });
    knownUrls.add(url);
  });
}

function defaultTaskState() {
  return {
    id: createId("task"),
    name: "Untitled Task",
    contractAddress: "",
    chainKey: "base_sepolia",
    quantityPerWallet: 1,
    priceEth: "0",
    abiJson: "",
    platform: "Generic EVM (auto-detect)",
    priority: "standard",
    tags: [],
    notes: "",
    walletIds: [],
    rpcNodeIds: [],
    mintFunction: "mint",
    mintArgs: "[1]",
    gasStrategy: "provider",
    gasLimit: "",
    maxFeeGwei: "",
    maxPriorityFeeGwei: "",
    gasBoostPercent: "0",
    priorityBoostPercent: "0",
    simulateTransaction: true,
    dryRun: false,
    waitForReceipt: true,
    warmupRpc: true,
    continueOnError: false,
    walletMode: "parallel",
    useSchedule: false,
    waitUntilIso: "",
    readyCheckFunction: "",
    readyCheckArgs: "[]",
    readyCheckMode: "truthy",
    readyCheckExpected: "",
    readyCheckIntervalMs: "1000",
    pollIntervalMs: "1000",
    maxRetries: "1",
    retryDelayMs: "1000",
    startJitterMs: "0",
    minBalanceEth: "",
    nonceOffset: "0",
    transferAfterMinted: false,
    transferAddress: "",
    status: "draft",
    progress: {
      phase: "Ready",
      percent: 0
    },
    summary: {
      total: 0,
      success: 0,
      failed: 0,
      stopped: 0,
      hashes: []
    },
    history: [],
    lastRunAt: null,
    done: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function sanitizeTaskInput(payload, existingTask = null) {
  const base = existingTask ? { ...existingTask } : defaultTaskState();

  return {
    ...base,
    name: String(payload.name || base.name).trim() || "Untitled Task",
    contractAddress: String(payload.contractAddress || "").trim(),
    chainKey: String(payload.chainKey || base.chainKey || "base_sepolia"),
    quantityPerWallet: Math.max(1, Number(payload.quantityPerWallet || base.quantityPerWallet || 1)),
    priceEth: String(payload.priceEth ?? base.priceEth ?? "0").trim() || "0",
    abiJson: String(payload.abiJson || base.abiJson || "").trim(),
    platform: String(payload.platform || base.platform || "Generic EVM (auto-detect)"),
    priority: String(payload.priority || base.priority || "standard"),
    tags: Array.isArray(payload.tags)
      ? payload.tags.filter(Boolean)
      : String(payload.tags || "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
    notes: String(payload.notes ?? base.notes ?? "").trim(),
    walletIds: Array.isArray(payload.walletIds) ? payload.walletIds : base.walletIds || [],
    rpcNodeIds: Array.isArray(payload.rpcNodeIds) ? payload.rpcNodeIds : base.rpcNodeIds || [],
    mintFunction: String(payload.mintFunction || base.mintFunction || "mint").trim() || "mint",
    mintArgs: String(payload.mintArgs || base.mintArgs || "[]").trim() || "[]",
    gasStrategy: String(payload.gasStrategy || base.gasStrategy || "provider"),
    gasLimit: String(payload.gasLimit ?? base.gasLimit ?? "").trim(),
    maxFeeGwei: String(payload.maxFeeGwei ?? base.maxFeeGwei ?? "").trim(),
    maxPriorityFeeGwei: String(payload.maxPriorityFeeGwei ?? base.maxPriorityFeeGwei ?? "").trim(),
    gasBoostPercent: String(payload.gasBoostPercent ?? base.gasBoostPercent ?? "0").trim() || "0",
    priorityBoostPercent: String(
      payload.priorityBoostPercent ?? base.priorityBoostPercent ?? "0"
    ).trim() || "0",
    simulateTransaction: Boolean(
      payload.simulateTransaction ?? base.simulateTransaction ?? true
    ),
    dryRun: Boolean(payload.dryRun ?? base.dryRun ?? false),
    waitForReceipt: Boolean(payload.waitForReceipt ?? base.waitForReceipt ?? true),
    warmupRpc: Boolean(payload.warmupRpc ?? base.warmupRpc ?? true),
    continueOnError: Boolean(payload.continueOnError ?? base.continueOnError ?? false),
    walletMode: String(payload.walletMode || base.walletMode || "parallel"),
    useSchedule: Boolean(payload.useSchedule ?? base.useSchedule ?? false),
    waitUntilIso: String(payload.waitUntilIso ?? base.waitUntilIso ?? "").trim(),
    readyCheckFunction: String(payload.readyCheckFunction ?? base.readyCheckFunction ?? "").trim(),
    readyCheckArgs: String(payload.readyCheckArgs ?? base.readyCheckArgs ?? "[]").trim() || "[]",
    readyCheckMode: String(payload.readyCheckMode || base.readyCheckMode || "truthy"),
    readyCheckExpected: String(payload.readyCheckExpected ?? base.readyCheckExpected ?? "").trim(),
    readyCheckIntervalMs: String(
      payload.readyCheckIntervalMs ?? base.readyCheckIntervalMs ?? "1000"
    ).trim() || "1000",
    pollIntervalMs: String(payload.pollIntervalMs ?? base.pollIntervalMs ?? "1000").trim() || "1000",
    maxRetries: String(payload.maxRetries ?? base.maxRetries ?? "1").trim() || "1",
    retryDelayMs: String(payload.retryDelayMs ?? base.retryDelayMs ?? "1000").trim() || "1000",
    startJitterMs: String(payload.startJitterMs ?? base.startJitterMs ?? "0").trim() || "0",
    minBalanceEth: String(payload.minBalanceEth ?? base.minBalanceEth ?? "").trim(),
    nonceOffset: String(payload.nonceOffset ?? base.nonceOffset ?? "0").trim() || "0",
    transferAfterMinted: Boolean(payload.transferAfterMinted ?? base.transferAfterMinted ?? false),
    transferAddress: String(payload.transferAddress ?? base.transferAddress ?? "").trim(),
    status: payload.status || base.status || "draft",
    progress: base.progress || { phase: "Ready", percent: 0 },
    summary: base.summary || { total: 0, success: 0, failed: 0, stopped: 0, hashes: [] },
    history: base.history || [],
    lastRunAt: base.lastRunAt || null,
    done: Boolean(payload.done ?? base.done ?? false),
    updatedAt: new Date().toISOString()
  };
}

function createInitialState() {
  const initial = {
    tasks: [],
    wallets: [],
    rpcNodes: [],
    settings: {
      profileName: "local",
      theme: "dark-panel",
      resultsPath: "./dist/mint-results.json"
    }
  };

  ensureWalletImport(initial, parseList(process.env.PRIVATE_KEYS || process.env.PRIVATE_KEY), "Env");
  ensureRpcImport(initial, parseList(process.env.RPC_URLS || process.env.RPC_URL), "Env");

  return initial;
}

function loadAppState() {
  const persisted = readStateFile();
  appState = persisted || createInitialState();

  if (!Array.isArray(appState.tasks)) {
    appState.tasks = [];
  }

  if (!Array.isArray(appState.wallets)) {
    appState.wallets = [];
  }

  if (!Array.isArray(appState.rpcNodes)) {
    appState.rpcNodes = [];
  }

  if (!appState.settings) {
    appState.settings = createInitialState().settings;
  }

  ensureWalletImport(appState, parseList(process.env.PRIVATE_KEYS || process.env.PRIVATE_KEY), "Env");
  ensureRpcImport(appState, parseList(process.env.RPC_URLS || process.env.RPC_URL), "Env");
  writeStateFile();
}

function getRunState() {
  return {
    status: runController ? "running" : "idle",
    activeTaskId,
    startedAt: runStartedAt,
    logs: liveLogs.slice(-200)
  };
}

function buildTaskResponse(task) {
  const walletCount = task.walletIds.length;
  const rpcCount = task.rpcNodeIds?.length || 0;
  return {
    ...task,
    walletCount,
    rpcCount
  };
}

function emitState() {
  broadcast("state", {
    tasks: appState.tasks.map(buildTaskResponse),
    wallets: appState.wallets.map(({ privateKey, ...wallet }) => wallet),
    rpcNodes: appState.rpcNodes,
    settings: appState.settings,
    chains: chainCatalog,
    runState: getRunState()
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function serveFile(response, filePath) {
  if (!fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };

  response.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  response.end(fs.readFileSync(filePath));
}

function pushLog(entry) {
  liveLogs.push(entry);
  if (liveLogs.length > 400) {
    liveLogs = liveLogs.slice(-400);
  }
  broadcast("log", entry);
}

function updateTask(taskId, patch) {
  const index = appState.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) {
    return null;
  }

  appState.tasks[index] = {
    ...appState.tasks[index],
    ...patch,
    updatedAt: new Date().toISOString()
  };
  writeStateFile();
  emitState();
  return appState.tasks[index];
}

function cloneTask(task) {
  return {
    ...task,
    id: createId("task"),
    name: `${task.name} Copy`,
    status: "draft",
    done: false,
    progress: {
      phase: "Ready",
      percent: 0
    },
    summary: {
      total: 0,
      success: 0,
      failed: 0,
      stopped: 0,
      hashes: []
    },
    history: [],
    lastRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
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
    { total: 0, success: 0, failed: 0, stopped: 0, hashes: [] }
  );
}

function updateTaskProgressFromLog(task, entry) {
  if (!task) {
    return;
  }

  const total = Math.max(task.walletIds.length || 1, 1);
  const summary = task.summary || { total: 0, success: 0, failed: 0, stopped: 0, hashes: [] };
  let phase = task.progress?.phase || "Preparing";
  let percent = task.progress?.percent || 8;

  if (entry.message.includes("Waiting for launch time")) {
    phase = "Scheduled";
    percent = 4;
  } else if (entry.message.includes("Provider warmup complete")) {
    phase = "Pre-signing";
    percent = Math.max(percent, 18);
  } else if (entry.message.includes("Simulation passed")) {
    phase = "Pre-signing";
    const scanned = Math.min(total, summary.success + summary.failed + summary.stopped + 1);
    percent = Math.max(percent, 20 + Math.round((scanned / total) * 25));
  } else if (entry.message.includes("Submitted tx")) {
    phase = "Broadcasting";
    percent = Math.max(percent, 55);
  } else if (
    entry.message.includes("Confirmed in block") ||
    entry.message.includes("Dry run enabled") ||
    entry.message.includes("Status:")
  ) {
    phase = "Settling";
    percent = Math.max(percent, 76);
  } else if (entry.message.includes("Run summary")) {
    phase = "Finalizing";
    percent = Math.max(percent, 96);
  }

  updateTask(task.id, {
    progress: {
      phase,
      percent
    }
  });
}

function getTaskById(taskId) {
  return appState.tasks.find((task) => task.id === taskId);
}

function buildConfigForTask(task) {
  const wallets = appState.wallets.filter((wallet) => task.walletIds.includes(wallet.id));
  if (wallets.length === 0) {
    throw new Error("Select at least one wallet before running a task");
  }

  const configuredRpcNodes = appState.rpcNodes.filter(
    (node) =>
      node.enabled &&
      node.chainKey === task.chainKey &&
      (task.rpcNodeIds.length === 0 || task.rpcNodeIds.includes(node.id))
  );

  if (configuredRpcNodes.length === 0) {
    throw new Error(`No enabled RPC nodes configured for ${task.chainKey}`);
  }

  const chain = chainCatalog.find((entry) => entry.key === task.chainKey);

  return normalizeConfig({
    ...defaultInputValues,
    RPC_URLS: configuredRpcNodes.map((node) => node.url).join("\n"),
    PRIVATE_KEYS: wallets.map((wallet) => wallet.privateKey).join("\n"),
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
    MAX_RETRIES: task.maxRetries,
    RETRY_DELAY_MS: task.retryDelayMs,
    START_JITTER_MS: task.startJitterMs,
    MIN_BALANCE_ETH: task.minBalanceEth,
    NONCE_OFFSET: task.nonceOffset,
    CHAIN_ID: chain ? String(chain.chainId) : "",
    RESULTS_PATH: appState.settings.resultsPath || "./dist/mint-results.json"
  });
}

async function handleTaskRun(taskId, response) {
  if (runController) {
    sendJson(response, 409, { error: "A task is already running" });
    return;
  }

  const task = getTaskById(taskId);
  if (!task) {
    sendJson(response, 404, { error: "Task not found" });
    return;
  }

  try {
    const config = buildConfigForTask(task);
    runController = new AbortController();
    activeTaskId = taskId;
    runStartedAt = new Date().toISOString();
    liveLogs = [];

    updateTask(taskId, {
      status: "running",
      progress: {
        phase: "Preparing",
        percent: 8
      },
      summary: {
        total: task.walletIds.length,
        success: 0,
        failed: 0,
        stopped: 0,
        hashes: []
      }
    });

    sendJson(response, 200, { ok: true });

    runMintBot(config, {
      signal: runController.signal,
      onLog(entry) {
        pushLog(entry);
        updateTaskProgressFromLog(getTaskById(taskId), entry);
      }
    })
      .then((result) => {
        const summary = summarizeResults(result.results);
        const taskAfterRun = getTaskById(taskId);
        updateTask(taskId, {
          status: "completed",
          progress: {
            phase: "Completed",
            percent: 100
          },
          summary,
          lastRunAt: new Date().toISOString(),
          history: [
            {
              id: createId("history"),
              ranAt: new Date().toISOString(),
              summary
            },
            ...(taskAfterRun.history || [])
          ].slice(0, 8)
        });
      })
      .catch((error) => {
        const stopped = error instanceof AbortRunError || runController?.signal.aborted;
        updateTask(taskId, {
          status: stopped ? "stopped" : "failed",
          progress: {
            phase: stopped ? "Stopped" : "Failed",
            percent: stopped ? 0 : 100
          }
        });
        pushLog({
          level: "error",
          message: formatError(error),
          timestamp: new Date().toISOString()
        });
      })
      .finally(() => {
        runController = null;
        activeTaskId = null;
        runStartedAt = null;
        emitState();
      });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

function handleTaskDuplicate(taskId, response) {
  const task = getTaskById(taskId);
  if (!task) {
    sendJson(response, 404, { error: "Task not found" });
    return;
  }

  const duplicate = cloneTask(task);
  appState.tasks.unshift(duplicate);
  writeStateFile();
  emitState();
  sendJson(response, 200, { ok: true, task: buildTaskResponse(duplicate) });
}

function handleStopRun(response) {
  if (!runController) {
    sendJson(response, 409, { error: "No task is running" });
    return;
  }

  runController.abort();
  sendJson(response, 200, { ok: true });
}

async function handleTaskSave(request, response) {
  try {
    const rawBody = await readBody(request);
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const existingTask = payload.id ? getTaskById(payload.id) : null;
    const task = sanitizeTaskInput(payload, existingTask);

    if (!task.contractAddress) {
      throw new Error("Contract address is required");
    }

    if (!task.abiJson) {
      throw new Error("ABI JSON is required");
    }

    if (task.walletIds.length === 0) {
      throw new Error("Select at least one wallet");
    }

    if (existingTask) {
      const index = appState.tasks.findIndex((entry) => entry.id === task.id);
      appState.tasks[index] = task;
    } else {
      appState.tasks.unshift(task);
    }

    writeStateFile();
    emitState();
    sendJson(response, 200, { ok: true, task: buildTaskResponse(task) });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

function handleTaskDelete(taskId, response) {
  const before = appState.tasks.length;
  appState.tasks = appState.tasks.filter((task) => task.id !== taskId);

  if (appState.tasks.length === before) {
    sendJson(response, 404, { error: "Task not found" });
    return;
  }

  writeStateFile();
  emitState();
  sendJson(response, 200, { ok: true });
}

function handleTaskDone(taskId, response) {
  const task = getTaskById(taskId);
  if (!task) {
    sendJson(response, 404, { error: "Task not found" });
    return;
  }

  updateTask(taskId, {
    done: !task.done,
    status: task.done ? "draft" : "done"
  });
  sendJson(response, 200, { ok: true });
}

async function handleWalletImport(request, response) {
  try {
    const rawBody = await readBody(request);
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const privateKeys = parseList(payload.privateKeys);

    if (privateKeys.length === 0) {
      throw new Error("Provide at least one private key");
    }

    const knownAddresses = new Set(appState.wallets.map((wallet) => wallet.address.toLowerCase()));
    let imported = 0;
    let skipped = 0;
    privateKeys.forEach((privateKey, index) => {
      const address = deriveAddress(privateKey);
      if (knownAddresses.has(address.toLowerCase())) {
        skipped += 1;
        return;
      }

      const label = payload.group
        ? `${payload.group} ${appState.wallets.length + imported + index + 1}`
        : `Wallet ${appState.wallets.length + imported + index + 1}`;
      appState.wallets.push(makeWalletRecord(privateKey, label, payload.group || "Imported"));
      knownAddresses.add(address.toLowerCase());
      imported += 1;
    });

    writeStateFile();
    emitState();
    sendJson(response, 200, { ok: true, imported, skipped });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

function handleWalletDelete(walletId, response) {
  appState.wallets = appState.wallets.filter((wallet) => wallet.id !== walletId);
  appState.tasks = appState.tasks.map((task) => ({
    ...task,
    walletIds: task.walletIds.filter((id) => id !== walletId)
  }));
  writeStateFile();
  emitState();
  sendJson(response, 200, { ok: true });
}

async function handleRpcSave(request, response) {
  try {
    const rawBody = await readBody(request);
    const payload = rawBody ? JSON.parse(rawBody) : {};

    if (!payload.url) {
      throw new Error("RPC URL is required");
    }

    const rpcNode = {
      id: payload.id || createId("rpc"),
      name: String(payload.name || "Custom RPC").trim() || "Custom RPC",
      url: String(payload.url).trim(),
      chainKey: String(payload.chainKey || "base_sepolia"),
      enabled: payload.enabled !== false,
      group: payload.group || "Custom",
      lastHealth: payload.lastHealth || null
    };

    const existingIndex = appState.rpcNodes.findIndex((node) => node.id === rpcNode.id);
    if (existingIndex === -1) {
      appState.rpcNodes.unshift(rpcNode);
    } else {
      appState.rpcNodes[existingIndex] = rpcNode;
    }

    writeStateFile();
    emitState();
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleRpcTest(rpcId, response) {
  const rpcNode = appState.rpcNodes.find((node) => node.id === rpcId);
  if (!rpcNode) {
    sendJson(response, 404, { error: "RPC node not found" });
    return;
  }

  const started = Date.now();

  try {
    const provider = new ethers.JsonRpcProvider(rpcNode.url);
    const blockNumber = await provider.getBlockNumber();
    const latencyMs = Date.now() - started;

    rpcNode.lastHealth = {
      status: "healthy",
      latencyMs,
      blockNumber,
      checkedAt: new Date().toISOString()
    };
    writeStateFile();
    emitState();
    sendJson(response, 200, { ok: true, health: rpcNode.lastHealth });
  } catch (error) {
    rpcNode.lastHealth = {
      status: "error",
      error: formatError(error),
      checkedAt: new Date().toISOString()
    };
    writeStateFile();
    emitState();
    sendJson(response, 200, { ok: true, health: rpcNode.lastHealth });
  }
}

async function handleSettingsSave(request, response) {
  try {
    const rawBody = await readBody(request);
    const payload = rawBody ? JSON.parse(rawBody) : {};

    appState.settings = {
      ...appState.settings,
      profileName: String(payload.profileName || appState.settings.profileName || "local").trim(),
      theme: String(payload.theme || appState.settings.theme || "dark-panel").trim(),
      resultsPath: String(
        payload.resultsPath || appState.settings.resultsPath || "./dist/mint-results.json"
      ).trim()
    };

    writeStateFile();
    emitState();
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

function handleRpcDelete(rpcId, response) {
  appState.rpcNodes = appState.rpcNodes.filter((node) => node.id !== rpcId);
  appState.tasks = appState.tasks.map((task) => ({
    ...task,
    rpcNodeIds: task.rpcNodeIds.filter((id) => id !== rpcId)
  }));
  writeStateFile();
  emitState();
  sendJson(response, 200, { ok: true });
}

function handleAppState(response) {
  sendJson(response, 200, {
    tasks: appState.tasks.map(buildTaskResponse),
    wallets: appState.wallets.map(({ privateKey, ...wallet }) => wallet),
    rpcNodes: appState.rpcNodes,
    settings: appState.settings,
    chains: chainCatalog,
    defaults: defaultInputValues,
    runState: getRunState()
  });
}

function parseRoute(pathname) {
  return pathname.split("/").filter(Boolean);
}

loadAppState();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const route = parseRoute(url.pathname);

  if (request.method === "GET" && url.pathname === "/api/app-state") {
    handleAppState(response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive"
    });
    response.write(
      `event: state\ndata: ${JSON.stringify({
        tasks: appState.tasks.map(buildTaskResponse),
        wallets: appState.wallets.map(({ privateKey, ...wallet }) => wallet),
        rpcNodes: appState.rpcNodes,
        settings: appState.settings,
        chains: chainCatalog,
        runState: getRunState()
      })}\n\n`
    );
    clients.add(response);

    request.on("close", () => {
      clients.delete(response);
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tasks") {
    await handleTaskSave(request, response);
    return;
  }

  if (request.method === "POST" && route[0] === "api" && route[1] === "tasks" && route[3] === "run") {
    await handleTaskRun(route[2], response);
    return;
  }

  if (request.method === "POST" && route[0] === "api" && route[1] === "tasks" && route[3] === "done") {
    handleTaskDone(route[2], response);
    return;
  }

  if (
    request.method === "POST" &&
    route[0] === "api" &&
    route[1] === "tasks" &&
    route[3] === "duplicate"
  ) {
    handleTaskDuplicate(route[2], response);
    return;
  }

  if (request.method === "DELETE" && route[0] === "api" && route[1] === "tasks" && route[2]) {
    handleTaskDelete(route[2], response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/run/stop") {
    handleStopRun(response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/wallets/import") {
    await handleWalletImport(request, response);
    return;
  }

  if (request.method === "DELETE" && route[0] === "api" && route[1] === "wallets" && route[2]) {
    handleWalletDelete(route[2], response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/rpc-nodes") {
    await handleRpcSave(request, response);
    return;
  }

  if (
    request.method === "POST" &&
    route[0] === "api" &&
    route[1] === "rpc-nodes" &&
    route[3] === "test"
  ) {
    await handleRpcTest(route[2], response);
    return;
  }

  if (request.method === "DELETE" && route[0] === "api" && route[1] === "rpc-nodes" && route[2]) {
    handleRpcDelete(route[2], response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/settings") {
    await handleSettingsSave(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    serveFile(response, path.join(webRoot, "index.html"));
    return;
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/app.js" || url.pathname === "/styles.css")
  ) {
    serveFile(response, path.join(webRoot, url.pathname.slice(1)));
    return;
  }

  response.writeHead(404);
  response.end("Not found");
});

function resolveHost() {
  if (process.env.HOST) {
    return process.env.HOST;
  }

  return process.env.PORT ? "0.0.0.0" : "127.0.0.1";
}

function resolvePort() {
  return Number(process.env.PORT || 3000);
}

function startServer() {
  if (server.listening) {
    return server;
  }

  const host = resolveHost();
  const port = resolvePort();

  server.listen(port, host, () => {
    console.log(`Mint dashboard running at http://${host}:${port}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  resolveHost,
  resolvePort,
  startServer
};
