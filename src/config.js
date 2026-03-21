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
  GAS_LIMIT: "",
  MAX_FEE_GWEI: "",
  MAX_PRIORITY_FEE_GWEI: "",
  GAS_STRATEGY: "provider",
  GAS_BOOST_PERCENT: "0",
  PRIORITY_BOOST_PERCENT: "0",
  WAIT_UNTIL_ISO: "",
  POLL_INTERVAL_MS: "1000",
  WAIT_FOR_RECEIPT: true,
  SIMULATE_TRANSACTION: true,
  DRY_RUN: false,
  MAX_RETRIES: "1",
  RETRY_DELAY_MS: "1000",
  WALLET_MODE: "sequential",
  CHAIN_ID: "",
  RECEIPT_CONFIRMATIONS: "1",
  TX_TIMEOUT_MS: "",
  START_JITTER_MS: "0",
  NONCE_OFFSET: "0",
  READY_CHECK_FUNCTION: "",
  READY_CHECK_ARGS: "[]",
  READY_CHECK_EXPECTED: "",
  READY_CHECK_MODE: "truthy",
  READY_CHECK_INTERVAL_MS: "1000",
  WARMUP_RPC: true,
  CONTINUE_ON_ERROR: false,
  RESULTS_PATH: "./dist/mint-results.json",
  MIN_BALANCE_ETH: ""
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
  const mode = (optionalString(raw, "WALLET_MODE") || "sequential").toLowerCase();
  const supportedModes = new Set(["sequential", "parallel"]);

  if (!supportedModes.has(mode)) {
    throw new Error("WALLET_MODE must be either sequential or parallel");
  }

  return mode;
}

function loadGasStrategy(raw) {
  const strategy = (optionalString(raw, "GAS_STRATEGY") || "provider").toLowerCase();
  const supportedStrategies = new Set(["manual", "provider"]);

  if (!supportedStrategies.has(strategy)) {
    throw new Error("GAS_STRATEGY must be either manual or provider");
  }

  return strategy;
}

function loadReadyCheckMode(raw) {
  const mode = (optionalString(raw, "READY_CHECK_MODE") || "truthy").toLowerCase();
  const supportedModes = new Set(["truthy", "falsey", "equals"]);

  if (!supportedModes.has(mode)) {
    throw new Error("READY_CHECK_MODE must be truthy, falsey, or equals");
  }

  return mode;
}

function normalizeConfig(raw) {
  const abiPath = optionalString(raw, "ABI_PATH") || "./abi/contract.json";
  const pollIntervalMs = optionalInteger(raw, "POLL_INTERVAL_MS") || 1000;

  return {
    rpcUrls: loadRpcUrls(raw),
    privateKeys: loadPrivateKeys(raw),
    contractAddress: required(raw, "CONTRACT_ADDRESS"),
    abiPath,
    abi: loadAbi(raw, abiPath),
    mintFunction: optionalString(raw, "MINT_FUNCTION") || "mint",
    mintArgsTemplate: parseJsonArrayValue(raw.MINT_ARGS, "MINT_ARGS", []),
    mintValueEth: optionalString(raw, "MINT_VALUE_ETH") || "0",
    gasLimit: optionalNumber(raw, "GAS_LIMIT"),
    maxFeeGwei: optionalNumber(raw, "MAX_FEE_GWEI"),
    maxPriorityFeeGwei: optionalNumber(raw, "MAX_PRIORITY_FEE_GWEI"),
    waitUntilIso: optionalString(raw, "WAIT_UNTIL_ISO"),
    pollIntervalMs,
    waitForReceipt: optionalBoolean(raw, "WAIT_FOR_RECEIPT", true),
    simulateTransaction: optionalBoolean(raw, "SIMULATE_TRANSACTION", true),
    dryRun: optionalBoolean(raw, "DRY_RUN", false),
    maxRetries: optionalInteger(raw, "MAX_RETRIES") || 1,
    retryDelayMs: optionalInteger(raw, "RETRY_DELAY_MS") || 1000,
    walletMode: loadWalletMode(raw),
    requiredChainId: optionalInteger(raw, "CHAIN_ID"),
    receiptConfirmations: optionalInteger(raw, "RECEIPT_CONFIRMATIONS") || 1,
    txTimeoutMs: optionalInteger(raw, "TX_TIMEOUT_MS"),
    startJitterMs: optionalInteger(raw, "START_JITTER_MS") || 0,
    nonceOffset: optionalInteger(raw, "NONCE_OFFSET") || 0,
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
    minBalanceEth: optionalString(raw, "MIN_BALANCE_ETH")
  };
}

function loadConfig() {
  return normalizeConfig(process.env);
}

module.exports = {
  defaultInputValues,
  loadConfig,
  normalizeConfig
};
