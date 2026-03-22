const fs = require("fs");
const path = require("path");

const defaultInputValues = {
  RPC_URL: "",
  RPC_URLS: "",
  PRIVATE_KEY: "",
  PRIVATE_KEYS: "",
  CONTRACT_ADDRESS: "",
  ABI_PATH: "./abi/contract.json",
  ABI_JSON: "",
  MINT_FUNCTION: "mint",
  MINT_ARGS: "[]",
  MINT_VALUE_ETH: "0",
  RETRY_WINDOW_MS: "",
  GAS_LIMIT: "",
  MAX_FEE_GWEI: "",
  MAX_PRIORITY_FEE_GWEI: "",
  GAS_STRATEGY: "normal",
  GAS_BOOST_PERCENT: "0",
  PRIORITY_BOOST_PERCENT: "0",
  WAIT_UNTIL_ISO: "",
  MULTI_RPC_BROADCAST: false,
  POLL_INTERVAL_MS: "1000",
  WAIT_FOR_RECEIPT: true,
  SIMULATE_TRANSACTION: true,
  DRY_RUN: false,
  MAX_RETRIES: "1",
  RETRY_DELAY_MS: "1000",
  WALLET_MODE: "parallel",
  CHAIN_ID: "",
  RECEIPT_CONFIRMATIONS: "1",
  TX_TIMEOUT_MS: "",
  START_JITTER_MS: "0",
  NONCE_OFFSET: "0",
  MINT_START_DETECTION_ENABLED: false,
  MINT_START_DETECTION_JSON: "",
  READY_CHECK_FUNCTION: "",
  READY_CHECK_ARGS: "[]",
  READY_CHECK_EXPECTED: "",
  READY_CHECK_MODE: "truthy",
  READY_CHECK_INTERVAL_MS: "1000",
  WARMUP_RPC: true,
  CONTINUE_ON_ERROR: false,
  RESULTS_PATH: "./dist/mint-results.json",
  MIN_BALANCE_ETH: "",
  TRANSFER_AFTER_MINTED: false,
  TRANSFER_ADDRESS: "",
  SMART_GAS_REPLACEMENT: false,
  REPLACEMENT_BUMP_PERCENT: "12",
  REPLACEMENT_MAX_ATTEMPTS: "2",
  PRIVATE_RELAY_ENABLED: false,
  PRIVATE_RELAY_URL: "",
  PRIVATE_RELAY_METHOD: "eth_sendRawTransaction",
  PRIVATE_RELAY_HEADERS_JSON: "",
  PRIVATE_RELAY_ONLY: false,
  EXECUTION_TRIGGER_MODE: "standard",
  TRIGGER_CONTRACT_ADDRESS: "",
  TRIGGER_EVENT_SIGNATURE: "",
  TRIGGER_EVENT_CONDITION: "",
  TRIGGER_MEMPOOL_SIGNATURE: "",
  TRIGGER_TIMEOUT_MS: ""
};

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function required(raw, name) {
  const value = raw[name];
  if (isBlank(value)) {
    throw new Error(`Missing required configuration value: ${name}`);
  }

  return String(value).trim();
}

function optionalString(raw, name) {
  const value = raw[name];
  if (isBlank(value)) {
    return undefined;
  }

  return String(value).trim();
}

function optionalNumber(raw, name) {
  const value = raw[name];
  if (isBlank(value)) {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be a number`);
  }

  return parsed;
}

function optionalInteger(raw, name) {
  const value = optionalNumber(raw, name);
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }

  return value;
}

function optionalBoolean(raw, name, fallback = false) {
  const value = raw[name];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`${name} must be true or false`);
}

function parseList(value) {
  return String(value)
    .split(/[\r\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseJsonArrayValue(value, name, fallback = []) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) {
      throw new Error(`${name} must be a JSON array`);
    }

    return parsed;
  } catch (error) {
    throw new Error(`Unable to parse ${name}: ${error.message}`);
  }
}

function parseJsonValue(value, name) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`Unable to parse ${name}: ${error.message}`);
  }
}

function normalizeAbiJson(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && Array.isArray(parsed.abi)) {
    return parsed.abi;
  }

  throw new Error("ABI must be a JSON array or an object with an abi array");
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

function detectMintFunctionsFromAbi(abiEntries) {
  const namesByLower = abiFunctionNameMap(abiEntries);

  return ["mint", "publicMint", "safeMint"]
    .map((name) => namesByLower.get(name.toLowerCase()) || null)
    .filter((name, index, values) => Boolean(name) && values.indexOf(name) === index);
}

function resolveMintFunctionFromAbi(abiEntries, requestedFunction = "") {
  const namesByLower = abiFunctionNameMap(abiEntries);
  const detectedFunctions = detectMintFunctionsFromAbi(abiEntries);
  const requested = String(requestedFunction || "").trim();
  const matchedRequestedFunction = requested ? namesByLower.get(requested.toLowerCase()) || "" : "";

  return {
    detectedFunctions,
    mintFunction: matchedRequestedFunction || detectedFunctions[0] || requested
  };
}

function loadAbiFromPath(abiPath) {
  const resolvedPath = path.resolve(process.cwd(), abiPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`ABI file not found: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, "utf8");
  return normalizeAbiJson(JSON.parse(raw));
}

