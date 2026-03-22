require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { ethers } = require("ethers");
const { AbortRunError, formatError, runMintBot } = require("./bot");
const { defaultInputValues, normalizeConfig, normalizeGasStrategyValue } = require("./config");
const { createDatabase, normalizePersistentState } = require("./database");
const {
  buildClientSettings,
  fetchAbiFromExplorer,
  normalizeDashboardSettings,
  resolveIntegrationSecrets,
  secretStorageKeys
} = require("./integrations");
const {
  decryptSecret,
  encryptSecret,
  generateSessionToken,
  hashPassword,
  hashToken,
  isBlank,
  verifyPassword
} = require("./security");
const { createIdleRunState, createRedisCoordinator, resolveQueueConfig } = require("./queue");

const webRoot = path.resolve(process.cwd(), "web");
const legacyStatePath = path.resolve(process.cwd(), "dist", "dashboard-state.json");
const sessionCookieName = process.env.SESSION_COOKIE_NAME || "mintbot_session";
const sessionTtlHours = Math.max(1, Number(process.env.SESSION_TTL_HOURS || 168));
const scheduledTaskPollIntervalMs = Math.max(
  1000,
  Number(process.env.SCHEDULE_POLL_INTERVAL_MS || 1000)
);
const explorerKeyTestAddress = "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2";
const explorerKeyTestChainId = 1;

const clients = new Set();
const chainCatalog = [
  { key: "ethereum", label: "Ethereum", chainId: 1 },
  { key: "sepolia", label: "Sepolia", chainId: 11155111 },
  { key: "base", label: "Base", chainId: 8453 },
  { key: "base_sepolia", label: "Base Sepolia", chainId: 84532 },
  { key: "arbitrum", label: "Arbitrum One", chainId: 42161 },
  { key: "blast", label: "Blast", chainId: 81457 }
];

let database = null;
let initialized = false;
let appState = null;
let integrationSecrets = {};
const localTaskRuns = new Map();
let liveLogs = [];
let queueCoordinator = null;
let distributedRunState = createIdleRunState(resolveQueueConfig());
const distributedQueuedTaskIds = new Set();
const distributedTaskPatches = new Map();
let scheduledTaskLoop = null;
let scheduledTaskScanInFlight = false;

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getQueueConfig() {
  return resolveQueueConfig(process.env);
}

function queueModeEnabled() {
  return getQueueConfig().enabled;
}

function sortActiveRuns(left, right) {
  return new Date(left.startedAt || 0) - new Date(right.startedAt || 0);
}

function listLocalActiveRuns() {
  return [...localTaskRuns.values()]
    .filter((entry) => entry.active)
    .map((entry) => ({
      taskId: entry.taskId,
      startedAt: entry.startedAt,
      taskName: entry.taskName || null
    }))
    .sort(sortActiveRuns);
}

function listDistributedActiveRuns() {
  if (!appState?.taskRuntimeById) {
    return [];
  }

  return Object.entries(appState.taskRuntimeById)
    .filter(([, runtime]) => runtime?.active)
    .map(([taskId, runtime]) => ({
      taskId,
      startedAt: runtime.startedAt || null,
      workerId: runtime.workerId || null,
      taskName: getTaskById(taskId)?.name || null
    }))
    .sort(sortActiveRuns);
}

function listActiveRuns() {
  return queueModeEnabled() ? listDistributedActiveRuns() : listLocalActiveRuns();
}

function listActiveTaskIds() {
  return listActiveRuns().map((entry) => entry.taskId);
}

function isTaskActive(taskId) {
  return listActiveTaskIds().includes(taskId);
}

function hashForId(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 12);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function broadcast(type, payload) {
  const body = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    client.write(body);
  }
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

function authIsRequired() {
  return String(process.env.AUTH_REQUIRED || "true").trim().toLowerCase() !== "false";
}

function parseCookies(request) {
  const raw = request.headers.cookie;
  if (!raw) {
    return {};
  }

  return raw.split(";").reduce((cookies, entry) => {
    const [key, ...valueParts] = entry.split("=");
    if (!key) {
      return cookies;
    }

    cookies[key.trim()] = decodeURIComponent(valueParts.join("=").trim());
    return cookies;
  }, {});
}

function shouldUseSecureCookie(request) {
  if (process.env.COOKIE_SECURE === "true") {
    return true;
  }

  if (process.env.COOKIE_SECURE === "false") {
    return false;
  }

  const host = String(request?.headers?.host || "");
  return !/localhost|127\.0\.0\.1/i.test(host);
}

function appendSetCookie(response, value) {
  const existing = response.getHeader("Set-Cookie");
  if (!existing) {
    response.setHeader("Set-Cookie", [value]);
    return;
  }

  const values = Array.isArray(existing) ? existing : [existing];
  response.setHeader("Set-Cookie", [...values, value]);
}

