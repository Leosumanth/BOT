const { ethers } = require("ethers");

const EXPLORER_BASE_URL = "https://api.etherscan.io/v2/api";

const secretEnvNames = {
  explorerApiKey: "ETHERSCAN_API_KEY",
  openaiApiKey: "OPENAI_API_KEY"
};

const secretStorageKeys = {
  explorerApiKey: "explorer_api_key"
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

function buildClientSettings(settings, storedSecrets = {}) {
  const normalized = normalizeDashboardSettings(settings);
  const resolved = resolveIntegrationSecrets(storedSecrets);
  const storedExplorerApiKey = trimValue(storedSecrets.explorerApiKey, "");
  const envExplorerApiKey = trimValue(process.env[secretEnvNames.explorerApiKey], "");
  const explorerApiKeySource = storedExplorerApiKey ? "saved" : envExplorerApiKey ? "env" : "";
  const storedOpenAiApiKey = trimValue(storedSecrets.openaiApiKey, "");
  const envOpenAiApiKey = trimValue(process.env[secretEnvNames.openaiApiKey], "");
  const openaiApiKeySource = storedOpenAiApiKey ? "saved" : envOpenAiApiKey ? "env" : "";

  return {
    ...normalized,
    explorerApiKeyConfigured: Boolean(resolved.explorerApiKey),
    explorerApiKeySource,
    openaiApiKeyConfigured: Boolean(resolved.openaiApiKey),
    openaiApiKeySource,
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

module.exports = {
  buildClientSettings,
  createDefaultDashboardSettings,
  fetchAbiFromExplorer,
  normalizeDashboardSettings,
  resolveIntegrationSecrets,
  secretEnvNames,
  secretStorageKeys
};