function loadAbi(raw, abiPath) {
  if (raw.ABI !== undefined && raw.ABI !== null && raw.ABI !== "") {
    return normalizeAbiJson(raw.ABI);
  }

  if (!isBlank(raw.ABI_JSON)) {
    try {
      return normalizeAbiJson(JSON.parse(String(raw.ABI_JSON)));
    } catch (error) {
      throw new Error(`Unable to parse ABI_JSON: ${error.message}`);
    }
  }

  return loadAbiFromPath(abiPath);
}

function loadRpcUrls(raw) {
  const source = optionalString(raw, "RPC_URLS") || required(raw, "RPC_URL");
  const rpcUrls = parseList(source);

  if (rpcUrls.length === 0) {
    throw new Error("At least one RPC URL is required");
  }

  return rpcUrls;
}

function loadPrivateKeys(raw) {
  const source = optionalString(raw, "PRIVATE_KEYS") || required(raw, "PRIVATE_KEY");
  const privateKeys = parseList(source);

  if (privateKeys.length === 0) {
    throw new Error("At least one private key is required");
  }

  return privateKeys;
}

function loadWalletMode(raw) {
  const mode = (optionalString(raw, "WALLET_MODE") || "parallel").toLowerCase();
  const supportedModes = new Set(["sequential", "parallel"]);

  if (!supportedModes.has(mode)) {
    throw new Error("WALLET_MODE must be either sequential or parallel");
  }

  return mode;
}

function loadGasStrategy(raw) {
  const strategy = normalizeGasStrategyValue(optionalString(raw, "GAS_STRATEGY") || "normal");
  const supportedStrategies = new Set(["aggressive", "normal", "custom"]);

  if (!supportedStrategies.has(strategy)) {
    throw new Error("GAS_STRATEGY must be aggressive, normal, or custom");
  }

  return strategy;
}

function normalizeGasStrategyValue(value) {
  const normalized = String(value || "normal").trim().toLowerCase();

  if (normalized === "provider") {
    return "normal";
  }

  if (normalized === "manual") {
    return "custom";
  }

  return normalized || "normal";
}

function loadReadyCheckMode(raw) {
  const mode = (optionalString(raw, "READY_CHECK_MODE") || "truthy").toLowerCase();
  const supportedModes = new Set(["truthy", "falsey", "equals"]);

  if (!supportedModes.has(mode)) {
    throw new Error("READY_CHECK_MODE must be truthy, falsey, or equals");
  }

  return mode;
}

function loadExecutionTriggerMode(raw) {
  const mode = (optionalString(raw, "EXECUTION_TRIGGER_MODE") || "standard").toLowerCase();
  const supportedModes = new Set(["standard", "event", "mempool"]);

  if (!supportedModes.has(mode)) {
    throw new Error("EXECUTION_TRIGGER_MODE must be standard, event, or mempool");
  }

  return mode;
}

function loadPrivateRelayMethod(raw) {
  const method = optionalString(raw, "PRIVATE_RELAY_METHOD") || "eth_sendRawTransaction";
  const supportedMethods = new Set(["eth_sendRawTransaction", "eth_sendPrivateTransaction"]);

  if (!supportedMethods.has(method)) {
    throw new Error(
      "PRIVATE_RELAY_METHOD must be eth_sendRawTransaction or eth_sendPrivateTransaction"
    );
  }

  return method;
}