function buildSessionCookie(request, value, maxAgeSeconds) {
  const parts = [`${sessionCookieName}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (typeof maxAgeSeconds === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  }
  if (shouldUseSecureCookie(request)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function clearSessionCookie(response, request) {
  appendSetCookie(response, buildSessionCookie(request, "", 0));
}

function defaultTaskState() {
  return {
    id: createId("task"),
    name: "Untitled Task",
    contractAddress: "",
    chainKey: "base_sepolia",
    quantityPerWallet: 1,
    priceEth: "",
    abiJson: "",
    platform: "Generic EVM (auto-detect)",
    priority: "standard",
    tags: [],
    notes: "",
    walletIds: [],
    rpcNodeIds: [],
    mintFunction: "",
    mintArgs: "",
    gasStrategy: "normal",
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
    preSignTransactions: true,
    multiRpcBroadcast: false,
    schedulePending: false,
    mintStartDetectionEnabled: false,
    mintStartDetectionConfig: null,
    readyCheckFunction: "",
    readyCheckArgs: "[]",
    readyCheckMode: "truthy",
    readyCheckExpected: "",
    readyCheckIntervalMs: "1000",
    pollIntervalMs: "1000",
    txTimeoutMs: "",
    maxRetries: "1",
    retryDelayMs: "1000",
    retryWindowMs: "1800000",
    startJitterMs: "0",
    minBalanceEth: "",
    nonceOffset: "0",
    smartGasReplacement: false,
    replacementBumpPercent: "12",
    replacementMaxAttempts: "2",
    privateRelayEnabled: false,
    privateRelayUrl: "",
    privateRelayMethod: "eth_sendRawTransaction",
    privateRelayHeadersJson: "",
    privateRelayOnly: false,
    executionTriggerMode: "standard",
    triggerContractAddress: "",
    triggerEventSignature: "",
    triggerEventCondition: "",
    triggerMempoolSignature: "",
    triggerBlockNumber: "",
    triggerTimeoutMs: "",
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
  const useSchedule = Boolean(payload.useSchedule ?? base.useSchedule ?? false);
  const waitUntilIso = String(payload.waitUntilIso ?? base.waitUntilIso ?? "").trim();
  const retryWindowMs = String(payload.retryWindowMs ?? base.retryWindowMs ?? "1800000").trim() || "1800000";
  const scheduleConfigChanged =
    !existingTask ||
    useSchedule !== Boolean(base.useSchedule) ||
    waitUntilIso !== String(base.waitUntilIso || "").trim();
  const schedulePending =
    useSchedule && waitUntilIso
      ? scheduleConfigChanged
        ? true
        : Boolean(base.schedulePending)
      : false;
  const mintStartDetectionConfig =
    payload.mintStartDetectionConfig && typeof payload.mintStartDetectionConfig === "object"
      ? payload.mintStartDetectionConfig
      : base.mintStartDetectionConfig && typeof base.mintStartDetectionConfig === "object"
        ? base.mintStartDetectionConfig
        : null;

  return {
    ...base,
    name: String(payload.name || base.name).trim() || "Untitled Task",
    contractAddress: String(payload.contractAddress || "").trim(),
    chainKey: String(payload.chainKey || base.chainKey || "base_sepolia"),
    quantityPerWallet: Math.max(1, Number(payload.quantityPerWallet || base.quantityPerWallet || 1)),
    priceEth: String(payload.priceEth ?? base.priceEth ?? "").trim(),
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
    mintFunction: String(payload.mintFunction ?? base.mintFunction ?? "").trim(),
    mintArgs: String(payload.mintArgs ?? base.mintArgs ?? "").trim(),
    gasStrategy: normalizeGasStrategyValue(payload.gasStrategy || base.gasStrategy || "normal"),
    gasLimit: String(payload.gasLimit ?? base.gasLimit ?? "").trim(),
    maxFeeGwei: String(payload.maxFeeGwei ?? base.maxFeeGwei ?? "").trim(),
    maxPriorityFeeGwei: String(payload.maxPriorityFeeGwei ?? base.maxPriorityFeeGwei ?? "").trim(),
    gasBoostPercent: String(payload.gasBoostPercent ?? base.gasBoostPercent ?? "0").trim() || "0",
    priorityBoostPercent: String(
      payload.priorityBoostPercent ?? base.priorityBoostPercent ?? "0"
    ).trim() || "0",
    simulateTransaction: Boolean(payload.simulateTransaction ?? base.simulateTransaction ?? true),
    dryRun: Boolean(payload.dryRun ?? base.dryRun ?? false),
    waitForReceipt: Boolean(payload.waitForReceipt ?? base.waitForReceipt ?? true),
    warmupRpc: Boolean(payload.warmupRpc ?? base.warmupRpc ?? true),
    continueOnError: Boolean(payload.continueOnError ?? base.continueOnError ?? false),
    walletMode: String(payload.walletMode || base.walletMode || "parallel"),
    useSchedule,
    waitUntilIso,
    preSignTransactions: true,
    multiRpcBroadcast: Boolean(payload.multiRpcBroadcast ?? base.multiRpcBroadcast ?? false),
    schedulePending,
    mintStartDetectionEnabled: Boolean(
      payload.mintStartDetectionEnabled ?? base.mintStartDetectionEnabled ?? false
    ),
    mintStartDetectionConfig,
    readyCheckFunction: String(payload.readyCheckFunction ?? base.readyCheckFunction ?? "").trim(),
    readyCheckArgs: String(payload.readyCheckArgs ?? base.readyCheckArgs ?? "[]").trim() || "[]",
    readyCheckMode: String(payload.readyCheckMode || base.readyCheckMode || "truthy"),
    readyCheckExpected: String(payload.readyCheckExpected ?? base.readyCheckExpected ?? "").trim(),
    readyCheckIntervalMs: String(
      payload.readyCheckIntervalMs ?? base.readyCheckIntervalMs ?? "1000"
    ).trim() || "1000",
    pollIntervalMs: String(payload.pollIntervalMs ?? base.pollIntervalMs ?? "1000").trim() || "1000",
    txTimeoutMs: String(payload.txTimeoutMs ?? base.txTimeoutMs ?? "").trim(),
    maxRetries: String(payload.maxRetries ?? base.maxRetries ?? "1").trim() || "1",
    retryDelayMs: String(payload.retryDelayMs ?? base.retryDelayMs ?? "1000").trim() || "1000",
    retryWindowMs,
    startJitterMs: String(payload.startJitterMs ?? base.startJitterMs ?? "0").trim() || "0",
    minBalanceEth: String(payload.minBalanceEth ?? base.minBalanceEth ?? "").trim(),
    nonceOffset: String(payload.nonceOffset ?? base.nonceOffset ?? "0").trim() || "0",
    smartGasReplacement: Boolean(payload.smartGasReplacement ?? base.smartGasReplacement ?? false),
    replacementBumpPercent: String(
      payload.replacementBumpPercent ?? base.replacementBumpPercent ?? "12"
    ).trim() || "12",
    replacementMaxAttempts: String(
      payload.replacementMaxAttempts ?? base.replacementMaxAttempts ?? "2"
    ).trim() || "2",
    privateRelayEnabled: Boolean(payload.privateRelayEnabled ?? base.privateRelayEnabled ?? false),
    privateRelayUrl: String(payload.privateRelayUrl ?? base.privateRelayUrl ?? "").trim(),
    privateRelayMethod:
      String(payload.privateRelayMethod ?? base.privateRelayMethod ?? "eth_sendRawTransaction").trim() ||
      "eth_sendRawTransaction",
    privateRelayHeadersJson: String(
      payload.privateRelayHeadersJson ?? base.privateRelayHeadersJson ?? ""
    ).trim(),
    privateRelayOnly: Boolean(payload.privateRelayOnly ?? base.privateRelayOnly ?? false),
    executionTriggerMode:
      String(payload.executionTriggerMode ?? base.executionTriggerMode ?? "standard").trim() ||
      "standard",
    triggerContractAddress: String(
      payload.triggerContractAddress ?? base.triggerContractAddress ?? ""
    ).trim(),
    triggerEventSignature: String(
      payload.triggerEventSignature ?? base.triggerEventSignature ?? ""
    ).trim(),
    triggerEventCondition: String(
      payload.triggerEventCondition ?? base.triggerEventCondition ?? ""
    ).trim(),
    triggerMempoolSignature: String(
      payload.triggerMempoolSignature ?? base.triggerMempoolSignature ?? ""
    ).trim(),
    triggerBlockNumber: String(payload.triggerBlockNumber ?? base.triggerBlockNumber ?? "").trim(),
    triggerTimeoutMs: String(payload.triggerTimeoutMs ?? base.triggerTimeoutMs ?? "").trim(),
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

function parseTaskAbiEntries(abiJson) {
  const parsedAbi = JSON.parse(abiJson);
  const abiEntries = Array.isArray(parsedAbi) ? parsedAbi : parsedAbi?.abi;
  if (!Array.isArray(abiEntries)) {
    throw new Error("ABI must be a JSON array or an object with an abi array");
  }

  return abiEntries;
}

function abiFunctionNameMap(abiEntries) {
  return abiEntries.reduce((map, entry) => {
    if (entry?.type !== "function" || typeof entry.name !== "string") {
      return map;
    }

    const name = entry.name.trim();
    if (!name) {
      return map;
    }

    const lowerName = name.toLowerCase();
    if (!map.has(lowerName)) {
      map.set(lowerName, name);
    }
    return map;
  }, new Map());
}

function abiFunctionEntries(abiEntries) {
  return abiEntries
    .filter((entry) => entry?.type === "function" && typeof entry.name === "string" && entry.name.trim())
    .map((entry) => ({
      ...entry,
      name: entry.name.trim()
    }));
}

function writableAbiFunctionEntries(abiEntries) {
  return abiFunctionEntries(abiEntries).filter((entry) => {
    const stateMutability = String(entry.stateMutability || "").toLowerCase();
    return stateMutability !== "view" && stateMutability !== "pure";
  });
}

const preferredMintFunctionNames = [
  "mint",
  "publicMint",
  "safeMint",
  "publicSaleMint",
  "saleMint",
  "presaleMint",
  "allowlistMint",
  "whitelistMint",
  "mintAllowlist",
  "mintWhitelist",
  "mintPresale",
  "mintPublic",
  "mintTo",
  "claim",
  "buy",
  "purchase",
  "redeem"
];

const preferredMintFunctionNameSet = new Set(
  preferredMintFunctionNames.map((name) => normalizeAbiName(name))
);

function mintFunctionCandidateScore(entry) {
  const normalizedName = normalizeAbiName(entry?.name);
  if (!normalizedName) {
    return -1;
  }

  if (/^(set|get|is|has|supports|owner|admin|pause|unpause|toggle|update|edit|configure|config|withdraw)/.test(normalizedName)) {
    return -1;
  }

  let score = 0;

  if (preferredMintFunctionNameSet.has(normalizedName)) {
    score += 1000;
  }

  if (/mint/.test(normalizedName)) {
    score += 500;
  }

  if (/claim|buy|purchase|redeem/.test(normalizedName)) {
    score += 450;
  }

  if (/public|sale|allowlist|whitelist|presale/.test(normalizedName)) {
    score += 120;
  }

  if (/airdrop|reserve|owner|admin|team|dev|gift|promo|partner/.test(normalizedName)) {
    score -= 250;
  }

  if (
    /price|cost|fee|state|status|active|open|live|start|end|time|date|phase|paused|supply|limit|max|remaining|nonce|proof|signature|signer|root|baseuri|tokenuri|balanceof|ownerof/.test(
      normalizedName
    )
  ) {
    score -= 150;
  }

  if (String(entry.stateMutability || "").toLowerCase() === "payable") {
    score += 50;
  }

  return score;
}

function detectMintFunctionsFromAbi(abiEntries) {
  const namesByLower = abiFunctionNameMap(abiEntries);
  const explicitMatches = preferredMintFunctionNames
    .map((name) => namesByLower.get(name.toLowerCase()) || null)
    .filter((name, index, values) => Boolean(name) && values.indexOf(name) === index);
  const inferredMatches = writableAbiFunctionEntries(abiEntries)
    .map((entry) => ({
      name: entry.name,
      score: mintFunctionCandidateScore(entry)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .map((candidate) => candidate.name);

  return [...explicitMatches, ...inferredMatches].filter(
    (name, index, values) => Boolean(name) && values.indexOf(name) === index
  );
}

function describeMintFunctionDetection(abiEntries, detectedFunctions) {
  const functionCount = abiFunctionEntries(abiEntries).length;
  if (functionCount === 0) {
    return "The loaded ABI contains 0 functions. Load the correct contract ABI JSON first";
  }

  if (detectedFunctions.length > 0) {
    return `Detected candidate mint functions: ${detectedFunctions.join(", ")}`;
  }

  const availableWriteFunctions = writableAbiFunctionEntries(abiEntries)
    .map((entry) => entry.name)
    .slice(0, 5);
  if (availableWriteFunctions.length > 0) {
    return `No common mint function was detected. Available write functions: ${availableWriteFunctions.join(", ")}`;
  }

  return `The ABI contains ${functionCount} functions, but no writable mint candidates were detected`;
}

function resolveMintFunctionFromAbi(abiEntries, requestedFunction = "") {
  const namesByLower = abiFunctionNameMap(abiEntries);
  const detectedFunctions = detectMintFunctionsFromAbi(abiEntries);
  const requested = String(requestedFunction || "").trim();
  const matchedRequestedFunction = requested ? namesByLower.get(requested.toLowerCase()) || "" : "";

  return {
    detectedFunctions,
    mintFunction: matchedRequestedFunction || detectedFunctions[0] || requested,
    wasAutoDetected: Boolean(!matchedRequestedFunction && detectedFunctions[0])
  };
}

function findAbiFunctionEntry(abiEntries, functionName) {
  const requested = String(functionName || "").trim().toLowerCase();
  if (!requested) {
    return null;
  }

  return (
    abiEntries.find(
      (entry) =>
        entry?.type === "function" &&
        typeof entry.name === "string" &&
        entry.name.trim().toLowerCase() === requested
    ) || null
  );
}

function normalizeAbiName(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isIntegerAbiType(type) {
  return /^u?int(\d+)?$/i.test(String(type || ""));
}

function inferTaskPlatformFromAbi(abiEntries, mintFunction = "") {
  const mintEntry = findAbiFunctionEntry(abiEntries, mintFunction);
  const abiNames = abiEntries
    .filter((entry) => typeof entry?.name === "string")
    .map((entry) => entry.name.toLowerCase());
  const mintInputNames = (mintEntry?.inputs || []).map((input) => normalizeAbiName(input?.name));
  const mintInputTypes = (mintEntry?.inputs || []).map((input) => String(input?.type || "").toLowerCase());

  const hasAllowlistPattern =
    [mintFunction, ...abiNames].some((name) => /allow|white|merkle|proof|presale|claim|signature|voucher/i.test(name)) ||
    mintInputNames.some((name) => /allow|white|merkle|proof|presale|claim|signature|voucher/i.test(name)) ||
    mintInputTypes.some((type) => type === "bytes32[]" || type === "bytes" || type === "bytes32");

  const hasErc1155Pattern =
    abiEntries.some(
      (entry) =>
        entry?.type === "function" &&
        entry.name === "balanceOf" &&
        Array.isArray(entry.inputs) &&
        entry.inputs.length === 2
    ) ||
    abiEntries.some((entry) => entry?.type === "function" && entry.name === "uri") ||
    abiEntries.some(
      (entry) => entry?.type === "event" && /TransferSingle|TransferBatch/.test(String(entry.name || ""))
    );

  const hasErc721Pattern =
    abiEntries.some((entry) => entry?.type === "function" && entry.name === "ownerOf") ||
    abiEntries.some((entry) => entry?.type === "function" && entry.name === "tokenURI") ||
    abiEntries.some((entry) => entry?.type === "event" && entry.name === "Transfer");

  if (hasAllowlistPattern) {
    return "Allowlist Mint";
  }

  if (hasErc1155Pattern) {
    return "ERC1155 Mint";
  }

  if (hasErc721Pattern) {
    return "ERC721 Public Mint";
  }

  return "Generic EVM (auto-detect)";
}

function looksLikeQuantityInput(input, inputIndex, totalInputs) {
  const normalizedName = normalizeAbiName(input?.name);
  if (!isIntegerAbiType(input?.type)) {
    return false;
  }

  if (
    /id|tokenid|proof|phase|nonce|timestamp|max|limit|sale|price|cost|wei|eth|index/.test(
      normalizedName
    )
  ) {
    return false;
  }

  if (
    /qty|quantity|count|mintamount|mintqty|requestedquantity|numberoftokens|numberofnfts|numtokens|tokenquantity|amount/.test(
      normalizedName
    )
  ) {
    return true;
  }

  return totalInputs === 1 && inputIndex === 0;
}

function defaultValueForAbiInput(input, inputIndex, totalInputs) {
  const type = String(input?.type || "");

  if (/^address$/i.test(type)) {
    return "{{wallet}}";
  }

  if (/\[\]$/.test(type)) {
    return [];
  }

  if (/^bool$/i.test(type)) {
    return false;
  }

  if (/^string$/i.test(type)) {
    return "";
  }

  if (/^bytes(\d+)?$/i.test(type)) {
    return "0x";
  }

  if (/^tuple/i.test(type)) {
    return null;
  }

  if (isIntegerAbiType(type)) {
    return looksLikeQuantityInput(input, inputIndex, totalInputs) ? 1 : 0;
  }

  return null;
}

function inferMintArgsFromAbi(abiEntries, mintFunction = "") {
  const mintEntry = findAbiFunctionEntry(abiEntries, mintFunction);
  if (!mintEntry?.inputs?.length) {
    return [];
  }

  return mintEntry.inputs.map((input, inputIndex) =>
    defaultValueForAbiInput(input, inputIndex, mintEntry.inputs.length)
  );
}

function formatEthString(value) {
  if (typeof value !== "bigint") {
    return null;
  }

  const formatted = ethers.formatEther(value);
  const trimmed = formatted.includes(".") ? formatted.replace(/\.?0+$/, "") : formatted;
  return trimmed || "0";
}

function getChainRpcNodes(chainKey) {
  return (appState?.rpcNodes || []).filter((node) => node.enabled && node.chainKey === chainKey);
}

async function createReadProviderForChain(chainKey) {
  const chainRpcNodes = getChainRpcNodes(chainKey);
  if (chainRpcNodes.length === 0) {
    return {
      provider: null,
      rpcNode: null,
      warning: `No enabled RPC nodes configured for ${chainKey}`
    };
  }

  let lastError = null;

  for (const rpcNode of chainRpcNodes) {
    const provider = new ethers.JsonRpcProvider(rpcNode.url);
    try {
      await provider.getBlockNumber();
      return {
        provider,
        rpcNode,
        warning: null
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    provider: null,
    rpcNode: null,
    warning: lastError ? `Unable to reach configured RPC nodes: ${formatError(lastError)}` : null
  };
}

async function inferMintPriceFromContract({ chainKey, contractAddress, abiEntries }) {
  const preferredPriceFunctions = [
    "mintPrice",
    "publicMintPrice",
    "publicSalePrice",
    "publicPrice",
    "salePrice",
    "price",
    "cost",
    "mintCost",
    "mintFee",
    "whitelistPrice",
    "allowlistPrice",
    "presalePrice",
    "wlPrice",
    "tokenPrice",
    "getMintPrice",
    "getPrice",
    "getCost",
    "pricePerToken"
  ];
  const { provider, rpcNode, warning } = await createReadProviderForChain(chainKey);

  if (!provider) {
    return {
      priceEth: null,
      priceSource: null,
      warning
    };
  }

  const contract = new ethers.Contract(contractAddress, abiEntries, provider);
  const namesByLower = abiFunctionNameMap(abiEntries);

  for (const preferredName of preferredPriceFunctions) {
    const actualName = namesByLower.get(preferredName.toLowerCase());
    if (!actualName) {
      continue;
    }

    const priceEntry = findAbiFunctionEntry(abiEntries, actualName);
    if (!priceEntry || priceEntry.inputs?.length > 0 || !["view", "pure"].includes(priceEntry.stateMutability)) {
      continue;
    }

    try {
      const value = await contract[actualName]();
      const priceEth = formatEthString(value);
      if (priceEth === null) {
        continue;
      }

      return {
        priceEth,
        priceSource: actualName,
        warning: null,
        rpcNodeName: rpcNode?.name || null
      };
    } catch {
      // Keep trying other view functions.
    }
  }

  return {
    priceEth: null,
    priceSource: null,
    warning: null,
    rpcNodeName: rpcNode?.name || null
  };
}

function getReadOnlyAbiFunctions(abiEntries) {
  return abiEntries.filter(
    (entry) =>
      entry?.type === "function" &&
      Array.isArray(entry.inputs) &&
      entry.inputs.length === 0 &&
      Array.isArray(entry.outputs) &&
      entry.outputs.length <= 1 &&
      ["view", "pure"].includes(entry.stateMutability)
  );
}

function findMintStartReadFunction(abiEntries, preferredNames, outputMatcher = () => true) {
  const namesByLower = abiFunctionNameMap(abiEntries);

  for (const preferredName of preferredNames) {
    const actualName = namesByLower.get(preferredName.toLowerCase());
    if (!actualName) {
      continue;
    }

    const entry = findAbiFunctionEntry(abiEntries, actualName);
    if (
      entry &&
      Array.isArray(entry.inputs) &&
      entry.inputs.length === 0 &&
      Array.isArray(entry.outputs) &&
      entry.outputs.length <= 1 &&
      ["view", "pure"].includes(entry.stateMutability) &&
      outputMatcher(entry.outputs?.[0]?.type)
    ) {
      return actualName;
    }
  }

  return null;
}

function detectMintStartFunctionsFromAbi(abiEntries) {
  const readOnlyFunctions = getReadOnlyAbiFunctions(abiEntries);
  const readOnlyFunctionNames = new Set(readOnlyFunctions.map((entry) => entry.name.toLowerCase()));
  const saleActiveFunction = findMintStartReadFunction(
    abiEntries,
    [
      "saleActive",
      "isSaleActive",
      "publicSaleActive",
      "isPublicSaleActive",
      "mintActive",
      "isMintActive",
      "publicMintActive",
      "saleOpen",
      "isSaleOpen",
      "publicSaleOpen",
      "isPublicSaleOpen",
      "mintOpen",
      "isMintOpen",
      "mintLive",
      "isMintLive",
      "mintStarted",
      "isMintStarted",
      "live",
      "isLive"
    ],
    (type) => /^bool$/i.test(String(type || ""))
  );
  const pausedFunction = findMintStartReadFunction(
    abiEntries,
    ["paused", "isPaused", "mintPaused", "salePaused", "publicSalePaused"],
    (type) => /^bool$/i.test(String(type || ""))
  );
  const totalSupplyFunction = findMintStartReadFunction(
    abiEntries,
    ["totalSupply", "minted", "mintedSupply", "tokensMinted", "currentSupply", "supply"],
    (type) => isIntegerAbiType(type)
  );

  const stateFunction =
    findMintStartReadFunction(
      abiEntries,
      [
        "saleState",
        "publicSaleState",
        "state",
        "mintState",
        "dropState",
        "phase",
        "salePhase",
        "status",
        "mintStatus"
      ],
      (type) => /^bool$/i.test(String(type || "")) || isIntegerAbiType(type) || /^string$/i.test(String(type || ""))
    ) ||
    readOnlyFunctions.find((entry) => {
      if (readOnlyFunctionNames.has(entry.name.toLowerCase())) {
        return /state|phase|status/i.test(entry.name);
      }

      return false;
    })?.name ||
    null;

  const enabled = Boolean(saleActiveFunction || stateFunction);
  const signals = [
    saleActiveFunction ? `${saleActiveFunction}()` : null,
    pausedFunction ? `${pausedFunction}()` : null,
    totalSupplyFunction ? `${totalSupplyFunction}()` : null,
    stateFunction ? `${stateFunction}()` : null
  ].filter(Boolean);

  return {
    enabled,
    pollIntervalMs: 500,
    saleActiveFunction,
    pausedFunction,
    totalSupplyFunction,
    stateFunction,
    signals
  };
}

async function buildMintAutofill({ chainKey, contractAddress, abiEntries, requestedFunction = "" }) {
  const resolvedMintFunction = resolveMintFunctionFromAbi(abiEntries, requestedFunction);
  const warnings = [];
  const mintStartDetection = detectMintStartFunctionsFromAbi(abiEntries);
  const priceResolution =
    chainKey && contractAddress && ethers.isAddress(contractAddress)
      ? await inferMintPriceFromContract({ chainKey, contractAddress, abiEntries })
      : {
          priceEth: null,
          priceSource: null,
          warning: contractAddress ? "Contract address must be a valid EVM address for price detection" : null,
          rpcNodeName: null
        };

  if (priceResolution.warning) {
    warnings.push(priceResolution.warning);
  }

  return {
    mintFunction: resolvedMintFunction.mintFunction,
    mintArgs: inferMintArgsFromAbi(abiEntries, resolvedMintFunction.mintFunction),
    quantityPerWallet: 1,
    priceEth: priceResolution.priceEth || "0",
    platform: inferTaskPlatformFromAbi(abiEntries, resolvedMintFunction.mintFunction),
    detectedMintFunctions: resolvedMintFunction.detectedFunctions,
    mintStartDetection,
    priceSource: priceResolution.priceSource,
    rpcNodeName: priceResolution.rpcNodeName || null,
    warnings
  };
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
      // Ignore invalid keys from env bootstrapping.
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

function mapTaskRuntimeEntries(entries = []) {
  return entries.reduce((map, entry) => {
    map[entry.taskId] = entry;
    return map;
  }, {});
}

function mapTaskHistoryEntries(entries = []) {
  return entries.reduce((map, entry) => {
    if (!map[entry.taskId]) {
      map[entry.taskId] = [];
    }

    map[entry.taskId].push(entry);
    return map;
  }, {});
}

function chainLabel(chainKey) {
  return chainCatalog.find((entry) => entry.key === chainKey)?.label || chainKey || "Unknown";
}

async function reloadIntegrationSecrets() {
  const nextSecrets = {};

  for (const [secretName, storageKey] of Object.entries(secretStorageKeys)) {
    const ciphertext = await database.getSecret(storageKey);
    if (!ciphertext) {
      continue;
    }

    nextSecrets[secretName] = decryptSecret(ciphertext);
  }

  integrationSecrets = nextSecrets;
}

function buildPublicSettings() {
  return buildClientSettings(appState?.settings, integrationSecrets);
}

function extractPersistentState() {
  return normalizePersistentState({
    tasks: appState.tasks,
    rpcNodes: appState.rpcNodes.filter((node) => node.source !== "env"),
    settings: appState.settings
  });
}

async function reloadAppState() {
  const persistentState = normalizePersistentState(await database.loadState());
  const storedWallets = await database.listWallets();
  const { records: envWallets } = buildEnvWalletEntries();
  const envRpcNodes = buildEnvRpcNodes();
  const taskIds = persistentState.tasks.map((task) => task.id);
  const [taskRuntimeEntries, taskHistoryEntries] = await Promise.all([
    database.listTaskRuntime(taskIds),
    database.listTaskHistory(taskIds, 8)
  ]);
  await reloadIntegrationSecrets();

  appState = {
    ...persistentState,
    wallets: mergeWalletInventories(storedWallets, envWallets),
    rpcNodes: mergeRpcInventories(persistentState.rpcNodes, envRpcNodes),
    taskRuntimeById: mapTaskRuntimeEntries(taskRuntimeEntries),
    taskHistoryByTaskId: mapTaskHistoryEntries(taskHistoryEntries)
  };
}

async function persistAppState() {
  await database.saveState(extractPersistentState());
}

async function syncDistributedQueueSnapshot() {
  if (!queueCoordinator?.enabled) {
    distributedRunState = createIdleRunState(getQueueConfig());
    distributedQueuedTaskIds.clear();
    return;
  }

  const [runState, queuedJobs] = await Promise.all([
    queueCoordinator.getRunState(),
    queueCoordinator.listQueuedJobs()
  ]);

  distributedRunState = runState || createIdleRunState(getQueueConfig());
  distributedQueuedTaskIds.clear();
  queuedJobs.forEach((job) => {
    if (job?.taskId) {
      distributedQueuedTaskIds.add(job.taskId);
    }
  });
}

function applyRunStateUpdate(runState) {
  distributedRunState = runState || createIdleRunState(getQueueConfig());
  const activeTaskIds = distributedRunState.activeTaskIds || [];
  if (!distributedRunState.activeTaskId && activeTaskIds.length === 0) {
    distributedTaskPatches.clear();
  }
  emitState();
}

async function refreshDistributedState() {
  await reloadAppState();
  await syncDistributedQueueSnapshot();
  emitState();
}

async function initializeQueueMode() {
  if (!queueModeEnabled() || queueCoordinator) {
    if (!queueModeEnabled()) {
      distributedRunState = createIdleRunState(getQueueConfig());
    }
    return;
  }

  queueCoordinator = await createRedisCoordinator(getQueueConfig(), {
    subscribe: true
  });
  await syncDistributedQueueSnapshot();

  await queueCoordinator.subscribeToEvents((message) => {
    if (!message?.type) {
      return;
    }

    if (message.type === "log" && message.payload?.entry) {
      const task = getTaskById(message.payload.taskId);
      pushLog(message.payload.entry);
      updateTaskProgressFromLog(task, message.payload.entry);
      return;
    }

    if (message.type === "run-state" && message.payload?.runState) {
      const activeTaskIds = message.payload.runState.activeTaskIds || [];
      if (message.payload.runState.activeTaskId) {
        distributedQueuedTaskIds.delete(message.payload.runState.activeTaskId);
      }
      activeTaskIds.forEach((taskId) => {
        distributedQueuedTaskIds.delete(taskId);
      });
      if (activeTaskIds.length === 0 && message.payload.runState.activeTaskId == null) {
        void refreshDistributedState().catch(reportBackgroundError);
      }
      applyRunStateUpdate(message.payload.runState);
      return;
    }

    if (message.type === "task-queued" && message.payload?.taskId) {
      distributedQueuedTaskIds.add(message.payload.taskId);
      clearDistributedTaskPatch(message.payload.taskId);
      emitState();
      return;
    }

    if (message.type === "task-dequeued" && message.payload?.taskId) {
      distributedQueuedTaskIds.delete(message.payload.taskId);
      emitState();
      return;
    }

    if (message.type === "task-sync") {
      clearDistributedTaskPatch(message.payload?.taskId);
      void refreshDistributedState().catch(reportBackgroundError);
    }
  });
}

async function migrateLegacyStateIfNeeded() {
  if (!fs.existsSync(legacyStatePath)) {
    return;
  }

  const currentState = await database.loadState();
  const storedWallets = await database.listWallets();
  const hasPersistedData =
    currentState.tasks.length > 0 ||
    currentState.rpcNodes.length > 0 ||
    storedWallets.length > 0;

  if (hasPersistedData) {
    return;
  }

  let legacyState;
  try {
    legacyState = JSON.parse(fs.readFileSync(legacyStatePath, "utf8"));
  } catch (error) {
    console.error("Unable to parse legacy dashboard state:");
    console.error(error);
    return;
  }

  await database.saveState({
    tasks: Array.isArray(legacyState.tasks) ? legacyState.tasks : [],
    rpcNodes: Array.isArray(legacyState.rpcNodes)
      ? legacyState.rpcNodes.filter((node) => node && node.url)
      : [],
    settings: legacyState.settings
  });

  const envWalletAddresses = new Set(
    buildEnvWalletEntries().records.map((wallet) => wallet.address.toLowerCase())
  );
  const knownAddresses = new Set(storedWallets.map((wallet) => wallet.address.toLowerCase()));

  for (const legacyWallet of Array.isArray(legacyState.wallets) ? legacyState.wallets : []) {
    if (!legacyWallet?.privateKey) {
      continue;
    }

    try {
      const address = deriveAddress(legacyWallet.privateKey);
      const addressLower = address.toLowerCase();
      if (knownAddresses.has(addressLower) || envWalletAddresses.has(addressLower)) {
        continue;
      }

      await database.insertWallet({
        id: legacyWallet.id || createId("wallet"),
        label: legacyWallet.label || "Migrated Wallet",
        address,
        addressShort: legacyWallet.addressShort || truncateMiddle(address),
        secretCiphertext: encryptSecret(legacyWallet.privateKey),
        group: legacyWallet.group || "Migrated",
        status: legacyWallet.status || "ready",
        source: "stored",
        createdAt: legacyWallet.createdAt || new Date().toISOString(),
        updatedAt: legacyWallet.updatedAt || new Date().toISOString()
      });
      knownAddresses.add(addressLower);
    } catch {
      // Ignore invalid legacy keys during migration.
    }
  }

  console.log("Migrated legacy dashboard state from dist/dashboard-state.json into Postgres.");
}

async function ensureAdminUser() {
  if (!authIsRequired()) {
    return;
  }

  const username = String(process.env.ADMIN_USERNAME || "admin").trim() || "admin";
  const passwordHash = !isBlank(process.env.ADMIN_PASSWORD_HASH)
    ? String(process.env.ADMIN_PASSWORD_HASH).trim()
    : !isBlank(process.env.ADMIN_PASSWORD)
      ? hashPassword(process.env.ADMIN_PASSWORD)
      : null;

  if (!passwordHash) {
    throw new Error(
      "Auth is enabled but ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is not configured."
    );
  }

  await database.upsertUser({
    id: `user_${hashForId(username)}`,
    username,
    passwordHash
  });
  await database.deleteExpiredSessions();
}

async function initializeServer() {
  if (initialized) {
    return;
  }

  database = createDatabase();
  await database.ensureSchema();
  await database.ensureBaseState();
  await migrateLegacyStateIfNeeded();
  await ensureAdminUser();
  await reloadAppState();
  await initializeQueueMode();
  initialized = true;
  ensureScheduledTaskLoop();
}

function getRunState() {
  const activeRuns = listActiveRuns();
  const activeTaskIds = activeRuns.map((entry) => entry.taskId);
  const primaryActiveRun = activeRuns[0] || null;

  if (queueModeEnabled()) {
    return {
      ...distributedRunState,
      status:
        activeTaskIds.length > 0
          ? "running"
          : distributedQueuedTaskIds.size > 0
            ? "queued"
            : "idle",
      activeTaskId: primaryActiveRun?.taskId || null,
      activeTaskIds,
      activeRuns,
      startedAt: primaryActiveRun?.startedAt || null,
      workerId: primaryActiveRun?.workerId || null,
      queueMode: "redis",
      queuedTaskIds: [...distributedQueuedTaskIds],
      logs: liveLogs.slice(-200)
    };
  }

  return {
    status: activeTaskIds.length > 0 ? "running" : "idle",
    activeTaskId: primaryActiveRun?.taskId || null,
    activeTaskIds,
    activeRuns,
    startedAt: primaryActiveRun?.startedAt || null,
    workerId: null,
    queueMode: "local",
    queuedTaskIds: [],
    logs: liveLogs.slice(-200)
  };
}

function buildTaskResponse(task) {
  const walletIds = Array.isArray(task.walletIds) ? task.walletIds : [];
  const rpcNodeIds = Array.isArray(task.rpcNodeIds) ? task.rpcNodeIds : [];
  const runtime = appState.taskRuntimeById?.[task.id] || null;
  const history = appState.taskHistoryByTaskId?.[task.id] || task.history || [];
  const runtimePatch = distributedTaskPatches.get(task.id) || null;

  const response = {
    ...task,
    gasStrategy: normalizeGasStrategyValue(task.gasStrategy || "normal"),
    preSignTransactions: true,
    walletIds,
    rpcNodeIds,
    walletCount: walletIds.length,
    rpcCount: rpcNodeIds.length,
    history,
    status: runtime?.status || task.status,
    progress: runtime?.progress || task.progress,
    summary: runtime?.summary || task.summary,
    lastRunAt: runtime?.lastRunAt || task.lastRunAt
  };

  if (distributedQueuedTaskIds.has(task.id) && response.status !== "running") {
    response.status = "queued";
    response.progress = response.progress?.percent > 0 ? response.progress : { phase: "Queued", percent: 4 };
  }

  if (runtimePatch) {
    Object.assign(response, runtimePatch);
  }

  return response;
}

function priorityRank(priority) {
  return {
    critical: 3,
    high: 2,
    standard: 1
  }[priority] || 0;
}

function humanizePriority(priority) {
  return priority ? `${priority[0].toUpperCase()}${priority.slice(1)}` : "Standard";
}

function findActiveTask() {
  const currentRunState = getRunState();
  const primaryActiveTaskId = currentRunState.activeTaskIds?.[0] || currentRunState.activeTaskId;
  return primaryActiveTaskId
    ? appState.tasks.find((task) => task.id === primaryActiveTaskId) || null
    : null;
}

function getEligibleRpcNodes(task) {
  const rpcNodeIds = Array.isArray(task.rpcNodeIds) ? task.rpcNodeIds : [];
  return appState.rpcNodes.filter(
    (node) =>
      node.enabled &&
      node.chainKey === task.chainKey &&
      (rpcNodeIds.length === 0 || rpcNodeIds.includes(node.id))
  );
}

function taskReadiness(task) {
  const issues = [];
  let score = 0;
  const walletIds = Array.isArray(task.walletIds) ? task.walletIds : [];

  if (task.contractAddress) {
    score += 25;
  } else {
    issues.push("Missing contract address");
  }

  if (task.abiJson) {
    score += 25;
  } else {
    issues.push("ABI not loaded");
  }

  if (walletIds.length > 0) {
    score += 25;
  } else {
    issues.push("No wallets selected");
  }

  const eligibleRpcNodes = getEligibleRpcNodes(task);
  if (eligibleRpcNodes.length > 0) {
    score += 25;
  } else {
    issues.push("No enabled RPC nodes");
  }

  let health = "blocked";
  if (score >= 100) {
    health = "armed";
  } else if (score >= 50) {
    health = "warming";
  }

  return {
    score,
    health,
    rpcCount: eligibleRpcNodes.length,
    issues
  };
}

function buildTelemetry() {
  const taskViews = appState.tasks.map(buildTaskResponse);
  const activeTask = findActiveTask() ? buildTaskResponse(findActiveTask()) : null;
  const healthyRpcCount = appState.rpcNodes.filter(
    (node) => node.lastHealth?.status === "healthy"
  ).length;
  const unhealthyRpcCount = appState.rpcNodes.filter(
    (node) => node.lastHealth?.status === "error"
  ).length;
  const walletGroupCount = new Set(
    appState.wallets.map((wallet) => wallet.group || "Imported")
  ).size;

  const summaries = taskViews.map((task) => task.summary || {});
  const totalAttempts = summaries.reduce((sum, summary) => sum + (summary.total || 0), 0);
  const successfulAttempts = summaries.reduce((sum, summary) => sum + (summary.success || 0), 0);
  const successRate = totalAttempts ? Math.round((successfulAttempts / totalAttempts) * 100) : 0;
  const currentRunState = getRunState();

  const priorityQueue = [...taskViews]
    .filter((task) => !task.done)
    .sort((left, right) => {
      const priorityDelta = priorityRank(right.priority) - priorityRank(left.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0);
    })
    .slice(0, 5)
    .map((task) => {
      const readiness = taskReadiness(task);
      return {
        id: task.id,
        name: task.name,
        chainKey: task.chainKey,
        chainLabel: chainCatalog.find((entry) => entry.key === task.chainKey)?.label || task.chainKey,
        priority: task.priority,
        priorityLabel: humanizePriority(task.priority),
        status: task.status,
        statusLabel: task.status,
        readinessScore: readiness.score,
        health: readiness.health,
        walletCount: Array.isArray(task.walletIds) ? task.walletIds.length : 0,
        rpcCount: readiness.rpcCount,
        issues: readiness.issues,
        updatedAt: task.updatedAt
      };
    });

  const readinessScore = priorityQueue.length
    ? Math.round(priorityQueue.reduce((sum, task) => sum + task.readinessScore, 0) / priorityQueue.length)
    : 0;

  const chainLoad = Object.entries(
    taskViews.reduce((map, task) => {
      map[task.chainKey] = (map[task.chainKey] || 0) + 1;
      return map;
    }, {})
  )
    .map(([chainKey, count]) => ({
      chainKey,
      label: chainCatalog.find((entry) => entry.key === chainKey)?.label || chainKey,
      count,
      share: taskViews.length ? Math.round((count / taskViews.length) * 100) : 0
    }))
    .sort((left, right) => right.count - left.count);

  const latestRunTask = [...taskViews]
    .filter((task) => task.lastRunAt)
    .sort((left, right) => new Date(right.lastRunAt) - new Date(left.lastRunAt))[0];

  const alerts = [];
  if (appState.wallets.length === 0) {
    alerts.push({
      severity: "critical",
      title: "No wallet fleet loaded",
      detail: "Import at least one wallet before attempting a run."
    });
  }
  if (appState.rpcNodes.length === 0) {
    alerts.push({
      severity: "critical",
      title: "RPC mesh is empty",
      detail: "Add RPC nodes to arm task execution paths."
    });
  }
  if (unhealthyRpcCount > 0) {
    alerts.push({
      severity: "warning",
      title: "RPC degradation detected",
      detail: `${unhealthyRpcCount} node${unhealthyRpcCount === 1 ? "" : "s"} reported an error on the last health check.`
    });
  }
  if (priorityQueue.some((task) => task.health === "blocked")) {
    alerts.push({
      severity: "warning",
      title: "Blocked tasks detected",
      detail: "One or more priority tasks are missing required inputs or RPC coverage."
    });
  }
  if (activeTask) {
    alerts.push({
      severity: "info",
      title: "Run in progress",
      detail:
        currentRunState.activeTaskIds?.length > 1
          ? `${currentRunState.activeTaskIds.length} tasks are currently executing. Primary run: ${activeTask.name} at ${activeTask.progress?.percent || 0}% completion.`
          : `${activeTask.name} is currently executing with ${activeTask.progress?.percent || 0}% completion.`
    });
  }
  if (!alerts.length) {
    alerts.push({
      severity: "info",
      title: "System standing by",
      detail: "No immediate blockers detected in the current secure operator stack."
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    readinessScore,
    successRate,
    healthyRpcCount,
    unhealthyRpcCount,
    walletGroupCount,
    readyTaskCount: priorityQueue.filter((task) => task.health === "armed").length,
    liveLogCount: liveLogs.length,
    runDurationMs: currentRunState.startedAt ? Date.now() - new Date(currentRunState.startedAt).getTime() : 0,
    activeTaskName: activeTask?.name || null,
    topChainLabel: chainLoad[0]?.label || "No chain load",
    lastRunTaskName: latestRunTask?.name || "No history",
    lastRunAt: latestRunTask?.lastRunAt || null,
    priorityQueue,
    chainLoad,
    alerts,
    rpcMatrix: appState.rpcNodes.slice(0, 6).map((node) => ({
      id: node.id,
      name: node.name,
      chainKey: node.chainKey,
      chainLabel: chainCatalog.find((entry) => entry.key === node.chainKey)?.label || node.chainKey,
      status: node.lastHealth?.status || "unknown",
      latencyMs: node.lastHealth?.latencyMs || null,
      checkedAt: node.lastHealth?.checkedAt || null,
      url: node.url
    }))
  };
}

function buildPublicState(includeDefaults = false) {
  const payload = {
    tasks: appState.tasks.map(buildTaskResponse),
    wallets: appState.wallets,
    rpcNodes: appState.rpcNodes,
    settings: buildPublicSettings(),
    chains: chainCatalog,
    telemetry: buildTelemetry(),
    runState: getRunState(),
    authRequired: authIsRequired()
  };

  if (includeDefaults) {
    payload.defaults = defaultInputValues;
  }

  return payload;
}

function emitState() {
  broadcast("state", buildPublicState());
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

async function readJsonBody(request) {
  const rawBody = await readBody(request);
  return rawBody ? JSON.parse(rawBody) : {};
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

function reportBackgroundError(error) {
  console.error("Dashboard background update failed:");
  console.error(error);
}

async function updateTask(taskId, patch) {
  const index = appState.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) {
    return null;
  }

  appState.tasks[index] = {
    ...appState.tasks[index],
    ...patch,
    updatedAt: new Date().toISOString()
  };
  await persistAppState();
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
    schedulePending:
      Boolean(task.useSchedule && task.waitUntilIso) &&
      !Number.isNaN(new Date(task.waitUntilIso).getTime()) &&
      new Date(task.waitUntilIso).getTime() > Date.now(),
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
      if (["success", "submitted", "retried"].includes(result.status)) {
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

function deriveTaskProgressFromLog(task, entry) {
  if (!task) {
    return null;
  }

  const walletIds = Array.isArray(task.walletIds) ? task.walletIds : [];
  const total = Math.max(walletIds.length || 1, 1);
  const summary = task.summary || { total: 0, success: 0, failed: 0, stopped: 0, hashes: [] };
  let phase = task.progress?.phase || "Preparing";
  let percent = task.progress?.percent || 8;

  if (entry.message.includes("Waiting for launch time")) {
    phase = "Scheduled";
    percent = 4;
  } else if (
    entry.message.includes("Waiting for mint start detection") ||
    entry.message.includes("Mint start detection armed")
  ) {
    phase = "Arming";
    percent = Math.max(percent, 12);
  } else if (
    entry.message.includes("Waiting for event trigger") ||
    entry.message.includes("Waiting for mempool trigger")
  ) {
    phase = "Arming";
    percent = Math.max(percent, 10);
  } else if (entry.message.includes("Provider warmup complete")) {
    phase = "Pre-signing";
    percent = Math.max(percent, 18);
  } else if (
    entry.message.includes("Pre-signed mint tx") ||
    entry.message.includes("Mint broadcast armed with a pre-signed transaction")
  ) {
    phase = "Pre-signing";
    percent = Math.max(percent, 36);
  } else if (entry.message.includes("Simulation passed")) {
    phase = "Pre-signing";
    const scanned = Math.min(total, summary.success + summary.failed + summary.stopped + 1);
    percent = Math.max(percent, 20 + Math.round((scanned / total) * 25));
  } else if (
    entry.message.includes("Broadcasting pre-signed mint tx") ||
    entry.message.includes("multi-RPC broadcast")
  ) {
    phase = "Broadcasting";
    percent = Math.max(percent, 55);
  } else if (
    entry.message.includes("Submitted tx") ||
    entry.message.includes("Submitted mint tx") ||
    entry.message.includes("Submitted transfer tx")
  ) {
    phase = "Broadcasting";
    percent = Math.max(percent, 55);
  } else if (
    entry.message.includes("Confirmed in block") ||
    entry.message.includes("confirmed in block") ||
    entry.message.includes("Dry run enabled") ||
    entry.message.includes("Status:") ||
    entry.message.includes("status:")
  ) {
    phase = "Settling";
    percent = Math.max(percent, 76);
  } else if (entry.message.includes("Run summary")) {
    phase = "Finalizing";
    percent = Math.max(percent, 96);
  }

  return {
    phase,
    percent
  };
}

function setDistributedTaskPatch(taskId, patch) {
  if (!taskId) {
    return;
  }

  const current = distributedTaskPatches.get(taskId) || {};
  distributedTaskPatches.set(taskId, {
    ...current,
    ...patch
  });
}

function clearDistributedTaskPatch(taskId) {
  if (!taskId) {
    return;
  }

  distributedTaskPatches.delete(taskId);
}

function updateTaskProgressFromLog(task, entry) {
  const progress = deriveTaskProgressFromLog(task, entry);
  if (!progress) {
    return;
  }

  if (queueModeEnabled()) {
    setDistributedTaskPatch(task.id, {
      status: "running",
      progress
    });
    emitState();
    return;
  }

  void updateTask(task.id, { progress }).catch(reportBackgroundError);
}

function getTaskById(taskId) {
  return appState.tasks.find((task) => task.id === taskId);
}

async function resolveWalletPrivateKeys(walletIds) {
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

async function buildConfigForTask(task) {
  const walletIds = Array.isArray(task.walletIds) ? task.walletIds : [];
  const rpcNodeIds = Array.isArray(task.rpcNodeIds) ? task.rpcNodeIds : [];
  const wallets = appState.wallets.filter((wallet) => walletIds.includes(wallet.id));
  if (wallets.length === 0) {
    throw new Error("Select at least one wallet before running a task");
  }

  const privateKeys = await resolveWalletPrivateKeys(walletIds);
  if (privateKeys.length !== walletIds.length) {
    throw new Error("One or more selected wallets could not be resolved");
  }

  const configuredRpcNodes = appState.rpcNodes.filter(
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
    PRE_SIGN_TRANSACTIONS: true,
    MULTI_RPC_BROADCAST: task.multiRpcBroadcast,
    MINT_START_DETECTION_ENABLED: task.mintStartDetectionEnabled,
    MINT_START_DETECTION_JSON: JSON.stringify(task.mintStartDetectionConfig || {}),
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
    TRIGGER_BLOCK_NUMBER: task.triggerBlockNumber,
    TRIGGER_TIMEOUT_MS: task.triggerTimeoutMs,
    TRANSFER_AFTER_MINTED: task.transferAfterMinted,
    TRANSFER_ADDRESS: task.transferAddress,
    CHAIN_ID: chain ? String(chain.chainId) : "",
    RESULTS_PATH: appState.settings.resultsPath || "./dist/mint-results.json"
  });
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

async function setTaskRuntimeRecord(taskId, patch) {
  const current = appState.taskRuntimeById?.[taskId] || null;
  const nextRecord = await database.upsertTaskRuntime({
    taskId,
    status: patch.status || current?.status || "draft",
    progress: patch.progress || current?.progress || { phase: "Ready", percent: 0 },
    summary: patch.summary || current?.summary || createEmptySummary(),
    active: patch.active ?? current?.active ?? false,
    queued: patch.queued ?? current?.queued ?? false,
    error: patch.error === undefined ? current?.error || null : patch.error,
    workerId: patch.workerId === undefined ? current?.workerId || null : patch.workerId,
    startedAt: patch.startedAt === undefined ? current?.startedAt || null : patch.startedAt,
    lastRunAt: patch.lastRunAt === undefined ? current?.lastRunAt || null : patch.lastRunAt
  });

  appState.taskRuntimeById = {
    ...(appState.taskRuntimeById || {}),
    [taskId]: nextRecord
  };

  return nextRecord;
}

function scheduledTaskTimestamp(task) {
  if (!task?.useSchedule || !task?.schedulePending || !task?.waitUntilIso || task?.done) {
    return null;
  }

  const scheduledAt = new Date(task.waitUntilIso);
  if (Number.isNaN(scheduledAt.getTime())) {
    return null;
  }

  return scheduledAt.getTime();
}

function listDueScheduledTasks() {
  if (!appState?.tasks?.length) {
    return [];
  }

  const now = Date.now();

  return appState.tasks
    .filter((task) => {
      const scheduledAt = scheduledTaskTimestamp(task);
      return scheduledAt != null && scheduledAt <= now;
    })
    .sort((left, right) => {
      const timeDelta = scheduledTaskTimestamp(left) - scheduledTaskTimestamp(right);
      if (timeDelta !== 0) {
        return timeDelta;
      }

      const priorityDelta = priorityRank(right.priority) - priorityRank(left.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
    });
}

async function markScheduledTaskLaunchFailure(taskId, error) {
  const task = getTaskById(taskId);
  if (!task) {
    return;
  }

  await updateTask(taskId, {
    schedulePending: false,
    status: "failed",
    progress: {
      phase: "Schedule Failed",
      percent: 100
    }
  });

  pushLog({
    level: "error",
    message: `Scheduled launch failed for ${task.name}: ${formatError(error)}`,
    timestamp: new Date().toISOString()
  });
}

async function scanAndRunScheduledTasks() {
  if (scheduledTaskScanInFlight || !initialized || !appState) {
    return;
  }

  scheduledTaskScanInFlight = true;

  try {
    const dueTasks = listDueScheduledTasks();
    if (dueTasks.length === 0) {
      return;
    }

    const tasksToLaunch = dueTasks;

    for (const task of tasksToLaunch) {
      if (queueModeEnabled()) {
        if (distributedQueuedTaskIds.has(task.id) || isTaskActive(task.id)) {
          continue;
        }
      } else if (isTaskActive(task.id)) {
        continue;
      }

      pushLog({
        level: "info",
        message: `Auto-starting scheduled task ${task.name}`,
        timestamp: new Date().toISOString()
      });

      try {
        await requestTaskRun(task.id);
      } catch (error) {
        if (error?.statusCode === 409) {
          continue;
        }

        await markScheduledTaskLaunchFailure(task.id, error);
      }
    }
  } finally {
    scheduledTaskScanInFlight = false;
  }
}

function ensureScheduledTaskLoop() {
  if (scheduledTaskLoop) {
    return;
  }

  scheduledTaskLoop = setInterval(() => {
    void scanAndRunScheduledTasks().catch(reportBackgroundError);
  }, scheduledTaskPollIntervalMs);

  void scanAndRunScheduledTasks().catch(reportBackgroundError);
}

async function startTaskRunLocal(taskId) {
  const task = getTaskById(taskId);
  if (!task) {
    throw createHttpError("Task not found", 404);
  }

  if (localTaskRuns.has(taskId)) {
    throw createHttpError("Task is already running", 409);
  }

  const runContext = {
    taskId,
    taskName: task.name,
    controller: new AbortController(),
    startedAt: null,
    active: false
  };
  localTaskRuns.set(taskId, runContext);
  try {
    const config = await buildConfigForTask(task);
    const walletIds = Array.isArray(task.walletIds) ? task.walletIds : [];
    runContext.startedAt = new Date().toISOString();
    runContext.active = true;

    await updateTask(taskId, {
      schedulePending: false,
      status: "running",
      progress: {
        phase: "Preparing",
        percent: 8
      },
      summary: {
        total: walletIds.length,
        success: 0,
        failed: 0,
        stopped: 0,
        hashes: []
      }
    });

    runMintBot(config, {
      signal: runContext.controller.signal,
      onLog(entry) {
        pushLog({
          ...entry,
          taskId,
          message: `[task ${runContext.taskName}] ${entry.message}`
        });
        updateTaskProgressFromLog(getTaskById(taskId), entry);
      }
    })
      .then(async (result) => {
        const summary = summarizeResults(result.results);
        const taskAfterRun = getTaskById(taskId);
        await updateTask(taskId, {
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
      .catch(async (error) => {
        const stopped = error instanceof AbortRunError || runContext.controller.signal.aborted;
        await updateTask(taskId, {
          status: stopped ? "stopped" : "failed",
          progress: {
            phase: stopped ? "Stopped" : "Failed",
            percent: stopped ? 0 : 100
          }
        });
        pushLog({
          level: "error",
          taskId,
          message: `[task ${runContext.taskName}] ${formatError(error)}`,
          timestamp: new Date().toISOString()
        });
      })
      .catch(reportBackgroundError)
      .finally(() => {
        localTaskRuns.delete(taskId);
        emitState();
      });

    emitState();
    return { ok: true };
  } catch (error) {
    localTaskRuns.delete(taskId);
    throw error;
  }
}

async function startTaskRunQueued(taskId) {
  const task = getTaskById(taskId);
  if (!task) {
    throw createHttpError("Task not found", 404);
  }

  if (distributedQueuedTaskIds.has(taskId) || isTaskActive(taskId)) {
    throw createHttpError("Task is already queued or running", 409);
  }

  await buildConfigForTask(task);

  const queuedAt = new Date().toISOString();
  const walletCount = Array.isArray(task.walletIds) ? task.walletIds.length : 0;
  const queueResult = await queueCoordinator.enqueueTask({
    id: createId("job"),
    taskId,
    requestedAt: queuedAt
  });

  if (!queueResult.enqueued) {
    throw createHttpError("Task is already queued", 409);
  }

  await updateTask(taskId, {
    schedulePending: false
  });

  distributedQueuedTaskIds.add(taskId);
  clearDistributedTaskPatch(taskId);
  await setTaskRuntimeRecord(taskId, {
    status: "queued",
    progress: {
      phase: "Queued",
      percent: 4
    },
    summary: createEmptySummary(walletCount),
    active: false,
    queued: true,
    error: null,
    workerId: null,
    startedAt: null
  });
  emitState();

  await queueCoordinator.publishEvent("task-sync", { taskId });
  return { ok: true, queued: true };
}

async function requestTaskRun(taskId) {
  if (queueModeEnabled()) {
    return startTaskRunQueued(taskId);
  }

  return startTaskRunLocal(taskId);
}

async function handleTaskRun(taskId, response) {
  try {
    const payload = await requestTaskRun(taskId);
    sendJson(response, 200, payload);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
}

async function handleTaskDuplicate(taskId, response) {
  const task = getTaskById(taskId);
  if (!task) {
    sendJson(response, 404, { error: "Task not found" });
    return;
  }

  const duplicate = cloneTask(task);
  appState.tasks.unshift(duplicate);
  await persistAppState();
  emitState();
  sendJson(response, 200, { ok: true, task: buildTaskResponse(duplicate) });
}

function handleStopRun(response) {
  if (queueModeEnabled()) {
    const activeTaskIds = listActiveTaskIds();
    if (activeTaskIds.length === 0) {
      sendJson(response, 409, { error: "No task is running" });
      return;
    }

    Promise.all(activeTaskIds.map((taskId) => queueCoordinator.requestStop(taskId)))
      .then(() => {
        activeTaskIds.forEach((taskId) => {
          setDistributedTaskPatch(taskId, {
            progress: {
              phase: "Stop requested",
              percent: Math.max(
                distributedTaskPatches.get(taskId)?.progress?.percent || 0,
                10
              )
            }
          });
        });
        emitState();
        sendJson(response, 200, { ok: true, stoppedTaskIds: activeTaskIds });
      })
      .catch((error) => {
        sendJson(response, 400, { error: formatError(error) });
      });
    return;
  }

  const activeTaskIds = listActiveTaskIds();
  if (activeTaskIds.length === 0) {
    sendJson(response, 409, { error: "No task is running" });
    return;
  }

  activeTaskIds.forEach((taskId) => {
    localTaskRuns.get(taskId)?.controller.abort();
  });
  sendJson(response, 200, { ok: true, stoppedTaskIds: activeTaskIds });
}

function handleTaskStop(taskId, response) {
  const task = getTaskById(taskId);
  if (!task) {
    sendJson(response, 404, { error: "Task not found" });
    return;
  }

  if (queueModeEnabled()) {
    if (!isTaskActive(taskId)) {
      sendJson(response, 409, { error: "Task is not running" });
      return;
    }

    queueCoordinator
      .requestStop(taskId)
      .then(() => {
        setDistributedTaskPatch(taskId, {
          progress: {
            phase: "Stop requested",
            percent: Math.max(
              distributedTaskPatches.get(taskId)?.progress?.percent || 0,
              10
            )
          }
        });
        emitState();
        sendJson(response, 200, { ok: true, taskId });
      })
      .catch((error) => {
        sendJson(response, 400, { error: formatError(error) });
      });
    return;
  }

  const runContext = localTaskRuns.get(taskId);
  if (!runContext) {
    sendJson(response, 409, { error: "Task is not running" });
    return;
  }

  runContext.controller.abort();
  sendJson(response, 200, { ok: true, taskId });
}

async function handleTaskSave(request, response) {
  try {
    const payload = await readJsonBody(request);
    const existingTask = payload.id ? getTaskById(payload.id) : null;
    const task = sanitizeTaskInput(payload, existingTask);
    let abiEntries = null;

    if (!task.contractAddress) {
      throw new Error("Contract address is required");
    }

    if (!task.abiJson) {
      throw new Error("ABI JSON is required");
    }

    try {
      abiEntries = parseTaskAbiEntries(task.abiJson);
    } catch (error) {
      throw new Error(`ABI JSON is invalid: ${formatError(error)}`);
    }

    const resolvedMintFunction = resolveMintFunctionFromAbi(abiEntries, task.mintFunction);
    task.mintFunction = resolvedMintFunction.mintFunction;
    if (!task.mintFunction || !abiFunctionNameMap(abiEntries).has(task.mintFunction.toLowerCase())) {
      throw new Error(
        `Mint function "${task.mintFunction || "(empty)"}" was not found in the ABI. ${describeMintFunctionDetection(
          abiEntries,
          resolvedMintFunction.detectedFunctions
        )}.`
      );
    }

    if ((task.walletIds || []).length === 0) {
      throw new Error("Select at least one wallet");
    }

    if (task.useSchedule) {
      if (!task.waitUntilIso) {
        throw new Error("Start time is required when schedule is enabled");
      }

      const scheduledAt = new Date(task.waitUntilIso);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new Error("Scheduled start time is invalid");
      }
    }

    const retryWindowMs = Number(task.retryWindowMs || 0);
    if (!Number.isInteger(retryWindowMs) || retryWindowMs < 0) {
      throw new Error("Retry window must be a whole number of milliseconds");
    }

    if (task.transferAfterMinted) {
      if (!task.transferAddress) {
        throw new Error("Transfer address is required when transfer-after-minted is enabled");
      }

      if (!ethers.isAddress(task.transferAddress)) {
        throw new Error("Transfer address must be a valid EVM address");
      }
    }

    if (task.smartGasReplacement && !task.txTimeoutMs) {
      throw new Error("Receipt timeout is required when smart gas replacement is enabled");
    }

    if (task.privateRelayEnabled && !task.privateRelayUrl) {
      throw new Error("Private relay URL is required when private relay mode is enabled");
    }

    if (task.privateRelayHeadersJson) {
      let parsedHeaders;
      try {
        parsedHeaders = JSON.parse(task.privateRelayHeadersJson);
      } catch (error) {
        throw new Error(`Private relay headers JSON is invalid: ${formatError(error)}`);
      }

      if (!parsedHeaders || typeof parsedHeaders !== "object" || Array.isArray(parsedHeaders)) {
        throw new Error("Private relay headers must be a JSON object");
      }

      if (Object.values(parsedHeaders).some((value) => typeof value !== "string")) {
        throw new Error("Private relay header values must all be strings");
      }
    }

    if (task.triggerContractAddress && !ethers.isAddress(task.triggerContractAddress)) {
      throw new Error("Trigger contract address must be a valid EVM address");
    }

    if (task.executionTriggerMode === "event" && !task.triggerEventSignature) {
      throw new Error("Event signature is required for event-driven execution");
    }

    if (task.executionTriggerMode === "block") {
      const triggerBlockNumber = Number(task.triggerBlockNumber);
      if (!Number.isInteger(triggerBlockNumber) || triggerBlockNumber < 1) {
        throw new Error("Target block must be a positive whole number for block-driven execution");
      }
    }

    if (task.executionTriggerMode === "mempool") {
      const rpcNodeIds = Array.isArray(task.rpcNodeIds) ? task.rpcNodeIds : [];
      const configuredRpcNodes = appState.rpcNodes.filter(
        (node) =>
          node.enabled &&
          node.chainKey === task.chainKey &&
          (rpcNodeIds.length === 0 || rpcNodeIds.includes(node.id))
      );

      if (
        !configuredRpcNodes.some((node) => /^wss?:\/\//i.test(String(node.url || "")))
      ) {
        throw new Error(
          "Mempool execution requires at least one enabled ws:// or wss:// RPC URL for the selected chain"
        );
      }
    }

    if (existingTask) {
      const index = appState.tasks.findIndex((entry) => entry.id === task.id);
      appState.tasks[index] = task;
    } else {
      appState.tasks.unshift(task);
    }

    await persistAppState();
    emitState();
    sendJson(response, 200, { ok: true, task: buildTaskResponse(task) });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleTaskDelete(taskId, response) {
  const currentRunState = getRunState();
  if ((currentRunState.activeTaskIds || []).includes(taskId)) {
    sendJson(response, 409, { error: "Stop the running task before deleting it" });
    return;
  }

  if (queueModeEnabled() && distributedQueuedTaskIds.has(taskId)) {
    try {
      await queueCoordinator.removeQueuedTask(taskId);
    } catch (error) {
      sendJson(response, 400, { error: formatError(error) });
      return;
    }

    distributedQueuedTaskIds.delete(taskId);
    clearDistributedTaskPatch(taskId);
  }

  const before = appState.tasks.length;
  appState.tasks = appState.tasks.filter((task) => task.id !== taskId);

  if (appState.tasks.length === before) {
    sendJson(response, 404, { error: "Task not found" });
    return;
  }

  await persistAppState();
  await database.deleteTaskArtifacts(taskId);
  if (appState.taskRuntimeById) {
    delete appState.taskRuntimeById[taskId];
  }
  if (appState.taskHistoryByTaskId) {
    delete appState.taskHistoryByTaskId[taskId];
  }
  clearDistributedTaskPatch(taskId);
  emitState();
  sendJson(response, 200, { ok: true });
}

async function handleTaskDone(taskId, response) {
  const task = getTaskById(taskId);
  if (!task) {
    sendJson(response, 404, { error: "Task not found" });
    return;
  }

  await updateTask(taskId, {
    done: !task.done,
    status: task.done ? "draft" : "done"
  });
  sendJson(response, 200, { ok: true });
}

async function handleWalletImport(request, response) {
  try {
    const payload = await readJsonBody(request);
    const privateKeys = parseList(payload.privateKeys);

    if (privateKeys.length === 0) {
      throw new Error("Provide at least one private key");
    }

    const knownAddresses = new Set(appState.wallets.map((wallet) => wallet.address.toLowerCase()));
    const storedWallets = await database.listWallets();
    let imported = 0;
    let skipped = 0;

    for (const privateKey of privateKeys) {
      const address = deriveAddress(privateKey);
      if (knownAddresses.has(address.toLowerCase())) {
        skipped += 1;
        continue;
      }

      const nextIndex = storedWallets.length + imported + 1;
      const label = payload.group ? `${payload.group} ${nextIndex}` : `Wallet ${nextIndex}`;

      await database.insertWallet({
        id: createId("wallet"),
        label,
        address,
        addressShort: truncateMiddle(address),
        secretCiphertext: encryptSecret(privateKey),
        group: payload.group || "Imported",
        status: "ready",
        source: "stored",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      knownAddresses.add(address.toLowerCase());
      imported += 1;
    }

    await reloadAppState();
    emitState();
    sendJson(response, 200, { ok: true, imported, skipped });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleWalletDelete(walletId, response) {
  const wallet = appState.wallets.find((entry) => entry.id === walletId);
  if (!wallet) {
    sendJson(response, 404, { error: "Wallet not found" });
    return;
  }

  if (wallet.source === "env") {
    sendJson(response, 400, { error: "Env wallets are managed through environment variables" });
    return;
  }

  await database.deleteWallet(walletId);
  appState.tasks = appState.tasks.map((task) => ({
    ...task,
    walletIds: (task.walletIds || []).filter((id) => id !== walletId)
  }));
  await persistAppState();
  await reloadAppState();
  emitState();
  sendJson(response, 200, { ok: true });
}

async function handleRpcSave(request, response) {
  try {
    const payload = await readJsonBody(request);

    if (!payload.url) {
      throw new Error("RPC URL is required");
    }

    if (payload.id && String(payload.id).startsWith("rpc_env_")) {
      throw new Error("Env RPC nodes cannot be overwritten from the dashboard");
    }

    const rpcNode = {
      id: payload.id || createId("rpc"),
      name: String(payload.name || "Custom RPC").trim() || "Custom RPC",
      url: String(payload.url).trim(),
      chainKey: String(payload.chainKey || "base_sepolia"),
      enabled: payload.enabled !== false,
      group: payload.group || "Custom",
      source: "stored",
      lastHealth: payload.lastHealth || null
    };

    const storedNodes = appState.rpcNodes.filter((node) => node.source !== "env");
    const existingIndex = storedNodes.findIndex((node) => node.id === rpcNode.id);
    if (existingIndex === -1) {
      storedNodes.unshift(rpcNode);
    } else {
      storedNodes[existingIndex] = rpcNode;
    }

    appState.rpcNodes = mergeRpcInventories(storedNodes, buildEnvRpcNodes());
    await persistAppState();
    emitState();
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function testRpcNodeHealth(rpcNode) {
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
  } catch (error) {
    rpcNode.lastHealth = {
      status: "error",
      error: formatError(error),
      checkedAt: new Date().toISOString()
    };
  }

  return rpcNode.lastHealth;
}

async function handleRpcTest(rpcId, response) {
  const rpcNode = appState.rpcNodes.find((node) => node.id === rpcId);
  if (!rpcNode) {
    sendJson(response, 404, { error: "RPC node not found" });
    return;
  }

  const health = await testRpcNodeHealth(rpcNode);
  await persistAppState();
  emitState();
  sendJson(response, 200, { ok: true, health });
}

async function handleRpcPoolTest(response) {
  if (appState.rpcNodes.length === 0) {
    sendJson(response, 400, { error: "No RPC nodes configured" });
    return;
  }

  const results = [];
  for (const rpcNode of appState.rpcNodes) {
    results.push({
      id: rpcNode.id,
      name: rpcNode.name,
      chainKey: rpcNode.chainKey,
      health: await testRpcNodeHealth(rpcNode)
    });
  }

  await persistAppState();
  emitState();
  sendJson(response, 200, {
    ok: true,
    summary: {
      total: results.length,
      healthy: results.filter((entry) => entry.health.status === "healthy").length,
      error: results.filter((entry) => entry.health.status === "error").length
    },
    results
  });
}

async function handleExplorerAbiLookup(url, response) {
  try {
    const chainKey = String(url.searchParams.get("chainKey") || "").trim();
    const address = String(url.searchParams.get("address") || "").trim();

    if (!chainKey) {
      throw new Error("Chain is required for explorer ABI fetch");
    }

    if (!address) {
      throw new Error("Contract address is required for explorer ABI fetch");
    }

    const chain = chainCatalog.find((entry) => entry.key === chainKey);
    if (!chain?.chainId) {
      throw new Error(`Explorer ABI fetch is not configured for chain ${chainKey}`);
    }

    const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
    const result = await fetchAbiFromExplorer({
      chainId: chain.chainId,
      address,
      apiKey: resolvedSecrets.explorerApiKey
    });
    const autofill = await buildMintAutofill({
      chainKey,
      contractAddress: address,
      abiEntries: result.abi || []
    });

    sendJson(response, 200, {
      ok: true,
      abi: result.abi,
      detectedMintFunction: autofill.detectedMintFunctions[0] || null,
      detectedMintFunctions: autofill.detectedMintFunctions,
      autofill,
      chainKey,
      chainLabel: chain.label,
      provider: "Etherscan V2"
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleContractAutofill(request, response) {
  try {
    const payload = await readJsonBody(request);
    const chainKey = String(payload.chainKey || "").trim();
    const contractAddress = String(payload.contractAddress || payload.address || "").trim();
    const abiEntries = Array.isArray(payload.abi)
      ? payload.abi
      : parseTaskAbiEntries(String(payload.abiJson || ""));

    if (!chainKey) {
      throw new Error("Chain is required for mint autofill");
    }

    const autofill = await buildMintAutofill({
      chainKey,
      contractAddress,
      abiEntries,
      requestedFunction: payload.mintFunction
    });

    sendJson(response, 200, {
      ok: true,
      autofill
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function verifyExplorerApiKey(apiKey) {
  if (/^https?:\/\//i.test(apiKey) || /etherscan/i.test(apiKey) || /apikey=/i.test(apiKey)) {
    throw new Error("Paste the raw Etherscan V2 API key only, not a link or URL.");
  }

  if (/\s/.test(apiKey)) {
    throw new Error("Explorer API key must be a single token with no spaces.");
  }

  const result = await fetchAbiFromExplorer({
    chainId: explorerKeyTestChainId,
    address: explorerKeyTestAddress,
    apiKey
  });

  return {
    chainId: explorerKeyTestChainId,
    address: explorerKeyTestAddress,
    abiEntries: Array.isArray(result.abi) ? result.abi.length : 0
  };
}

async function handleExplorerKeyTest(request, response) {
  try {
    const payload = await readJsonBody(request);
    const inputKey = String(payload.explorerApiKey || "").trim();
    const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
    const savedKey = String(integrationSecrets.explorerApiKey || "").trim();
    const apiKey = inputKey || resolvedSecrets.explorerApiKey;

    if (!apiKey) {
      throw new Error("Add an Etherscan V2 API key first.");
    }

    const result = await verifyExplorerApiKey(apiKey);

    sendJson(response, 200, {
      ok: true,
      source: inputKey ? "input" : savedKey ? "saved" : "env",
      ...result
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleExplorerKeyDelete(response) {
  try {
    await database.deleteSecret(secretStorageKeys.explorerApiKey);
    delete integrationSecrets.explorerApiKey;
    emitState();
    sendJson(response, 200, { ok: true, settings: buildPublicSettings() });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleSettingsSave(request, response) {
  try {
    const payload = await readJsonBody(request);
    const nextSettings = normalizeDashboardSettings({
      ...appState.settings,
      profileName: payload.profileName,
      theme: payload.theme,
      resultsPath: payload.resultsPath
    });
    const nextSecrets = resolveIntegrationSecrets(integrationSecrets);
    const secretInputs = {
      explorerApiKey: String(payload.explorerApiKey || "").trim()
    };

    Object.entries(secretInputs).forEach(([secretName, value]) => {
      if (!value) {
        return;
      }

      nextSecrets[secretName] = value;
    });

    if (secretInputs.explorerApiKey) {
      await verifyExplorerApiKey(secretInputs.explorerApiKey);
    }

    appState.settings = nextSettings;

    await persistAppState();

    for (const [secretName, value] of Object.entries(secretInputs)) {
      if (!value) {
        continue;
      }

      await database.upsertSecret(secretStorageKeys[secretName], encryptSecret(value));
      integrationSecrets[secretName] = value;
    }

    emitState();
    sendJson(response, 200, { ok: true, settings: buildPublicSettings() });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleRpcDelete(rpcId, response) {
  const rpcNode = appState.rpcNodes.find((node) => node.id === rpcId);
  if (!rpcNode) {
    sendJson(response, 404, { error: "RPC node not found" });
    return;
  }

  if (rpcNode.source === "env") {
    sendJson(response, 400, { error: "Env RPC nodes are managed through environment variables" });
    return;
  }

  appState.rpcNodes = appState.rpcNodes.filter((node) => node.id !== rpcId);
  appState.tasks = appState.tasks.map((task) => ({
    ...task,
    rpcNodeIds: (task.rpcNodeIds || []).filter((id) => id !== rpcId)
  }));
  await persistAppState();
  await reloadAppState();
  emitState();
  sendJson(response, 200, { ok: true });
}

function findPriorityTaskForRun() {
  return appState.tasks
    .map(buildTaskResponse)
    .filter((task) => !task.done && !["queued", "running"].includes(task.status))
    .sort((left, right) => {
      const priorityDelta = priorityRank(right.priority) - priorityRank(left.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0);
    })
    .find((task) => taskReadiness(task).health !== "blocked");
}

function buildSnapshot() {
  const activeTasks = listActiveTaskIds()
    .map((taskId) => getTaskById(taskId))
    .filter(Boolean)
    .map((task) => buildTaskResponse(task));

  return {
    createdAt: new Date().toISOString(),
    activeTask: activeTasks[0] || null,
    activeTasks,
    taskCount: appState.tasks.length,
    walletCount: appState.wallets.length,
    rpcNodeCount: appState.rpcNodes.length,
    runState: getRunState(),
    telemetry: buildTelemetry()
  };
}

function handleTelemetry(response) {
  sendJson(response, 200, { ok: true, telemetry: buildTelemetry() });
}

async function handleRunPriority(response) {
  const task = findPriorityTaskForRun();
  if (!task) {
    sendJson(response, 404, { error: "No runnable priority task found" });
    return;
  }

  await handleTaskRun(task.id, response);
}

function handleSnapshot(response) {
  const snapshot = buildSnapshot();
  pushLog({
    level: "info",
    message: `Snapshot captured at ${snapshot.createdAt}`,
    timestamp: new Date().toISOString()
  });
  emitState();
  sendJson(response, 200, { ok: true, snapshot });
}

function handleAppState(response) {
  sendJson(response, 200, buildPublicState(true));
}

async function getAuthenticatedUser(request) {
  if (request.authenticatedUser !== undefined) {
    return request.authenticatedUser;
  }

  if (!authIsRequired()) {
    request.authenticatedUser = {
      id: "local",
      username: "local"
    };
    return request.authenticatedUser;
  }

  const token = parseCookies(request)[sessionCookieName];
  if (!token) {
    request.authenticatedUser = null;
    return null;
  }

  const session = await database.getSessionByTokenHash(hashToken(token));
  if (!session) {
    request.authenticatedUser = null;
    return null;
  }

  request.authenticatedUser = {
    id: session.user_id,
    username: session.username,
    sessionId: session.id
  };

  void database.touchSession(session.id).catch(reportBackgroundError);
  return request.authenticatedUser;
}

async function requireAuth(request, response) {
  const user = await getAuthenticatedUser(request);
  if (user) {
    return true;
  }

  sendJson(response, 401, {
    error: "Authentication required",
    authenticated: false
  });
  return false;
}

async function handleSession(request, response) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    sendJson(response, 401, { authenticated: false, authRequired: authIsRequired() });
    return;
  }

  sendJson(response, 200, {
    authenticated: true,
    authRequired: authIsRequired(),
    user: {
      id: user.id,
      username: user.username
    }
  });
}

async function handleLogin(request, response) {
  if (!authIsRequired()) {
    sendJson(response, 200, {
      ok: true,
      user: {
        id: "local",
        username: "local"
      }
    });
    return;
  }

  try {
    const payload = await readJsonBody(request);
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");

    if (!username || !password) {
      throw new Error("Username and password are required");
    }

    const user = await database.getUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      sendJson(response, 401, { error: "Invalid username or password" });
      return;
    }

    const token = generateSessionToken();
    await database.createSession({
      id: createId("session"),
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + sessionTtlHours * 60 * 60 * 1000).toISOString()
    });

    appendSetCookie(response, buildSessionCookie(request, token, sessionTtlHours * 60 * 60));
    sendJson(response, 200, {
      ok: true,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleLogout(request, response) {
  const token = parseCookies(request)[sessionCookieName];
  if (token) {
    await database.deleteSessionByTokenHash(hashToken(token));
  }

  clearSessionCookie(response, request);
  sendJson(response, 200, { ok: true });
}

function parseRoute(pathname) {
  return pathname.split("/").filter(Boolean);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const route = parseRoute(url.pathname);
    const isApiRoute = url.pathname.startsWith("/api/");

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      await handleLogin(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      await handleLogout(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      await handleSession(request, response);
      return;
    }

    if (isApiRoute && !(await requireAuth(request, response))) {
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/app-state") {
      handleAppState(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/telemetry") {
      handleTelemetry(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive"
      });
      response.write(`event: state\ndata: ${JSON.stringify(buildPublicState())}\n\n`);
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

    if (request.method === "POST" && route[0] === "api" && route[1] === "tasks" && route[3] === "stop") {
      handleTaskStop(route[2], response);
      return;
    }

    if (request.method === "POST" && route[0] === "api" && route[1] === "tasks" && route[3] === "done") {
      await handleTaskDone(route[2], response);
      return;
    }

    if (
      request.method === "POST" &&
      route[0] === "api" &&
      route[1] === "tasks" &&
      route[3] === "duplicate"
    ) {
      await handleTaskDuplicate(route[2], response);
      return;
    }

    if (request.method === "DELETE" && route[0] === "api" && route[1] === "tasks" && route[2]) {
      await handleTaskDelete(route[2], response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/run/stop") {
      handleStopRun(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/control/run-priority") {
      await handleRunPriority(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/control/test-rpc-pool") {
      await handleRpcPoolTest(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/control/test-explorer-key") {
      await handleExplorerKeyTest(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/control/snapshot") {
      handleSnapshot(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/wallets/import") {
      await handleWalletImport(request, response);
      return;
    }

    if (request.method === "DELETE" && route[0] === "api" && route[1] === "wallets" && route[2]) {
      await handleWalletDelete(route[2], response);
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
      await handleRpcDelete(route[2], response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/settings") {
      await handleSettingsSave(request, response);
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/settings/explorer-key") {
      await handleExplorerKeyDelete(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/contracts/autofill") {
      await handleContractAutofill(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/explorer/abi") {
      await handleExplorerAbiLookup(url, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/") {
      serveFile(response, path.join(webRoot, "index.html"));
      return;
    }

    if (request.method === "GET" && (url.pathname === "/app.js" || url.pathname === "/styles.css")) {
      serveFile(response, path.join(webRoot, url.pathname.slice(1)));
      return;
    }

    response.writeHead(404);
    response.end("Not found");
  } catch (error) {
    console.error("Server request failed:");
    console.error(error);

    if (!response.headersSent) {
      sendJson(response, 500, { error: formatError(error) });
      return;
    }

    response.end();
  }
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

async function startServer() {
  if (server.listening) {
    return server;
  }

  await initializeServer();

  const host = resolveHost();
  const port = resolvePort();

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("error", onError);
      reject(error);
    };

    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      console.log(`Mint dashboard running at http://${host}:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Dashboard startup failed:");
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  resolveHost,
  resolvePort,
  startServer
};
