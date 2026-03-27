const { ethers } = require("ethers");

const EXPLORER_BASE_URL = "https://api.etherscan.io/v2/api";
const ALCHEMY_KEY_TEST_ENDPOINT = "https://eth-mainnet.g.alchemy.com/v2/";
const DRPC_KEY_TEST_ENDPOINT = "https://lb.drpc.live/ethereum/";
const OPENSEA_API_BASE_URL = "https://api.opensea.io";
const OPENSEA_KEY_TEST_COLLECTION_SLUG = "cryptopunks";

const secretEnvNames = {
  explorerApiKey: "ETHERSCAN_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  alchemyApiKey: "ALCHEMY_API_KEY",
  drpcApiKey: "DRPC_API_KEY",
  openseaApiKey: "OPENSEA_API_KEY"
};

const secretStorageKeys = {
  explorerApiKey: "explorer_api_key",
  openaiApiKey: "openai_api_key",
  alchemyApiKey: "alchemy_api_key",
  drpcApiKey: "drpc_api_key",
  openseaApiKey: "opensea_api_key"
};

function createDefaultDashboardSettings() {
  return {
    profileName: "local",
    theme: "quantum-operator",
    resultsPath: "./dist/mint-results.json"
  };
}

function trimValue(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
}

function normalizeDashboardSettings(settings) {
  const fallback = createDefaultDashboardSettings();
  const source = settings && typeof settings === "object" ? settings : {};

  return {
    profileName: trimValue(source.profileName, fallback.profileName),
    theme: trimValue(source.theme, fallback.theme),
    resultsPath: trimValue(source.resultsPath, fallback.resultsPath)
  };
}

function formatError(error) {
  if (!error) {
    return "Unknown error";
  }

  return error.shortMessage || error.reason || error.message || String(error);
}

function resolveSecretValue(secretName, storedSecrets = {}) {
  const stored = trimValue(storedSecrets[secretName], "");
  if (stored) {
    return stored;
  }

  const envName = secretEnvNames[secretName];
  if (!envName) {
    return "";
  }

  return trimValue(process.env[envName], "");
}

function resolveIntegrationSecrets(storedSecrets = {}) {
  return Object.keys(secretEnvNames).reduce((resolved, secretName) => {
    resolved[secretName] = resolveSecretValue(secretName, storedSecrets);
    return resolved;
  }, {});
}

