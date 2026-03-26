const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const mintAutomation = require("./mint-automation");

const defaultInputValues = {
  RPC_URL: "",
  RPC_URLS: "",
  PRIVATE_KEY: "",
  PRIVATE_KEYS: "",
  CHAIN_KEY: "",
  CONTRACT_ADDRESS: "",
  ABI_PATH: "./abi/contract.json",
  ABI_JSON: "",
  AUTO_MINT_MODE: true,
  MINT_FUNCTION: "",
  MINT_ARGS: "",
  QUANTITY_PER_WALLET: "1",
  MINT_VALUE_ETH: "",
  CLAIM_INTEGRATION_ENABLED: false,
  CLAIM_PROJECT_KEY: "",
  WALLET_CLAIMS_JSON: "",
  CLAIM_FETCH_ENABLED: false,
  CLAIM_FETCH_URL: "",
  CLAIM_FETCH_METHOD: "GET",
  CLAIM_FETCH_HEADERS_JSON: "",
  CLAIM_FETCH_COOKIES_JSON: "",
  CLAIM_FETCH_BODY_JSON: "",
  CLAIM_RESPONSE_MAPPING_JSON: "",
  CLAIM_RESPONSE_ROOT: "",
  RETRY_WINDOW_MS: "",
  GAS_LIMIT: "",
  MAX_FEE_GWEI: "",
  MAX_PRIORITY_FEE_GWEI: "",
  GAS_STRATEGY: "aggressive",
  GAS_BOOST_PERCENT: "0",
  PRIORITY_BOOST_PERCENT: "0",
  WAIT_UNTIL_ISO: "",
  MULTI_RPC_BROADCAST: false,
  POLL_INTERVAL_MS: "1000",
  WAIT_FOR_RECEIPT: true,
  SIMULATE_TRANSACTION: true,
  DRY_RUN: false,
  MAX_RETRIES: "3",
  RETRY_DELAY_MS: "500",
  WALLET_MODE: "parallel",
  CHAIN_ID: "",
  RECEIPT_CONFIRMATIONS: "1",
  TX_TIMEOUT_MS: "25000",
  START_JITTER_MS: "0",
  NONCE_OFFSET: "0",
  MINT_START_DETECTION_ENABLED: true,
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
  SMART_GAS_REPLACEMENT: true,
  REPLACEMENT_BUMP_PERCENT: "15",
  REPLACEMENT_MAX_ATTEMPTS: "3",
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
  TRIGGER_BLOCK_NUMBER: "",
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

function isPlaceholderText(value) {
  return /(your_|your-|changeme|replace-with|replace_me|example\.com|rpc\.example)/i.test(
    String(value || "")
  );
}

function validateRpcUrl(rpcUrl) {
  let parsed;
  try {
    parsed = new URL(String(rpcUrl));
  } catch {
    throw new Error(`RPC URL is invalid: ${rpcUrl}`);
  }

  if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
    throw new Error(`RPC URL must start with http://, https://, ws://, or wss://: ${rpcUrl}`);
  }

  if (isPlaceholderText(rpcUrl)) {
    throw new Error(`RPC URL appears to be a placeholder/example value: ${rpcUrl}`);
  }
}

function validatePrivateKey(privateKey) {
  const value = String(privateKey || "").trim();
  if (isPlaceholderText(value) || /yourprivatekey/i.test(value)) {
    throw new Error("PRIVATE_KEY appears to be a placeholder/example value");
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("PRIVATE_KEY must be a 32-byte hex string starting with 0x");
  }
}