function parseJsonObjectValue(value, name) {
  if (value === undefined || value === null || value === "") {
    return {};
  }

  const parsed = parseJsonValue(value, name);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object`);
  }

  return parsed;
}

function hasSocketRpcUrl(rpcUrls) {
  return rpcUrls.some((rpcUrl) => /^wss?:\/\//i.test(String(rpcUrl || "")));
}

function normalizeConfig(raw) {
  const abiPath = optionalString(raw, "ABI_PATH") || "./abi/contract.json";
  const pollIntervalMs = optionalInteger(raw, "POLL_INTERVAL_MS") || 1000;
  const retryWindowMs = Math.max(0, optionalInteger(raw, "RETRY_WINDOW_MS") || 0);
  const abi = loadAbi(raw, abiPath);
  const resolvedMintFunction = resolveMintFunctionFromAbi(
    abi,
    optionalString(raw, "MINT_FUNCTION") || "mint"
  );
  const normalized = {
    rpcUrls: loadRpcUrls(raw),
    privateKeys: loadPrivateKeys(raw),
    contractAddress: required(raw, "CONTRACT_ADDRESS"),
    abiPath,
    abi,
    mintFunction: resolvedMintFunction.mintFunction,
    mintArgsTemplate: parseJsonArrayValue(raw.MINT_ARGS, "MINT_ARGS", []),
    mintValueEth: optionalString(raw, "MINT_VALUE_ETH") || "0",
    gasLimit: optionalNumber(raw, "GAS_LIMIT"),
    maxFeeGwei: optionalNumber(raw, "MAX_FEE_GWEI"),
    maxPriorityFeeGwei: optionalNumber(raw, "MAX_PRIORITY_FEE_GWEI"),
    waitUntilIso: optionalString(raw, "WAIT_UNTIL_ISO"),
    preSignTransactions: true,
    multiRpcBroadcast: optionalBoolean(raw, "MULTI_RPC_BROADCAST", false),
    pollIntervalMs,
    waitForReceipt: optionalBoolean(raw, "WAIT_FOR_RECEIPT", true),
    simulateTransaction: optionalBoolean(raw, "SIMULATE_TRANSACTION", true),
    dryRun: optionalBoolean(raw, "DRY_RUN", false),
    maxRetries: optionalInteger(raw, "MAX_RETRIES") || 1,
    retryDelayMs: optionalInteger(raw, "RETRY_DELAY_MS") || 1000,
    retryWindowMs,
    walletMode: loadWalletMode(raw),
    requiredChainId: optionalInteger(raw, "CHAIN_ID"),
    receiptConfirmations: optionalInteger(raw, "RECEIPT_CONFIRMATIONS") || 1,
    txTimeoutMs: optionalInteger(raw, "TX_TIMEOUT_MS"),
    startJitterMs: optionalInteger(raw, "START_JITTER_MS") || 0,
    nonceOffset: optionalInteger(raw, "NONCE_OFFSET") || 0,
    mintStartDetectionEnabled: optionalBoolean(raw, "MINT_START_DETECTION_ENABLED", false),
    mintStartDetectionConfig: parseJsonObjectValue(
      raw.MINT_START_DETECTION_JSON,
      "MINT_START_DETECTION_JSON"
    ),
    gasStrategy: loadGasStrategy(raw),
    gasBoostPercent: optionalNumber(raw, "GAS_BOOST_PERCENT") || 0,
    priorityBoostPercent: optionalNumber(raw, "PRIORITY_BOOST_PERCENT") || 0,
    readyCheckFunction: optionalString(raw, "READY_CHECK_FUNCTION"),
    readyCheckArgs: parseJsonArrayValue(raw.READY_CHECK_ARGS, "READY_CHECK_ARGS", []),
    readyCheckExpected: parseJsonValue(raw.READY_CHECK_EXPECTED, "READY_CHECK_EXPECTED"),
    readyCheckMode: loadReadyCheckMode(raw),
    readyCheckIntervalMs: optionalInteger(raw, "READY_CHECK_INTERVAL_MS") || pollIntervalMs,
    warmupRpc: optionalBoolean(raw, "WARMUP_RPC", true),
    continueOnError: optionalBoolean(raw, "CONTINUE_ON_ERROR", false),
    resultsPath: optionalString(raw, "RESULTS_PATH"),
    minBalanceEth: optionalString(raw, "MIN_BALANCE_ETH"),
    transferAfterMinted: optionalBoolean(raw, "TRANSFER_AFTER_MINTED", false),
    transferAddress: optionalString(raw, "TRANSFER_ADDRESS"),
    smartGasReplacement: optionalBoolean(raw, "SMART_GAS_REPLACEMENT", false),
    replacementBumpPercent: optionalNumber(raw, "REPLACEMENT_BUMP_PERCENT") || 12,
    replacementMaxAttempts: optionalInteger(raw, "REPLACEMENT_MAX_ATTEMPTS") || 2,
    privateRelayEnabled: optionalBoolean(raw, "PRIVATE_RELAY_ENABLED", false),
    privateRelayUrl: optionalString(raw, "PRIVATE_RELAY_URL"),
    privateRelayMethod: loadPrivateRelayMethod(raw),
    privateRelayHeaders: parseJsonObjectValue(raw.PRIVATE_RELAY_HEADERS_JSON, "PRIVATE_RELAY_HEADERS_JSON"),
    privateRelayOnly: optionalBoolean(raw, "PRIVATE_RELAY_ONLY", false),
    executionTriggerMode: loadExecutionTriggerMode(raw),
    triggerContractAddress:
      optionalString(raw, "TRIGGER_CONTRACT_ADDRESS") || required(raw, "CONTRACT_ADDRESS"),
    triggerEventSignature: optionalString(raw, "TRIGGER_EVENT_SIGNATURE"),
    triggerEventCondition: parseJsonValue(raw.TRIGGER_EVENT_CONDITION, "TRIGGER_EVENT_CONDITION"),
    triggerMempoolSignature: optionalString(raw, "TRIGGER_MEMPOOL_SIGNATURE"),
    triggerTimeoutMs: optionalInteger(raw, "TRIGGER_TIMEOUT_MS")
  };

  if (!normalized.mintFunction || !abiFunctionNameMap(normalized.abi).has(normalized.mintFunction.toLowerCase())) {
    const detectedLabel = resolvedMintFunction.detectedFunctions.length
      ? resolvedMintFunction.detectedFunctions.join(", ")
      : "none of mint/publicMint/safeMint";
    throw new Error(
      `MINT_FUNCTION "${normalized.mintFunction || "(empty)"}" was not found in the ABI. Detected ${detectedLabel}.`
    );
  }

  if (normalized.transferAfterMinted && !normalized.transferAddress) {
    throw new Error("TRANSFER_ADDRESS is required when TRANSFER_AFTER_MINTED=true");
  }

  if (normalized.transferAfterMinted && !normalized.waitForReceipt) {
    throw new Error("WAIT_FOR_RECEIPT must be true when TRANSFER_AFTER_MINTED=true");
  }

  if (normalized.smartGasReplacement && !normalized.waitForReceipt) {
    throw new Error("WAIT_FOR_RECEIPT must be true when SMART_GAS_REPLACEMENT=true");
  }

  if (normalized.smartGasReplacement && !normalized.txTimeoutMs) {
    throw new Error("TX_TIMEOUT_MS is required when SMART_GAS_REPLACEMENT=true");
  }

  if (normalized.smartGasReplacement && normalized.replacementMaxAttempts < 1) {
    throw new Error("REPLACEMENT_MAX_ATTEMPTS must be at least 1");
  }

  if (normalized.smartGasReplacement && normalized.replacementBumpPercent <= 0) {
    throw new Error("REPLACEMENT_BUMP_PERCENT must be greater than 0");
  }

  if (normalized.privateRelayEnabled && !normalized.privateRelayUrl) {
    throw new Error("PRIVATE_RELAY_URL is required when PRIVATE_RELAY_ENABLED=true");
  }

  if (
    normalized.privateRelayHeaders &&
    Object.values(normalized.privateRelayHeaders).some((value) => typeof value !== "string")
  ) {
    throw new Error("PRIVATE_RELAY_HEADERS_JSON values must all be strings");
  }

  if (normalized.executionTriggerMode === "event" && !normalized.triggerEventSignature) {
    throw new Error("TRIGGER_EVENT_SIGNATURE is required when EXECUTION_TRIGGER_MODE=event");
  }

  if (normalized.executionTriggerMode === "mempool" && !hasSocketRpcUrl(normalized.rpcUrls)) {
    throw new Error(
      "At least one ws:// or wss:// RPC URL is required when EXECUTION_TRIGGER_MODE=mempool"
    );
  }

  if (
    normalized.mintStartDetectionEnabled &&
    !(
      normalized.mintStartDetectionConfig?.saleActiveFunction ||
      normalized.mintStartDetectionConfig?.stateFunction
    )
  ) {
    normalized.mintStartDetectionEnabled = false;
  }

  return normalized;
}

function loadConfig() {
  return normalizeConfig(process.env);
}

module.exports = {
  defaultInputValues,
  loadConfig,
  normalizeConfig,
  normalizeGasStrategyValue
};