function buildClientSettings(settings, storedSecrets = {}, integrationHealth = {}) {
  const normalized = normalizeDashboardSettings(settings);
  const resolved = resolveIntegrationSecrets(storedSecrets);
  const storedExplorerApiKey = trimValue(storedSecrets.explorerApiKey, "");
  const envExplorerApiKey = trimValue(process.env[secretEnvNames.explorerApiKey], "");
  const explorerApiKeySource = storedExplorerApiKey ? "saved" : envExplorerApiKey ? "env" : "";
  const storedOpenAiApiKey = trimValue(storedSecrets.openaiApiKey, "");
  const envOpenAiApiKey = trimValue(process.env[secretEnvNames.openaiApiKey], "");
  const openaiApiKeySource = storedOpenAiApiKey ? "saved" : envOpenAiApiKey ? "env" : "";
  const storedAlchemyApiKey = trimValue(storedSecrets.alchemyApiKey, "");
  const envAlchemyApiKey = trimValue(process.env[secretEnvNames.alchemyApiKey], "");
  const alchemyApiKeySource = storedAlchemyApiKey ? "saved" : envAlchemyApiKey ? "env" : "";
  const storedDrpcApiKey = trimValue(storedSecrets.drpcApiKey, "");
  const envDrpcApiKey = trimValue(process.env[secretEnvNames.drpcApiKey], "");
  const drpcApiKeySource = storedDrpcApiKey ? "saved" : envDrpcApiKey ? "env" : "";
  const storedOpenSeaApiKey = trimValue(storedSecrets.openseaApiKey, "");
  const envOpenSeaApiKey = trimValue(process.env[secretEnvNames.openseaApiKey], "");
  const openseaApiKeySource = storedOpenSeaApiKey ? "saved" : envOpenSeaApiKey ? "env" : "";
  const explorerHealth = integrationHealth.explorerApiKey || {};
  const openaiHealth = integrationHealth.openaiApiKey || {};
  const alchemyHealth = integrationHealth.alchemyApiKey || {};
  const drpcHealth = integrationHealth.drpcApiKey || {};
  const openseaHealth = integrationHealth.openseaApiKey || {};

  return {
    ...normalized,
    explorerApiKeyConfigured: Boolean(resolved.explorerApiKey),
    explorerApiKeySource,
    explorerApiKeyHealthy: explorerHealth.status === "healthy",
    explorerApiKeyHealthStatus: trimValue(
      explorerApiKeySource ? explorerHealth.status : "missing",
      explorerApiKeySource ? "unknown" : "missing"
    ),
    explorerApiKeyError: trimValue(explorerHealth.error, ""),
    explorerApiKeyCheckedAt: trimValue(explorerHealth.checkedAt, ""),
    openaiApiKeyConfigured: Boolean(resolved.openaiApiKey),
    openaiApiKeySource,
    openaiApiKeyHealthy: openaiHealth.status === "healthy",
    openaiApiKeyHealthStatus: trimValue(
      openaiApiKeySource ? openaiHealth.status : "missing",
      openaiApiKeySource ? "unknown" : "missing"
    ),
    openaiApiKeyError: trimValue(openaiHealth.error, ""),
    openaiApiKeyCheckedAt: trimValue(openaiHealth.checkedAt, ""),
    alchemyApiKeyConfigured: Boolean(resolved.alchemyApiKey),
    alchemyApiKeySource,
    alchemyApiKeyHealthy: alchemyHealth.status === "healthy",
    alchemyApiKeyHealthStatus: trimValue(
      alchemyApiKeySource ? alchemyHealth.status : "missing",
      alchemyApiKeySource ? "unknown" : "missing"
    ),
    alchemyApiKeyError: trimValue(alchemyHealth.error, ""),
    alchemyApiKeyCheckedAt: trimValue(alchemyHealth.checkedAt, ""),
    drpcApiKeyConfigured: Boolean(resolved.drpcApiKey),
    drpcApiKeySource,
    drpcApiKeyHealthy: drpcHealth.status === "healthy",
    drpcApiKeyHealthStatus: trimValue(
      drpcApiKeySource ? drpcHealth.status : "missing",
      drpcApiKeySource ? "unknown" : "missing"
    ),
    drpcApiKeyError: trimValue(drpcHealth.error, ""),
    drpcApiKeyCheckedAt: trimValue(drpcHealth.checkedAt, ""),
    openseaApiKeyConfigured: Boolean(resolved.openseaApiKey),
    openseaApiKeySource,
    openseaApiKeyHealthy: openseaHealth.status === "healthy",
    openseaApiKeyHealthStatus: trimValue(
      openseaApiKeySource ? openseaHealth.status : "missing",
      openseaApiKeySource ? "unknown" : "missing"
    ),
    openseaApiKeyError: trimValue(openseaHealth.error, ""),
    openseaApiKeyCheckedAt: trimValue(openseaHealth.checkedAt, ""),
    openaiRpcAdvisorModel: trimValue(process.env.OPENAI_RPC_ADVISOR_MODEL, "gpt-5-mini-2025-08-07")
  };
}

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable. Use Node.js 18 or newer.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      }
    });

    const raw = await response.text();
    let payload = {};

    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { raw };
      }
    }

    if (!response.ok) {
      throw new Error(
        payload.description ||
          payload.result ||
          payload.message ||
          payload.raw ||
          `Request failed with status ${response.status}`
      );
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAbiFromExplorer({ chainId, address, apiKey }) {
  if (!apiKey) {
    throw new Error("Explorer API key is not configured");
  }

  if (!ethers.isAddress(address)) {
    throw new Error("Contract address is not valid");
  }

  const requestUrl = new URL(EXPLORER_BASE_URL);
  requestUrl.search = new URLSearchParams({
    chainid: String(chainId),
    module: "contract",
    action: "getabi",
    address,
    apikey: apiKey
  }).toString();

  const payload = await fetchJson(requestUrl);
  if (String(payload.status) !== "1") {
    throw new Error(payload.result || payload.message || "Explorer ABI request failed");
  }

  let parsedAbi;
  try {
    parsedAbi = JSON.parse(payload.result);
  } catch (error) {
    throw new Error(`Explorer returned invalid ABI JSON: ${formatError(error)}`);
  }

  if (!Array.isArray(parsedAbi)) {
    throw new Error("Explorer ABI response was not a JSON array");
  }

  return {
    abi: parsedAbi
  };
}

async function fetchOpenSeaCollectionBySlug({ slug, apiKey }) {
  if (!apiKey) {
    throw new Error("OpenSea API key is not configured");
  }

  const normalizedSlug = trimValue(slug);
  if (!normalizedSlug) {
    throw new Error("OpenSea collection slug is required");
  }

  const requestUrl = new URL(
    `/api/v2/collections/${encodeURIComponent(normalizedSlug)}`,
    OPENSEA_API_BASE_URL
  );

  const payload = await fetchJson(requestUrl, {
    method: "GET",
    headers: {
      "x-api-key": apiKey
    }
  });

  return payload;
}

async function fetchAlchemyBlockNumber({ apiKey }) {
  if (!apiKey) {
    throw new Error("Alchemy API key is not configured");
  }

  const endpoint = `${ALCHEMY_KEY_TEST_ENDPOINT}${encodeURIComponent(apiKey)}`;
  const payload = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: []
    })
  });

  if (!payload || payload.jsonrpc !== "2.0" || payload.error || !payload.result) {
    throw new Error(payload?.error?.message || "Alchemy RPC request failed");
  }

  const blockNumber = Number.parseInt(String(payload.result), 16);
  if (!Number.isFinite(blockNumber)) {
    throw new Error("Alchemy returned an invalid block number");
  }

  return {
    endpoint,
    blockNumber
  };
}

async function fetchDrpcBlockNumber({ apiKey }) {
  if (!apiKey) {
    throw new Error("dRPC API key is not configured");
  }

  const endpoint = `${DRPC_KEY_TEST_ENDPOINT}${encodeURIComponent(apiKey)}`;
  const payload = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: []
    })
  });

  if (!payload || payload.jsonrpc !== "2.0" || payload.error || !payload.result) {
    throw new Error(payload?.error?.message || "dRPC request failed");
  }

  const blockNumber = Number.parseInt(String(payload.result), 16);
  if (!Number.isFinite(blockNumber)) {
    throw new Error("dRPC returned an invalid block number");
  }

  return {
    endpoint,
    blockNumber
  };
}

module.exports = {
  ALCHEMY_KEY_TEST_ENDPOINT,
  DRPC_KEY_TEST_ENDPOINT,
  buildClientSettings,
  createDefaultDashboardSettings,
  fetchAlchemyBlockNumber,
  fetchDrpcBlockNumber,
  fetchAbiFromExplorer,
  fetchOpenSeaCollectionBySlug,
  normalizeDashboardSettings,
  OPENSEA_KEY_TEST_COLLECTION_SLUG,
  resolveIntegrationSecrets,
  secretEnvNames,
  secretStorageKeys
};
