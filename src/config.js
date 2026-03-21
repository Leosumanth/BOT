const fs = require("fs");
const path = require("path");

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalNumber(name) {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }

  return parsed;
}

function optionalInteger(name) {
  const value = optionalNumber(name);
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }

  return value;
}

function optionalBoolean(name, fallback = false) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

function optionalString(name) {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  return value.trim();
}

function parseCsv(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function loadAbi(abiPath) {
  const resolvedPath = path.resolve(process.cwd(), abiPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`ABI file not found: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && Array.isArray(parsed.abi)) {
    return parsed.abi;
  }

  throw new Error("ABI file must contain a JSON array or an object with an abi array");
}

function parseJsonArray(name, fallback = "[]") {
  const raw = process.env[name] || fallback;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${name} must be a JSON array`);
    }
    return parsed;
  } catch (error) {
    throw new Error(`Unable to parse ${name}: ${error.message}`);
  }
}

function loadRpcUrls() {
  const raw = optionalString("RPC_URLS") || required("RPC_URL");
  const rpcUrls = parseCsv(raw);

  if (rpcUrls.length === 0) {
    throw new Error("At least one RPC URL is required");
  }

  return rpcUrls;
}

function loadPrivateKeys() {
  const raw = optionalString("PRIVATE_KEYS") || required("PRIVATE_KEY");
  const privateKeys = parseCsv(raw);

  if (privateKeys.length === 0) {
    throw new Error("At least one private key is required");
  }

  return privateKeys;
}

function loadWalletMode() {
  const mode = (process.env.WALLET_MODE || "sequential").toLowerCase();
  const supportedModes = new Set(["sequential", "parallel"]);

  if (!supportedModes.has(mode)) {
    throw new Error("WALLET_MODE must be either sequential or parallel");
  }

  return mode;
}

function loadConfig() {
  const abiPath = process.env.ABI_PATH || "./abi/contract.json";

  return {
    rpcUrls: loadRpcUrls(),
    privateKeys: loadPrivateKeys(),
    contractAddress: required("CONTRACT_ADDRESS"),
    abiPath,
    abi: loadAbi(abiPath),
    mintFunction: process.env.MINT_FUNCTION || "mint",
    mintArgsTemplate: parseJsonArray("MINT_ARGS"),
    mintValueEth: process.env.MINT_VALUE_ETH || "0",
    gasLimit: optionalNumber("GAS_LIMIT"),
    maxFeeGwei: optionalNumber("MAX_FEE_GWEI"),
    maxPriorityFeeGwei: optionalNumber("MAX_PRIORITY_FEE_GWEI"),
    waitUntilIso: process.env.WAIT_UNTIL_ISO,
    pollIntervalMs: optionalNumber("POLL_INTERVAL_MS") || 1000,
    waitForReceipt: optionalBoolean("WAIT_FOR_RECEIPT", true),
    simulateTransaction: optionalBoolean("SIMULATE_TRANSACTION", true),
    dryRun: optionalBoolean("DRY_RUN", false),
    maxRetries: optionalInteger("MAX_RETRIES") || 1,
    retryDelayMs: optionalInteger("RETRY_DELAY_MS") || 1000,
    walletMode: loadWalletMode(),
    requiredChainId: optionalInteger("CHAIN_ID"),
    receiptConfirmations: optionalInteger("RECEIPT_CONFIRMATIONS") || 1,
    txTimeoutMs: optionalInteger("TX_TIMEOUT_MS"),
    startJitterMs: optionalInteger("START_JITTER_MS") || 0,
    nonceOffset: optionalInteger("NONCE_OFFSET") || 0
  };
}

module.exports = {
  loadConfig
};