function validateContractAddress(address) {
  const value = String(address || "").trim();
  if (isPlaceholderText(value) || /yourcontractaddress/i.test(value)) {
    throw new Error("CONTRACT_ADDRESS appears to be a placeholder/example value");
  }

  if (!ethers.isAddress(value)) {
    throw new Error("CONTRACT_ADDRESS must be a valid EVM address");
  }
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

function parseJsonOrStringValue(value, name) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function parseJsonContainerValue(value, name) {
  const parsed = parseJsonValue(value, name);
  if (parsed === undefined) {
    return undefined;
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${name} must be a JSON object or array`);
  }

  return parsed;
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

function normalizeAbiName(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
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

  rpcUrls.forEach((rpcUrl) => validateRpcUrl(rpcUrl));

  return rpcUrls;
}

function loadPrivateKeys(raw) {
  const source = optionalString(raw, "PRIVATE_KEYS") || required(raw, "PRIVATE_KEY");
  const privateKeys = parseList(source);

  if (privateKeys.length === 0) {
    throw new Error("At least one private key is required");
  }

  privateKeys.forEach((privateKey) => validatePrivateKey(privateKey));

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
  const supportedModes = new Set(["standard", "event", "mempool", "block"]);

  if (!supportedModes.has(mode)) {
    throw new Error("EXECUTION_TRIGGER_MODE must be standard, event, mempool, or block");
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
  const autoMintMode = optionalBoolean(raw, "AUTO_MINT_MODE", true);
  const requestedMintFunction = optionalString(raw, "MINT_FUNCTION") || "";
  const resolvedMintFunction = mintAutomation.resolveMintFunctionFromAbi(abi, requestedMintFunction);
  const mintAnalysis = mintAutomation.buildMintFunctionAnalysis(abi, requestedMintFunction);
  const autoMintStartDetection = mintAutomation.detectMintStartFunctionsFromAbi(abi);
  const configuredMintStartDetection = parseJsonObjectValue(
    raw.MINT_START_DETECTION_JSON,
    "MINT_START_DETECTION_JSON"
  );
  const mintStartDetectionEnabled = optionalBoolean(
    raw,
    "MINT_START_DETECTION_ENABLED",
    autoMintMode
  );
  const quantityPerWallet = Math.max(1, optionalInteger(raw, "QUANTITY_PER_WALLET") || 1);
  const claimIntegrationEnabled = optionalBoolean(raw, "CLAIM_INTEGRATION_ENABLED", false);
  const gasStrategy = (() => {
    const strategy = normalizeGasStrategyValue(
      optionalString(raw, "GAS_STRATEGY") || (autoMintMode ? "aggressive" : "normal")
    );
    const supportedStrategies = new Set(["aggressive", "normal", "custom"]);

    if (!supportedStrategies.has(strategy)) {
      throw new Error("GAS_STRATEGY must be aggressive, normal, or custom");
    }

    return strategy;
  })();
  const normalized = {
    rpcUrls: loadRpcUrls(raw),
    privateKeys: loadPrivateKeys(raw),
    contractAddress: required(raw, "CONTRACT_ADDRESS"),
    abiPath,
    abi,
    chainKey: optionalString(raw, "CHAIN_KEY"),
    autoMintMode,
    quantityPerWallet,
    mintFunctionProvided: !isBlank(raw.MINT_FUNCTION),
    mintArgsProvided: !isBlank(raw.MINT_ARGS),
    mintValueProvided: !isBlank(raw.MINT_VALUE_ETH),
    detectedMintFunctions: mintAnalysis.detectedFunctions,
    payableMintFunctions: mintAnalysis.payableFunctions,
    mintFunction: resolvedMintFunction.mintFunction,
    mintArgsTemplate: parseJsonArrayValue(raw.MINT_ARGS, "MINT_ARGS", []),
    mintValueEth: optionalString(raw, "MINT_VALUE_ETH") || "0",
    claimIntegrationEnabled,
    claimProjectKey: optionalString(raw, "CLAIM_PROJECT_KEY"),
    walletClaims: claimIntegrationEnabled
      ? parseJsonContainerValue(raw.WALLET_CLAIMS_JSON, "WALLET_CLAIMS_JSON")
      : undefined,
    claimFetchEnabled: claimIntegrationEnabled ? optionalBoolean(raw, "CLAIM_FETCH_ENABLED", false) : false,
    claimFetchUrl: optionalString(raw, "CLAIM_FETCH_URL"),
    claimFetchMethod: (optionalString(raw, "CLAIM_FETCH_METHOD") || "GET").toUpperCase(),
    claimFetchHeaders: claimIntegrationEnabled
      ? parseJsonObjectValue(raw.CLAIM_FETCH_HEADERS_JSON, "CLAIM_FETCH_HEADERS_JSON")
      : {},
    claimFetchCookies: claimIntegrationEnabled
      ? parseJsonOrStringValue(raw.CLAIM_FETCH_COOKIES_JSON, "CLAIM_FETCH_COOKIES_JSON")
      : undefined,
    claimFetchBodyTemplate: claimIntegrationEnabled
      ? parseJsonOrStringValue(raw.CLAIM_FETCH_BODY_JSON, "CLAIM_FETCH_BODY_JSON")
      : undefined,
    claimResponseMapping: claimIntegrationEnabled
      ? parseJsonObjectValue(raw.CLAIM_RESPONSE_MAPPING_JSON, "CLAIM_RESPONSE_MAPPING_JSON")
      : {},
    claimResponseRoot: optionalString(raw, "CLAIM_RESPONSE_ROOT"),
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
    maxRetries: optionalInteger(raw, "MAX_RETRIES") || (autoMintMode ? 3 : 1),
    retryDelayMs: optionalInteger(raw, "RETRY_DELAY_MS") || (autoMintMode ? 500 : 1000),
    retryWindowMs,
    walletMode: loadWalletMode(raw),
    requiredChainId: optionalInteger(raw, "CHAIN_ID"),
    receiptConfirmations: optionalInteger(raw, "RECEIPT_CONFIRMATIONS") || 1,
    txTimeoutMs: optionalInteger(raw, "TX_TIMEOUT_MS") || (autoMintMode ? 25000 : undefined),
    startJitterMs: optionalInteger(raw, "START_JITTER_MS") || 0,
    nonceOffset: optionalInteger(raw, "NONCE_OFFSET") || 0,
    mintStartDetectionEnabled,
    mintStartDetectionConfig:
      Object.keys(configuredMintStartDetection).length > 0
        ? configuredMintStartDetection
        : autoMintStartDetection,
    gasStrategy,
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
    smartGasReplacement: optionalBoolean(raw, "SMART_GAS_REPLACEMENT", autoMintMode),
    replacementBumpPercent: optionalNumber(raw, "REPLACEMENT_BUMP_PERCENT") || (autoMintMode ? 15 : 12),
    replacementMaxAttempts:
      optionalInteger(raw, "REPLACEMENT_MAX_ATTEMPTS") || (autoMintMode ? 3 : 2),
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
    triggerBlockNumber: optionalInteger(raw, "TRIGGER_BLOCK_NUMBER"),
    triggerTimeoutMs: optionalInteger(raw, "TRIGGER_TIMEOUT_MS")
  };

  validateContractAddress(normalized.contractAddress);

  if (
    normalized.autoMintMode &&
    (!normalized.mintFunction ||
      !abiFunctionNameMap(normalized.abi).has(normalized.mintFunction.toLowerCase())) &&
    normalized.detectedMintFunctions.length === 0
  ) {
    throw new Error(
      `No automated mint candidate was found in the ABI. ${mintAutomation.describeMintFunctionDetection(
        normalized.abi,
        mintAnalysis.detectedFunctions
      )}.`
    );
  }

  if (
    !normalized.autoMintMode &&
    (!normalized.mintFunction || !abiFunctionNameMap(normalized.abi).has(normalized.mintFunction.toLowerCase()))
  ) {
    throw new Error(
      `MINT_FUNCTION "${normalized.mintFunction || "(empty)"}" was not found in the ABI. ${mintAutomation.describeMintFunctionDetection(
        normalized.abi,
        resolvedMintFunction.detectedFunctions
      )}.`
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

  if (normalized.claimIntegrationEnabled && normalized.claimFetchEnabled && !normalized.claimFetchUrl) {
    throw new Error("CLAIM_FETCH_URL is required when CLAIM_FETCH_ENABLED=true");
  }

  if (
    normalized.claimIntegrationEnabled &&
    normalized.claimFetchHeaders &&
    Object.values(normalized.claimFetchHeaders).some(
      (value) => value !== undefined && value !== null && typeof value !== "string"
    )
  ) {
    throw new Error("CLAIM_FETCH_HEADERS_JSON values must all be strings");
  }

  if (
    normalized.claimIntegrationEnabled &&
    !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(normalized.claimFetchMethod)
  ) {
    throw new Error("CLAIM_FETCH_METHOD must be GET, POST, PUT, PATCH, DELETE, or HEAD");
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

  if (normalized.executionTriggerMode === "block") {
    if (!normalized.triggerBlockNumber || normalized.triggerBlockNumber < 1) {
      throw new Error("TRIGGER_BLOCK_NUMBER must be a positive integer when EXECUTION_TRIGGER_MODE=block");
    }
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

  if (!normalized.claimIntegrationEnabled) {
    normalized.claimFetchEnabled = false;
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
