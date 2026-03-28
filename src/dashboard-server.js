require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { ethers } = require("ethers");
const { AbortRunError, formatError, runMintBot } = require("./bot");
const { hasClaimAutomation } = require("./claims");
const mintAutomation = require("./mint-automation");
const { defaultInputValues, normalizeConfig, normalizeGasStrategyValue } = require("./config");
const { createDatabase, normalizePersistentState } = require("./database");
const {
  defaultMintSourceStage,
  defaultMintSourceType,
  getMintSourceDefinition,
  listMintSourceDefinitions,
  normalizeMintSourceSelection,
  resolveMintSourceContext,
  validateMintSourceSelection
} = require("./mint-sources");
const {
  buildClientSettings,
  fetchAlchemyBlockNumber,
  fetchDrpcBlockNumber,
  fetchAbiFromExplorer,
  fetchOpenSeaCollectionBySlug,
  normalizeOpenSeaCollection,
  normalizeDashboardSettings,
  OPENSEA_KEY_TEST_COLLECTION_SLUG,
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
const loginRateLimitWindowMs = Math.max(
  30_000,
  Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000)
);
const loginRateLimitMaxAttempts = Math.max(
  3,
  Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || 5)
);
const loginRateLimitBlockMs = Math.max(
  loginRateLimitWindowMs,
  Number(process.env.LOGIN_RATE_LIMIT_BLOCK_MS || 15 * 60 * 1000)
);
const scheduledTaskPollIntervalMs = Math.max(
  1000,
  Number(process.env.SCHEDULE_POLL_INTERVAL_MS || 1000)
);
const defaultChainlistRpcCatalogUrls = [
  "https://chainlist.org/rpcs.json",
  "https://chainid.network/chains.json"
];
const chainlistRpcCatalogUrls = [
  ...new Set(
    (
      process.env.CHAINLIST_RPC_CATALOG_URLS ||
      process.env.CHAINLIST_RPC_CATALOG_URL ||
      defaultChainlistRpcCatalogUrls.join(",")
    )
      .split(",")
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )
];
const chainlistRpcCacheTtlMs = Math.max(
  60_000,
  Number(process.env.CHAINLIST_RPC_CACHE_TTL_MS || 15 * 60 * 1000)
);
const chainlistRpcFetchTimeoutMs = Math.max(
  5_000,
  Number(process.env.CHAINLIST_RPC_FETCH_TIMEOUT_MS || 15_000)
);
const rpcHealthWarningLatencyMs = Math.max(120, Number(process.env.RPC_HEALTH_WARNING_MS || 180));
const rpcHealthCriticalLatencyMs = Math.max(
  rpcHealthWarningLatencyMs + 40,
  Number(process.env.RPC_HEALTH_CRITICAL_MS || 320)
);
const explorerKeyTestAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const explorerKeyTestChainId = 1;
const operatorAssistantModel = String(
  process.env.OPENAI_OPERATOR_ASSISTANT_MODEL ||
    process.env.OPENAI_RPC_ADVISOR_MODEL ||
    "gpt-5-mini-2025-08-07"
).trim();
const mintPhaseOrder = ["gtd", "allowlist", "public"];
const mintPhaseLabels = {
  gtd: "GTD",
  allowlist: "Allowlist",
  public: "Public"
};
const mintPhaseGasProfiles = {
  gtd: {
    priority: "high",
    gasStrategy: "aggressive",
    gasBoostPercent: "8",
    priorityBoostPercent: "12",
    maxRetries: "2",
    retryDelayMs: "750"
  },
  allowlist: {
    priority: "high",
    gasStrategy: "aggressive",
    gasBoostPercent: "12",
    priorityBoostPercent: "18",
    maxRetries: "3",
    retryDelayMs: "600"
  },
  public: {
    priority: "critical",
    gasStrategy: "aggressive",
    gasBoostPercent: "18",
    priorityBoostPercent: "25",
    maxRetries: "4",
    retryDelayMs: "500"
  }
};
const appContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'"
].join("; ");

const clients = new Set();
const chainCatalog = [
  { key: "ethereum", label: "Ethereum", chainId: 1 },
  { key: "bsc", label: "BNB Smart Chain", chainId: 56 },
  { key: "sepolia", label: "Sepolia", chainId: 11155111 },
  { key: "optimism", label: "Optimism", chainId: 10 },
  { key: "polygon", label: "Polygon", chainId: 137 },
  { key: "base", label: "Base", chainId: 8453 },
  { key: "base_sepolia", label: "Base Sepolia", chainId: 84532 },
  { key: "arbitrum", label: "Arbitrum One", chainId: 42161 },
  { key: "blast", label: "Blast", chainId: 81457 },
  { key: "scroll", label: "Scroll", chainId: 534352 },
  { key: "zora", label: "Zora", chainId: 7777777 },
  { key: "shape", label: "Shape", chainId: 360 },
  { key: "plasma", label: "Plasma", chainId: 9745 }
];
const openseaChainKeyAliases = new Map([
  ["ethereum", "ethereum"],
  ["eth", "ethereum"],
  ["mainnet", "ethereum"],
  ["base", "base"],
  ["base_mainnet", "base"],
  ["base_sepolia", "base_sepolia"],
  ["basesepolia", "base_sepolia"],
  ["sepolia", "sepolia"],
  ["optimism", "optimism"],
  ["op", "optimism"],
  ["polygon", "polygon"],
  ["matic", "polygon"],
  ["arbitrum", "arbitrum"],
  ["arbitrum_one", "arbitrum"],
  ["bsc", "bsc"],
  ["bnb", "bsc"],
  ["bnb_smart_chain", "bsc"],
  ["blast", "blast"],
  ["scroll", "scroll"],
  ["zora", "zora"],
  ["shape", "shape"],
  ["plasma", "plasma"]
]);
const alchemyRpcImportCatalog = [
  { chainKey: "ethereum", chainId: 1, endpointKey: "eth-mainnet", label: "Ethereum Mainnet" },
  { chainKey: "bsc", chainId: 56, endpointKey: "bnb-mainnet", label: "BNB Smart Chain Mainnet" },
  { chainKey: "sepolia", chainId: 11155111, endpointKey: "eth-sepolia", label: "Ethereum Sepolia" },
  { chainKey: "optimism", chainId: 10, endpointKey: "opt-mainnet", label: "Optimism Mainnet" },
  { chainKey: "polygon", chainId: 137, endpointKey: "polygon-mainnet", label: "Polygon Mainnet" },
  { chainKey: "base", chainId: 8453, endpointKey: "base-mainnet", label: "Base Mainnet" },
  { chainKey: "base_sepolia", chainId: 84532, endpointKey: "base-sepolia", label: "Base Sepolia" },
  { chainKey: "arbitrum", chainId: 42161, endpointKey: "arb-mainnet", label: "Arbitrum Mainnet" },
  { chainKey: "blast", chainId: 81457, endpointKey: "blast-mainnet", label: "Blast Mainnet" },
  { chainKey: "scroll", chainId: 534352, endpointKey: "scroll-mainnet", label: "Scroll Mainnet" },
  { chainKey: "zora", chainId: 7777777, endpointKey: "zora-mainnet", label: "Zora Mainnet" },
  { chainKey: "shape", chainId: 360, endpointKey: "shape-mainnet", label: "Shape Mainnet" },
  { chainKey: "plasma", chainId: 9745, endpointKey: "plasma-mainnet", label: "Plasma Mainnet" }
];
const drpcRpcImportCatalog = [
  { chainKey: "ethereum", chainId: 1, networkKey: "ethereum", label: "Ethereum Mainnet" },
  { chainKey: "bsc", chainId: 56, networkKey: "bsc", label: "BNB Smart Chain Mainnet" },
  { chainKey: "optimism", chainId: 10, networkKey: "optimism", label: "Optimism Mainnet" },
  { chainKey: "polygon", chainId: 137, networkKey: "polygon", label: "Polygon Mainnet" },
  { chainKey: "base", chainId: 8453, networkKey: "base", label: "Base Mainnet" },
  { chainKey: "arbitrum", chainId: 42161, networkKey: "arbitrum", label: "Arbitrum Mainnet" }
];
const rpcProviderNamePatterns = [
  { pattern: /alchemy/i, label: "Alchemy" },
  { pattern: /infura/i, label: "Infura" },
  { pattern: /quicknode/i, label: "QuickNode" },
  { pattern: /llamarpc/i, label: "LlamaRPC" },
  { pattern: /publicnode/i, label: "PublicNode" },
  { pattern: /ankr/i, label: "Ankr" },
  { pattern: /blastapi/i, label: "BlastAPI" },
  { pattern: /chainstack/i, label: "Chainstack" },
  { pattern: /drpc/i, label: "dRPC" }
];
const rpcHostnameNoiseTokens = new Set([
  "rpc",
  "rpcs",
  "mainnet",
  "testnet",
  "sepolia",
  "node",
  "nodes",
  "public",
  "api",
  "network",
  "net",
  "main",
  "https",
  "http",
  "ws",
  "wss",
  "com",
  "org",
  "io",
  "xyz",
  "app",
  "dev",
  "gg",
  "one",
  "chain"
]);

let database = null;
let initialized = false;
let appState = null;
let integrationSecrets = {};
let integrationHealthState = createDefaultIntegrationHealthState();
const localTaskRuns = new Map();
const queuedTaskFallbackTimers = new Map();
let liveLogs = [];
let queueCoordinator = null;
let distributedRunState = createIdleRunState(resolveQueueConfig());
const distributedQueuedTaskIds = new Set();
const distributedTaskPatches = new Map();
const assistantConversations = new Map();
const loginAttemptBuckets = new Map();
let scheduledTaskLoop = null;
let scheduledTaskScanInFlight = false;
let shutdownPromise = null;
let chainlistRpcCatalogCache = {
  expiresAt: 0,
  value: null,
  pending: null
};
let nativeUsdPriceCache = {
  expiresAt: 0,
  value: null,
  pending: null
};
let openSeaMintRadarCache = {
  expiresAt: 0,
  value: null,
  pending: null
};
const walletAssetRpcTimeoutMs = Math.max(
  1_500,
  Number(process.env.WALLET_ASSET_RPC_TIMEOUT_MS || 4_000)
);
const queueInlineFallbackMs = Math.max(
  5_000,
  Number(process.env.QUEUE_INLINE_FALLBACK_MS || 8_000)
);
const queueInlineWorkerId =
  String(process.env.QUEUE_INLINE_WORKER_ID || "").trim() || `dashboard_${process.pid}`;
const walletAssetChainlistUrlBudget = Math.max(
  1,
  Number(process.env.WALLET_ASSET_CHAINLIST_URL_BUDGET || 2)
);
const nativeUsdPriceCacheTtlMs = Math.max(
  60_000,
  Number(process.env.NATIVE_USD_PRICE_CACHE_TTL_MS || 5 * 60 * 1000)
);
const nativeUsdPriceFetchTimeoutMs = Math.max(
  3_000,
  Number(process.env.NATIVE_USD_PRICE_FETCH_TIMEOUT_MS || 10_000)
);
const nativeUsdPriceUrl =
  process.env.NATIVE_USD_PRICE_URL ||
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin&vs_currencies=usd";
const openSeaDropsBaseUrl = String(process.env.OPENSEA_DROPS_BASE_URL || "https://opensea.io").trim();
const openSeaMintRadarCacheTtlMs = Math.max(
  30_000,
  Number(process.env.OPENSEA_MINT_RADAR_CACHE_TTL_MS || 5 * 60 * 1000)
);
const openSeaMintRadarFetchTimeoutMs = Math.max(
  5_000,
  Number(process.env.OPENSEA_MINT_RADAR_FETCH_TIMEOUT_MS || 12_000)
);
const openSeaMintRadarMaxPages = Math.max(
  1,
  Math.min(12, Number(process.env.OPENSEA_MINT_RADAR_MAX_PAGES || 8))
);
const openSeaMintRadarMaxItems = Math.max(
  12,
  Math.min(240, Number(process.env.OPENSEA_MINT_RADAR_MAX_ITEMS || 160))
);
const openSeaMintRadarLimitation =
  "Tracks the live and upcoming drops OpenSea is surfacing in its curated Drops calendar, not every NFT mint on every launch site.";

function createIntegrationHealthEntry(status = "missing", details = {}) {
  return {
    status,
    healthy: status === "healthy",
    checkedAt: details.checkedAt || "",
    error: details.error || ""
  };
}

function createDefaultIntegrationHealthState() {
  return Object.keys(secretStorageKeys).reduce((state, secretName) => {
    state[secretName] = createIntegrationHealthEntry("missing");
    return state;
  }, {});
}

function setIntegrationHealth(secretName, status, details = {}) {
  integrationHealthState = {
    ...integrationHealthState,
    [secretName]: createIntegrationHealthEntry(status, {
      ...details,
      checkedAt: details.checkedAt || new Date().toISOString()
    })
  };
}

function integrationHealthStatus(secretName) {
  return String(integrationHealthState?.[secretName]?.status || "").trim().toLowerCase();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isSocketRpcUrl(rpcUrl) {
  return /^wss?:\/\//i.test(String(rpcUrl || "").trim());
}

function normalizeRpcTransportFilter(transportFilter) {
  const normalized = String(transportFilter || "http").trim().toLowerCase();
  if (normalized === "ws") {
    return "ws";
  }

  if (normalized === "all") {
    return "all";
  }

  return "http";
}

function createProviderForRpcUrl(rpcUrl) {
  return isSocketRpcUrl(rpcUrl)
    ? new ethers.WebSocketProvider(rpcUrl)
    : new ethers.JsonRpcProvider(rpcUrl);
}

function parseRpcHexNumber(value, label = "RPC value") {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${label} is missing`);
  }

  const parsed = normalized.startsWith("0x") ? Number.parseInt(normalized, 16) : Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} is invalid`);
  }

  return parsed;
}

function getWebSocketProbeImpl() {
  if (typeof globalThis.WebSocket === "function") {
    return globalThis.WebSocket;
  }

  throw new Error("WebSocket probing is unavailable on this server runtime");
}

async function probeSocketRpcEndpoint(rpcUrl, timeoutMs = 10000, options = {}) {
  const { includeChainId = false } = options;
  const WebSocketImpl = getWebSocketProbeImpl();

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = new WebSocketImpl(rpcUrl);
    const requestIds = {
      chainId: `chain_${Date.now()}`,
      blockNumber: `block_${Date.now()}`
    };
    const result = {
      checkedAt: new Date().toISOString()
    };
    let settled = false;

    const finish = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);

      try {
        if (socket.readyState === WebSocketImpl.OPEN || socket.readyState === WebSocketImpl.CONNECTING) {
          socket.close();
        }
      } catch {
        // Ignore websocket close errors.
      }

      callback(value);
    };

    const timeoutId = setTimeout(() => {
      finish(reject, new Error("RPC websocket probe timed out"));
    }, timeoutMs);

    const sendBlockNumberRequest = () => {
      socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: requestIds.blockNumber,
          method: "eth_blockNumber",
          params: []
        })
      );
    };

    socket.addEventListener("open", () => {
      if (includeChainId) {
        socket.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: requestIds.chainId,
            method: "eth_chainId",
            params: []
          })
        );
        return;
      }

      sendBlockNumberRequest();
    });

    socket.addEventListener("message", (event) => {
      let payload = null;
      try {
        payload = JSON.parse(String(event.data || ""));
      } catch {
        return;
      }

      if (!payload || payload.jsonrpc !== "2.0") {
        return;
      }

      if (payload.error) {
        finish(reject, new Error(payload.error.message || "WebSocket RPC request failed"));
        return;
      }

      if (payload.id === requestIds.chainId) {
        try {
          result.chainId = parseRpcHexNumber(payload.result, "RPC chain ID");
        } catch (error) {
          finish(reject, error);
          return;
        }

        sendBlockNumberRequest();
        return;
      }

      if (payload.id === requestIds.blockNumber) {
        try {
          result.blockNumber = parseRpcHexNumber(payload.result, "RPC block number");
        } catch (error) {
          finish(reject, error);
          return;
        }

        result.latencyMs = Date.now() - started;
        finish(resolve, result);
      }
    });

    socket.addEventListener("error", (event) => {
      const message =
        event?.error?.message || event?.message || "WebSocket connection failed";
      finish(reject, new Error(message));
    });

    socket.addEventListener("close", (event) => {
      if (settled) {
        return;
      }

      const reason = String(event?.reason || "").trim();
      const code = Number(event?.code);
      const message =
        reason ||
        (Number.isFinite(code) ? `WebSocket connection closed (${code})` : "WebSocket connection closed");
      finish(reject, new Error(message));
    });
  });
}

async function destroyProvider(provider) {
  if (!provider) {
    return;
  }

  try {
    if (typeof provider.destroy === "function") {
      await provider.destroy();
      return;
    }

    if (provider.websocket && typeof provider.websocket.close === "function") {
      provider.websocket.close();
    }
  } catch {
    // Ignore provider shutdown errors.
  }
}

function findChainByChainId(chainId) {
  const normalized = Number(chainId);
  if (!Number.isFinite(normalized)) {
    return null;
  }

  return chainCatalog.find((entry) => entry.chainId === normalized) || null;
}

function normalizeChainEntry(entry = {}) {
  const key = String(entry.key || "").trim();
  const label = String(entry.label || "").trim();
  const chainId = Number(entry.chainId);
  const nativeCurrencySymbol = String(
    entry.nativeCurrencySymbol || entry.nativeSymbol || entry?.nativeCurrency?.symbol || ""
  ).trim();
  const nativeCurrencyName = String(
    entry.nativeCurrencyName || entry?.nativeCurrency?.name || ""
  ).trim();
  const nativeCurrencyDecimals = Number(
    entry.nativeCurrencyDecimals ?? entry?.nativeCurrency?.decimals ?? 18
  );

  if (!key || !label || !Number.isFinite(chainId)) {
    return null;
  }

  return {
    key,
    label,
    chainId,
    nativeCurrencySymbol: nativeCurrencySymbol || undefined,
    nativeCurrencyName: nativeCurrencyName || undefined,
    nativeCurrencyDecimals: Number.isFinite(nativeCurrencyDecimals) ? nativeCurrencyDecimals : 18,
    catalogued: Boolean(entry.catalogued)
  };
}

function slugifyChainKey(value, chainId = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) {
    return chainId ? `chain_${chainId}` : "";
  }

  const collidesWithDifferentChain = chainCatalog.some(
    (entry) => entry.key === normalized && String(entry.chainId) !== String(chainId)
  );
  return collidesWithDifferentChain ? `${normalized}_${chainId}` : normalized;
}

function titleCaseWords(value) {
  return String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
}

function hostnameContainsChainIdentity(hostname, chain) {
  const normalizedHostname = String(hostname || "").toLowerCase();
  if (!normalizedHostname || !chain) {
    return false;
  }

  const candidates = [
    chain.key,
    chain.label,
    chain.label.replace(/\bmainnet\b/gi, ""),
    chain.label.replace(/\bbeta\b/gi, "")
  ]
    .flatMap((value) =>
      String(value || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length >= 3)
    )
    .filter(Boolean);

  return candidates.some((candidate) => normalizedHostname.includes(candidate));
}

function formatRpcChainLabel(chain) {
  if (!chain) {
    return "";
  }

  return chain.key === "ethereum" ? "Mainnet ETH" : chain.label;
}

function inferRpcProviderName(rpcUrl) {
  let hostname = "";
  try {
    hostname = new URL(String(rpcUrl || "")).hostname.toLowerCase();
  } catch {
    return null;
  }

  const knownProvider = rpcProviderNamePatterns.find((entry) => entry.pattern.test(hostname));
  if (knownProvider) {
    return knownProvider.label;
  }

  const firstLabel = hostname.split(".")[0] || "";
  if (
    !firstLabel ||
    ["rpc", "mainnet", "sepolia", "testnet", "api", "node", "nodes", "public"].includes(firstLabel)
  ) {
    return null;
  }

  return titleCaseWords(firstLabel);
}

function inferChainLabelFromRpcUrl(rpcUrl, chainId) {
  let hostname = "";
  try {
    hostname = new URL(String(rpcUrl || "")).hostname.toLowerCase();
  } catch {
    hostname = "";
  }

  const labels = hostname.split(".").filter(Boolean);
  for (const label of labels) {
    const tokens = label
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter(Boolean);

    const chainTokens = tokens.filter(
      (token) =>
        token.length >= 3 &&
        !rpcHostnameNoiseTokens.has(token) &&
        !rpcProviderNamePatterns.some((entry) => entry.pattern.test(token))
    );

    if (chainTokens.length > 0) {
      return chainTokens.map((token) => titleCaseWords(token)).join(" ");
    }
  }

  return `Chain ${chainId}`;
}

function deriveChainDescriptor(chainId, rpcUrl) {
  const knownChain = findChainByChainId(chainId);
  if (knownChain) {
    return {
      ...knownChain,
      catalogued: true
    };
  }

  const label = inferChainLabelFromRpcUrl(rpcUrl, chainId);
  return {
    key: slugifyChainKey(label, chainId),
    label,
    chainId: Number(chainId),
    nativeCurrencyDecimals: 18,
    catalogued: false
  };
}

function buildAvailableChains(extraEntries = []) {
  const chainMap = new Map();

  chainCatalog.forEach((entry) => {
    const normalized = normalizeChainEntry(entry);
    if (normalized) {
      chainMap.set(normalized.key, normalized);
    }
  });

  extraEntries.forEach((entry) => {
    const normalized = normalizeChainEntry(entry);
    if (!normalized) {
      return;
    }

    const existing = chainMap.get(normalized.key);
    if (!existing) {
      chainMap.set(normalized.key, normalized);
      return;
    }

    chainMap.set(normalized.key, {
      key: existing.key,
      label: existing.label || normalized.label,
      chainId: Number.isFinite(existing.chainId) ? existing.chainId : normalized.chainId,
      nativeCurrencySymbol: existing.nativeCurrencySymbol || normalized.nativeCurrencySymbol || undefined,
      nativeCurrencyName: existing.nativeCurrencyName || normalized.nativeCurrencyName || undefined,
      nativeCurrencyDecimals: Number.isFinite(Number(existing.nativeCurrencyDecimals))
        ? Number(existing.nativeCurrencyDecimals)
        : Number.isFinite(Number(normalized.nativeCurrencyDecimals))
          ? Number(normalized.nativeCurrencyDecimals)
          : 18,
      catalogued: Boolean(existing.catalogued || normalized.catalogued)
    });
  });

  return [...chainMap.values()];
}

function getAvailableChains() {
  const rpcChains = (appState?.rpcNodes || [])
    .map((node) => ({
      key: node.chainKey,
      label: node.chainLabel || "",
      chainId: node.chainId
    }))
    .filter((entry) => entry.key && entry.label && Number.isFinite(Number(entry.chainId)));

  return buildAvailableChains(rpcChains);
}

function findAvailableChainByKey(chainKey) {
  const normalized = String(chainKey || "").trim();
  if (!normalized) {
    return null;
  }

  return getAvailableChains().find((entry) => entry.key === normalized) || null;
}

function buildRpcNameSuggestion(rpcUrl, chain = null, chainId = null) {
  let hostname = "";
  try {
    hostname = new URL(String(rpcUrl || "")).hostname.toLowerCase();
  } catch {
    hostname = "";
  }

  if (hostnameContainsChainIdentity(hostname, chain)) {
    return chain.label;
  }

  const providerName = inferRpcProviderName(rpcUrl);
  const chainLabel = formatRpcChainLabel(chain) || (chainId ? `Chain ${chainId}` : "");

  if (!providerName) {
    return chainLabel || "Custom RPC";
  }

  if (!chainLabel || providerName.toLowerCase() === chainLabel.toLowerCase()) {
    return providerName;
  }

  return `${providerName} (${chainLabel})`;
}

function normalizeChainlistRpcUrl(entry) {
  const rawValue =
    typeof entry === "string"
      ? entry
      : typeof entry?.url === "string"
        ? entry.url
        : typeof entry?.rpc === "string"
          ? entry.rpc
          : "";
  const normalized = String(rawValue || "").trim();
  if (!normalized || !/^(https?|wss?):\/\//i.test(normalized)) {
    return null;
  }

  if (
    /\$\{[^}]+\}|<[^>]+>|YOUR_|YOUR-|replace-with|replace_me|api[_-]?key|infura[_-]?api[_-]?key|alchemy[_-]?api[_-]?key/i.test(
      normalized
    )
  ) {
    return null;
  }

  try {
    return new URL(normalized).toString();
  } catch {
    return null;
  }
}

function filterRpcUrlsByTransport(rpcUrls = [], transportFilter = "http") {
  const normalizedFilter = normalizeRpcTransportFilter(transportFilter);
  if (normalizedFilter === "ws") {
    return rpcUrls.filter((rpcUrl) => isSocketRpcUrl(rpcUrl));
  }

  if (normalizedFilter === "all") {
    return rpcUrls;
  }

  return rpcUrls.filter((rpcUrl) => !isSocketRpcUrl(rpcUrl));
}

function selectChainlistProbeUrls(rpcUrls = [], probeBudget = 0, transportFilter = "http") {
  const budget = Math.max(1, Number(probeBudget) || 0);
  const normalizedFilter = normalizeRpcTransportFilter(transportFilter);
  const socketUrls = [];
  const standardUrls = [];

  rpcUrls.forEach((rpcUrl) => {
    if (isSocketRpcUrl(rpcUrl)) {
      socketUrls.push(rpcUrl);
      return;
    }

    standardUrls.push(rpcUrl);
  });

  const selected = [];
  const seen = new Set();
  const addUrl = (rpcUrl) => {
    if (!rpcUrl || seen.has(rpcUrl) || selected.length >= budget) {
      return;
    }

    seen.add(rpcUrl);
    selected.push(rpcUrl);
  };

  if (normalizedFilter === "ws") {
    socketUrls.forEach(addUrl);
    return selected;
  }

  if (normalizedFilter === "http") {
    standardUrls.forEach(addUrl);
    return selected;
  }

  // Reserve part of the probe budget for websocket endpoints when Chainlist provides them.
  const guaranteedSocketCount = Math.min(socketUrls.length, Math.max(1, Math.ceil(budget / 4)));
  socketUrls.slice(0, guaranteedSocketCount).forEach(addUrl);
  standardUrls.forEach(addUrl);
  socketUrls.slice(guaranteedSocketCount).forEach(addUrl);

  return selected;
}

function rankRpcNodesByLatency(rpcNodes = []) {
  const latencyFor = (node) =>
    Number.isFinite(Number(node?.lastHealth?.latencyMs)) ? Number(node.lastHealth.latencyMs) : Infinity;
  const statusRankFor = (node) => {
    if (node?.lastHealth?.status === "healthy") {
      return 0;
    }

    if (!node?.lastHealth) {
      return 1;
    }

    if (node.lastHealth.status === "unknown" || node.lastHealth.status === "untested") {
      return 2;
    }

    return 3;
  };
  const checkedAtFor = (node) => new Date(node?.lastHealth?.checkedAt || 0).getTime();

  return [...rpcNodes].sort((left, right) => {
    const statusDelta = statusRankFor(left) - statusRankFor(right);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const latencyDelta = latencyFor(left) - latencyFor(right);
    if (latencyDelta !== 0) {
      return latencyDelta;
    }

    const freshnessDelta = checkedAtFor(right) - checkedAtFor(left);
    if (freshnessDelta !== 0) {
      return freshnessDelta;
    }

    return String(left?.name || left?.url || "").localeCompare(String(right?.name || right?.url || ""));
  });
}

async function fetchChainlistRpcCatalog(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && chainlistRpcCatalogCache.value && chainlistRpcCatalogCache.expiresAt > now) {
    return chainlistRpcCatalogCache.value;
  }

  if (!forceRefresh && chainlistRpcCatalogCache.pending) {
    return chainlistRpcCatalogCache.pending;
  }

  const pending = (async () => {
    const fetchErrors = [];

    for (const catalogUrl of chainlistRpcCatalogUrls) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), chainlistRpcFetchTimeoutMs);

      try {
        const response = await fetch(catalogUrl, {
          headers: {
            accept: "application/json"
          },
          signal: controller.signal
        });

        if (!response.ok) {
          fetchErrors.push(`${catalogUrl} returned ${response.status}`);
          continue;
        }

        const payload = await response.json();
        if (!Array.isArray(payload)) {
          fetchErrors.push(`${catalogUrl} returned an unexpected payload`);
          continue;
        }

        chainlistRpcCatalogCache = {
          expiresAt: Date.now() + chainlistRpcCacheTtlMs,
          value: payload,
          pending: null
        };

        return payload;
      } catch (error) {
        const message =
          error?.name === "AbortError"
            ? `${catalogUrl} timed out after ${chainlistRpcFetchTimeoutMs}ms`
            : `${catalogUrl} failed: ${formatError(error)}`;
        fetchErrors.push(message);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (chainlistRpcCatalogCache.value) {
      chainlistRpcCatalogCache = {
        ...chainlistRpcCatalogCache,
        pending: null
      };
      return chainlistRpcCatalogCache.value;
    }

    throw new Error(
      `RPC catalog is temporarily unavailable. ${fetchErrors.join(" | ")}`
    );
  })();

  chainlistRpcCatalogCache.pending = pending;

  try {
    return await pending;
  } catch (error) {
    chainlistRpcCatalogCache.pending = null;
    throw error;
  }
}

function findChainlistEntry(chainlistCatalog, chain) {
  if (!Array.isArray(chainlistCatalog) || !chain) {
    return null;
  }

  const wantedChainId = Number(chain.chainId);
  if (!Number.isFinite(wantedChainId)) {
    return null;
  }

  return (
    chainlistCatalog.find((entry) => Number(entry?.chainId) === wantedChainId) ||
    chainlistCatalog.find(
      (entry) => String(entry?.name || "").trim().toLowerCase() === String(chain.label || "").trim().toLowerCase()
    ) ||
    null
  );
}

function normalizeChainSearchQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractChainlistRpcUrls(chainlistEntry) {
  const rawCandidates = [];

  if (Array.isArray(chainlistEntry?.rpc)) {
    rawCandidates.push(...chainlistEntry.rpc);
  }

  if (Array.isArray(chainlistEntry?.rpcs)) {
    rawCandidates.push(...chainlistEntry.rpcs);
  }

  const seen = new Set();
  const normalized = [];

  rawCandidates.forEach((entry) => {
    const rpcUrl = normalizeChainlistRpcUrl(entry);
    if (!rpcUrl || seen.has(rpcUrl)) {
      return;
    }

    seen.add(rpcUrl);
    normalized.push(rpcUrl);
  });

  return normalized;
}

function buildChainDescriptorFromChainlistEntry(entry = {}) {
  const chainId = Number(entry?.chainId);
  if (!Number.isFinite(chainId)) {
    return null;
  }

  const knownChain = findChainByChainId(chainId);
  if (knownChain) {
    return {
      ...knownChain,
      nativeCurrencySymbol: knownChain.nativeCurrencySymbol || entry?.nativeCurrency?.symbol || undefined,
      nativeCurrencyName: knownChain.nativeCurrencyName || entry?.nativeCurrency?.name || undefined,
      nativeCurrencyDecimals: Number(entry?.nativeCurrency?.decimals ?? knownChain.nativeCurrencyDecimals ?? 18),
      catalogued: true
    };
  }

  const labelCandidates = [
    String(entry?.name || "").trim(),
    String(entry?.chain || "").trim(),
    titleCaseWords(String(entry?.chainSlug || "").replace(/[_-]+/g, " ")),
    titleCaseWords(String(entry?.shortName || "").replace(/[_-]+/g, " "))
  ].filter(Boolean);

  const label = labelCandidates[0] || `Chain ${chainId}`;
  const keySeed =
    String(entry?.chainSlug || "").trim() ||
    String(entry?.shortName || "").trim() ||
    String(entry?.chain || "").trim() ||
    label;

  return {
    key: slugifyChainKey(keySeed, chainId),
    label,
    chainId,
    nativeCurrencySymbol: String(entry?.nativeCurrency?.symbol || "").trim() || undefined,
    nativeCurrencyName: String(entry?.nativeCurrency?.name || "").trim() || undefined,
    nativeCurrencyDecimals: Number(entry?.nativeCurrency?.decimals ?? 18),
    catalogued: false
  };
}

function chainlistEntrySearchTerms(entry = {}, descriptor = null) {
  const resolvedDescriptor = descriptor || buildChainDescriptorFromChainlistEntry(entry);
  const rawTerms = [
    resolvedDescriptor?.key,
    resolvedDescriptor?.label,
    String(resolvedDescriptor?.label || "").replace(/\b(mainnet|testnet|network)\b/gi, " "),
    entry?.name,
    entry?.chain,
    entry?.chainSlug,
    entry?.shortName
  ];

  return [...new Set(rawTerms.map((term) => normalizeChainSearchQuery(term)).filter(Boolean))];
}

function levenshteinDistance(left, right) {
  const source = String(left || "");
  const target = String(right || "");
  if (!source) {
    return target.length;
  }

  if (!target) {
    return source.length;
  }

  const rows = Array.from({ length: source.length + 1 }, (_, index) => [index]);
  for (let column = 0; column <= target.length; column += 1) {
    rows[0][column] = column;
  }

  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const substitutionCost = source[row - 1] === target[column - 1] ? 0 : 1;
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return rows[source.length][target.length];
}

function scoreChainSearchTerm(term, query) {
  if (!term || !query) {
    return null;
  }

  if (term === query) {
    return { score: 0, mode: "exact" };
  }

  if (term.startsWith(query) || query.startsWith(term)) {
    return {
      score: 1 + Math.abs(term.length - query.length) / 100,
      mode: "prefix"
    };
  }

  if (term.includes(query) || query.includes(term)) {
    return {
      score: 2 + Math.abs(term.length - query.length) / 100,
      mode: "contains"
    };
  }

  const compactTerm = term.replace(/\s+/g, "");
  const compactQuery = query.replace(/\s+/g, "");
  const distance = levenshteinDistance(compactTerm, compactQuery);
  const threshold = Math.max(1, Math.ceil(Math.max(compactTerm.length, compactQuery.length) * 0.22));
  if (distance > threshold) {
    return null;
  }

  return {
    score: 3 + distance / 10,
    mode: "fuzzy"
  };
}

function searchChainlistCatalog(chainlistCatalog, query) {
  const normalizedQuery = normalizeChainSearchQuery(query);
  if (!normalizedQuery || !Array.isArray(chainlistCatalog)) {
    return null;
  }

  let bestMatch = null;

  chainlistCatalog.forEach((entry) => {
    const descriptor = buildChainDescriptorFromChainlistEntry(entry);
    if (!descriptor || extractChainlistRpcUrls(entry).length === 0) {
      return;
    }

    const terms = chainlistEntrySearchTerms(entry, descriptor);
    terms.forEach((term) => {
      const score = scoreChainSearchTerm(term, normalizedQuery);
      if (!score) {
        return;
      }

      if (
        !bestMatch ||
        score.score < bestMatch.score ||
        (score.score === bestMatch.score && term.length < bestMatch.term.length)
      ) {
        bestMatch = {
          chain: descriptor,
          entry,
          term,
          mode: score.mode,
          score: score.score
        };
      }
    });
  });

  return bestMatch;
}

async function resolveChainlistRequestChain(payload = {}) {
  const directChainKey = String(payload.chainKey || "").trim();
  if (directChainKey) {
    const directMatch =
      findAvailableChainByKey(directChainKey) ||
      buildAvailableChains().find((entry) => String(entry.key || "").trim() === directChainKey);
    if (directMatch) {
      return {
        chain: directMatch,
        chainlistCatalog: null,
        chainlistEntry: null,
        resolution: {
          source: "local",
          term: normalizeChainSearchQuery(directMatch.label || directMatch.key),
          mode: "exact"
        }
      };
    }
  }

  const chainlistCatalog = await fetchChainlistRpcCatalog(Boolean(payload.forceRefresh));
  const requestedChainId = Number(payload.chainId);
  if (Number.isFinite(requestedChainId)) {
    const exactEntry = chainlistCatalog.find((entry) => Number(entry?.chainId) === requestedChainId) || null;
    if (exactEntry) {
      return {
        chain: buildChainDescriptorFromChainlistEntry(exactEntry),
        chainlistCatalog,
        chainlistEntry: exactEntry,
        resolution: {
          source: "chainlist_id",
          term: String(requestedChainId),
          mode: "exact"
        }
      };
    }
  }

  const query = String(payload.query || payload.chainLabel || payload.chainName || "").trim();
  if (!query) {
    throw new Error("Choose a chain before scanning Chainlist RPCs");
  }

  const match = searchChainlistCatalog(chainlistCatalog, query);
  if (!match) {
    throw new Error(
      `No Chainlist EVM chain matched "${query}". Chainlist only covers EVM-compatible networks, so non-EVM chains like Aptos will not appear.`
    );
  }

  return {
    chain: match.chain,
    chainlistCatalog,
    chainlistEntry: match.entry,
    resolution: {
      source: "chainlist_search",
      term: match.term,
      mode: match.mode
    }
  };
}

function buildUniqueRpcNodeName(desiredName, existingNodes = []) {
  const baseName = String(desiredName || "").trim() || "Custom RPC";
  const takenNames = new Set(existingNodes.map((node) => String(node?.name || "").trim().toLowerCase()));
  if (!takenNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (takenNames.has(`${baseName} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }

  return `${baseName} ${suffix}`;
}

async function collectChainlistRpcCandidates(chain, options = {}) {
  if (!chain?.chainId) {
    throw new Error("Choose a chain before scanning Chainlist RPCs");
  }

  const transportFilter = normalizeRpcTransportFilter(options.transportFilter);
  const resultLimit = Math.min(10, Math.max(1, Number(options.limit || 6)));
  const probeBudget = Math.min(30, Math.max(resultLimit, Number(options.probeBudget || resultLimit * 4)));
  const chainlistCatalog =
    options.chainlistCatalog || (await fetchChainlistRpcCatalog(Boolean(options.forceRefresh)));
  const chainlistEntry = options.chainlistEntry || findChainlistEntry(chainlistCatalog, chain);
  if (!chainlistEntry) {
    throw new Error(`Chainlist does not currently publish RPCs for ${chain.label}`);
  }

  const allPublishedUrls = extractChainlistRpcUrls(chainlistEntry);
  if (allPublishedUrls.length === 0) {
    throw new Error(`Chainlist does not currently publish usable RPC URLs for ${chain.label}`);
  }

  const publishedUrls = filterRpcUrlsByTransport(allPublishedUrls, transportFilter);
  if (publishedUrls.length === 0) {
    return {
      chain,
      transportFilter,
      publishedCount: 0,
      publishedSocketCount: 0,
      skippedExistingCount: 0,
      skippedProbeBudgetCount: 0,
      probedCount: 0,
      probedSocketCount: 0,
      healthyCount: 0,
      healthySocketCount: 0,
      allConfigured: false,
      transportUnavailable: true,
      candidates: []
    };
  }

  const existingUrls = new Set(appState.rpcNodes.map((node) => String(node.url || "").trim()));
  const skippedExistingCount = publishedUrls.filter((rpcUrl) => existingUrls.has(rpcUrl)).length;
  const freshUrls = publishedUrls.filter((rpcUrl) => !existingUrls.has(rpcUrl));

  if (freshUrls.length === 0) {
    return {
      chain,
      transportFilter,
      publishedCount: publishedUrls.length,
      publishedSocketCount: publishedUrls.filter((rpcUrl) => isSocketRpcUrl(rpcUrl)).length,
      skippedExistingCount,
      skippedProbeBudgetCount: 0,
      probedCount: 0,
      probedSocketCount: 0,
      healthyCount: 0,
      healthySocketCount: 0,
      allConfigured: true,
      transportUnavailable: false,
      candidates: []
    };
  }

  const candidateUrls = selectChainlistProbeUrls(freshUrls, probeBudget, transportFilter);
  const probeResults = await Promise.all(
    candidateUrls.map(async (rpcUrl) => {
      const candidate = {
        id: createId("rpc_probe"),
        name: buildRpcNameSuggestion(rpcUrl, chain, chain.chainId),
        url: rpcUrl,
        chainKey: chain.key,
        chainId: chain.chainId,
        chainLabel: chain.label,
        enabled: true,
        group: "Chainlist",
        source: "preview",
        lastHealth: null
      };

      await testRpcNodeHealth(candidate);
      return candidate;
    })
  );

  const rankedCandidates = rankRpcNodesByLatency(probeResults);
  const recommendedCandidate =
    rankedCandidates.find((candidate) => candidate.lastHealth?.status === "healthy") || rankedCandidates[0] || null;
  const previewCandidates = [];
  const previewUrls = new Set();
  const pushPreviewCandidate = (candidate) => {
    if (!candidate || previewUrls.has(candidate.url) || previewCandidates.length >= resultLimit) {
      return;
    }

    previewUrls.add(candidate.url);
    previewCandidates.push(candidate);
  };

  pushPreviewCandidate(recommendedCandidate);
  rankedCandidates.forEach(pushPreviewCandidate);

  const namedCandidates = [];
  previewCandidates.forEach((candidate) => {
    const originalRank = rankedCandidates.findIndex((entry) => entry.url === candidate.url) + 1;
    namedCandidates.push({
      ...candidate,
      name: buildUniqueRpcNodeName(candidate.name, namedCandidates),
      recommended: candidate.url === recommendedCandidate?.url && candidate.lastHealth?.status === "healthy",
      rank: originalRank > 0 ? originalRank : null
    });
  });

  return {
    chain,
    transportFilter,
    publishedCount: publishedUrls.length,
    publishedSocketCount: publishedUrls.filter((rpcUrl) => isSocketRpcUrl(rpcUrl)).length,
    skippedExistingCount,
    skippedProbeBudgetCount: Math.max(0, freshUrls.length - candidateUrls.length),
    probedCount: candidateUrls.length,
    probedSocketCount: candidateUrls.filter((rpcUrl) => isSocketRpcUrl(rpcUrl)).length,
    healthyCount: probeResults.filter((candidate) => candidate.lastHealth?.status === "healthy").length,
    healthySocketCount: probeResults.filter(
      (candidate) => candidate.lastHealth?.status === "healthy" && isSocketRpcUrl(candidate.url)
    ).length,
    allConfigured: false,
    transportUnavailable: false,
    candidates: namedCandidates
  };
}

function rpcTaskDemandForChain(chainKey) {
  const tasks = (appState?.tasks || []).filter((task) => task.chainKey === chainKey);
  return {
    total: tasks.length,
    live: tasks.filter((task) => ["running", "queued"].includes(task.status)).length,
    multiRpcBroadcast: tasks.filter((task) => task.multiRpcBroadcast).length,
    mempool: tasks.filter((task) => task.executionTriggerMode === "mempool").length,
    relay: tasks.filter((task) => task.privateRelayEnabled).length
  };
}

function buildRpcAdvisorContext(focusChainKey = "") {
  const normalizedFocusChainKey = String(focusChainKey || "").trim();
  const focusChain = normalizedFocusChainKey ? findAvailableChainByKey(normalizedFocusChainKey) : null;
  const relevantNodes = (appState?.rpcNodes || []).filter(
    (node) => !focusChain || node.chainKey === focusChain.key
  );
  const relevantTasks = (appState?.tasks || []).filter(
    (task) => !focusChain || task.chainKey === focusChain.key
  );
  const chainKeys = new Set([
    ...relevantNodes.map((node) => node.chainKey),
    ...relevantTasks.map((task) => task.chainKey)
  ]);

  const chains = [...chainKeys]
    .filter(Boolean)
    .map((chainKey) => {
      const nodes = rankRpcNodesByLatency(relevantNodes.filter((node) => node.chainKey === chainKey));
      const healthyNodes = nodes.filter((node) => node.lastHealth?.status === "healthy");
      const healthySocketNodes = healthyNodes.filter((node) => /^wss?:\/\//i.test(String(node.url || "")));
      const taskDemand = rpcTaskDemandForChain(chainKey);
      const avgLatencyMs = healthyNodes.length
        ? Math.round(
            healthyNodes.reduce(
              (sum, node) => sum + Number(node.lastHealth?.latencyMs || 0),
              0
            ) / healthyNodes.length
          )
        : null;

      return {
        chainKey,
        chainLabel: chainLabel(chainKey),
        rpcNodeCount: nodes.length,
        healthyRpcCount: healthyNodes.length,
        healthySocketCount: healthySocketNodes.length,
        averageHealthyLatencyMs: avgLatencyMs,
        primaryRpc: healthyNodes[0]
          ? {
              name: healthyNodes[0].name,
              latencyMs: healthyNodes[0].lastHealth?.latencyMs,
              transport: /^wss?:\/\//i.test(String(healthyNodes[0].url || "")) ? "websocket" : "http"
            }
          : null,
        fallbackRpcs: healthyNodes.slice(1, 4).map((node) => ({
          name: node.name,
          latencyMs: node.lastHealth?.latencyMs,
          transport: /^wss?:\/\//i.test(String(node.url || "")) ? "websocket" : "http"
        })),
        taskDemand,
        nodes: nodes.slice(0, 8).map((node) => ({
          name: node.name,
          url: node.url,
          source: node.source,
          transport: /^wss?:\/\//i.test(String(node.url || "")) ? "websocket" : "http",
          status: node.lastHealth?.status || "untested",
          latencyMs: Number.isFinite(Number(node.lastHealth?.latencyMs))
            ? Number(node.lastHealth.latencyMs)
            : null,
          checkedAt: node.lastHealth?.checkedAt || null
        }))
      };
    });

  const healthyNodes = relevantNodes.filter((node) => node.lastHealth?.status === "healthy");
  const averageHealthyLatencyMs = healthyNodes.length
    ? Math.round(
        healthyNodes.reduce(
          (sum, node) => sum + Number(node.lastHealth?.latencyMs || 0),
          0
        ) / healthyNodes.length
      )
    : null;

  return {
    generatedAt: new Date().toISOString(),
    focusChain: focusChain
      ? {
          key: focusChain.key,
          label: focusChain.label,
          chainId: focusChain.chainId
        }
      : null,
    mesh: {
      totalRpcNodes: relevantNodes.length,
      healthyRpcNodes: healthyNodes.length,
      healthySocketRpcNodes: healthyNodes.filter((node) => /^wss?:\/\//i.test(String(node.url || ""))).length,
      averageHealthyLatencyMs
    },
    tasks: relevantTasks.slice(0, 18).map((task) => ({
      id: task.id,
      name: task.name,
      chainKey: task.chainKey,
      status: task.status,
      multiRpcBroadcast: Boolean(task.multiRpcBroadcast),
      triggerMode: task.executionTriggerMode,
      privateRelayEnabled: Boolean(task.privateRelayEnabled),
      privateRelayOnly: Boolean(task.privateRelayOnly),
      warmupRpc: Boolean(task.warmupRpc)
    })),
    chains
  };
}

function extractOpenAiResponseText(payload = {}) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const fragments = [];
  (payload.output || []).forEach((item) => {
    (item?.content || []).forEach((content) => {
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        fragments.push(content.text.trim());
      }
    });
  });

  return fragments.join("\n\n").trim();
}

async function requestRpcAdvisorBrief({ focusChainKey = "", operatorPrompt = "" } = {}) {
  const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
  const apiKey = String(resolvedSecrets.openaiApiKey || "").trim();
  if (!apiKey) {
    throw new Error("Set an OpenAI API key in Settings or OPENAI_API_KEY in .env to enable the AI RPC advisor.");
  }
  if (integrationHealthStatus("openaiApiKey") === "error") {
    throw new Error("The current OpenAI API key failed validation. Replace it in Settings before using the AI RPC advisor.");
  }

  const model = String(process.env.OPENAI_RPC_ADVISOR_MODEL || "gpt-5-mini-2025-08-07").trim();
  const context = buildRpcAdvisorContext(focusChainKey);
  const systemPrompt = [
    "You are an elite NFT minting RPC strategist.",
    "Your job is to audit an RPC mesh for low-latency NFT minting and recommend concrete improvements.",
    "Prioritize multi-RPC broadcast depth, websocket coverage for event/mempool arming, private relay fallback posture, and weak chains that need more healthy endpoints.",
    "Use only the provided mesh snapshot.",
    "Reply in concise markdown with these sections: Overall Posture, Priority Actions, Chain Notes, and Risk Warnings."
  ].join(" ");

  const userPrompt = [
    `Operator request: ${String(operatorPrompt || "").trim() || "Review the mesh and recommend the best RPC posture for fast NFT minting."}`,
    "",
    "Mesh snapshot:",
    JSON.stringify(context, null, 2)
  ].join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }]
          }
        ],
        text: {
          format: {
            type: "text"
          }
        },
        max_output_tokens: 900
      }),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error?.message || payload?.error || `OpenAI request failed with status ${response.status}`
      );
    }

    const advice = extractOpenAiResponseText(payload);
    if (!advice) {
      throw new Error("OpenAI returned an empty advisor response.");
    }

    return {
      model: payload.model || model,
      generatedAt: new Date().toISOString(),
      advice
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("OpenAI advisor timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function assistantConversationKey(user) {
  return String(user?.sessionId || user?.id || "local");
}

function buildAssistantStateSnapshot() {
  const settings = buildPublicSettings();
  const telemetry = buildTelemetry();
  const chains = getAvailableChains();
  const defaultWallet = selectAssistantDefaultWallet();
  const defaultRpcByChain = new Map(
    chains.map((chain) => [chain.key, selectAssistantDefaultRpcNodes(chain.key)[0] || null])
  );

  return {
    generatedAt: new Date().toISOString(),
    settings: {
      explorerApiKeyConfigured: Boolean(settings.explorerApiKeyConfigured),
      explorerApiKeySource: settings.explorerApiKeySource || "",
      explorerApiKeyHealthStatus: settings.explorerApiKeyHealthStatus || "missing",
      openaiApiKeyConfigured: Boolean(settings.openaiApiKeyConfigured),
      openaiApiKeySource: settings.openaiApiKeySource || "",
      openaiApiKeyHealthStatus: settings.openaiApiKeyHealthStatus || "missing",
      alchemyApiKeyConfigured: Boolean(settings.alchemyApiKeyConfigured),
      alchemyApiKeySource: settings.alchemyApiKeySource || "",
      alchemyApiKeyHealthStatus: settings.alchemyApiKeyHealthStatus || "missing",
      drpcApiKeyConfigured: Boolean(settings.drpcApiKeyConfigured),
      drpcApiKeySource: settings.drpcApiKeySource || "",
      drpcApiKeyHealthStatus: settings.drpcApiKeyHealthStatus || "missing",
      openseaApiKeyConfigured: Boolean(settings.openseaApiKeyConfigured),
      openseaApiKeySource: settings.openseaApiKeySource || "",
      openseaApiKeyHealthStatus: settings.openseaApiKeyHealthStatus || "missing",
      queueMode: queueModeEnabled() ? "redis" : "local",
      operatorAssistantModel
    },
    defaults: {
      walletId: defaultWallet?.id || null,
      walletLabel: defaultWallet ? assistantWalletLabel(defaultWallet) : null,
      rpcByChain: chains.map((chain) => {
        const defaultRpc = defaultRpcByChain.get(chain.key) || null;
        return {
          chainKey: chain.key,
          chainLabel: chain.label,
          rpcId: defaultRpc?.id || null,
          rpcName: defaultRpc?.name || null,
          latencyMs: Number.isFinite(Number(defaultRpc?.lastHealth?.latencyMs))
            ? Number(defaultRpc.lastHealth.latencyMs)
            : null
        };
      })
    },
    chains: chains.map((chain) => ({
      key: chain.key,
      label: chain.label,
      chainId: chain.chainId,
      defaultRpcId: defaultRpcByChain.get(chain.key)?.id || null,
      defaultRpcName: defaultRpcByChain.get(chain.key)?.name || null
    })),
    wallets: appState.wallets.map((wallet) => ({
      id: wallet.id,
      label: wallet.label,
      address: wallet.address,
      addressShort: wallet.addressShort,
      group: wallet.group,
      status: wallet.status,
      source: wallet.source,
      defaultCandidate: wallet.id === defaultWallet?.id
    })),
    rpcNodes: appState.rpcNodes.map((node) => ({
      id: node.id,
      name: node.name,
      chainKey: node.chainKey,
      chainLabel: chainLabel(node.chainKey),
      enabled: node.enabled !== false,
      source: node.source,
      transport: /^wss?:\/\//i.test(String(node.url || "")) ? "websocket" : "http",
      url: node.url,
      health: node.lastHealth?.status || "unknown",
      latencyMs: node.lastHealth?.latencyMs || null,
      checkedAt: node.lastHealth?.checkedAt || null,
      defaultCandidate: node.id === defaultRpcByChain.get(node.chainKey)?.id
    })),
    tasks: appState.tasks.map((task) => {
      const response = buildTaskResponse(task);
      const readiness = taskReadiness(task);
      return {
        id: response.id,
        name: response.name,
        status: response.status,
        priority: response.priority,
        health: readiness.health,
        issues: readiness.issues.slice(0, 4),
        chainKey: response.chainKey,
        chainLabel: chainLabel(response.chainKey),
        contractAddress: response.contractAddress,
        walletIds: response.walletIds,
        rpcNodeIds: response.rpcNodeIds,
        walletCount: response.walletCount,
        rpcCount: readiness.rpcCount,
        useSchedule: Boolean(response.useSchedule),
        waitUntilIso: response.waitUntilIso || "",
        schedulePending: Boolean(response.schedulePending),
        autoArm: Boolean(response.autoArm),
        autoArmPending: Boolean(response.autoArmPending),
        executionTriggerMode: response.executionTriggerMode || "standard",
        done: Boolean(response.done),
        lastRunAt: response.lastRunAt || null,
        progress: response.progress || null
      };
    }),
    runState: {
      ...getRunState(),
      logs: undefined
    },
    alerts: telemetry.alerts.slice(0, 8),
    recentLogs: liveLogs.slice(-16).map((entry) => ({
      timestamp: entry.timestamp,
      level: entry.level,
      taskId: entry.taskId || null,
      message: entry.message
    }))
  };
}

function normalizeAssistantRef(value) {
  return String(value || "").trim().toLowerCase();
}

function assistantWalletLabel(wallet) {
  return wallet?.label || wallet?.addressShort || wallet?.address || wallet?.id || "Wallet";
}

function rankAssistantWallets(wallets = []) {
  const scoreFor = (wallet) => {
    const label = `${wallet?.label || ""} ${wallet?.group || ""}`.toLowerCase();
    let score = 0;

    if (wallet?.status === "ready") {
      score += 50;
    }

    if (wallet?.source === "env") {
      score += 30;
    }

    if (/\b(default|main|primary|operator)\b/.test(label)) {
      score += 80;
    }

    if (/\benv\b/.test(label)) {
      score += 10;
    }

    return score;
  };

  return [...wallets].sort((left, right) => {
    const scoreDelta = scoreFor(right) - scoreFor(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const updatedDelta = new Date(right?.updatedAt || 0).getTime() - new Date(left?.updatedAt || 0).getTime();
    if (updatedDelta !== 0) {
      return updatedDelta;
    }

    return assistantWalletLabel(left).localeCompare(assistantWalletLabel(right));
  });
}

function selectAssistantDefaultWallet() {
  return rankAssistantWallets(appState.wallets || [])[0] || null;
}

function isAssistantDefaultWalletRef(normalized) {
  return ["default", "default wallet", "main wallet", "primary wallet", "operator wallet"].includes(normalized);
}

function isAssistantAllWalletsRef(normalized) {
  return ["all", "all wallet", "all wallets", "every wallet", "every wallets"].includes(normalized);
}

function isAssistantEnvWalletRef(normalized) {
  return ["env", "env wallet", "env wallets", "environment wallet", "environment wallets"].includes(normalized);
}

function assistantRpcLabel(node) {
  return node?.name || truncateMiddle(node?.url || "RPC node", 20, 14);
}

function eligibleAssistantRpcNodes(chainKey) {
  return appState.rpcNodes.filter((node) => node.enabled !== false && node.chainKey === chainKey);
}

function selectAssistantDefaultRpcNodes(chainKey, options = {}) {
  const { includeMultiple = false } = options;
  const rankedNodes = rankRpcNodesByLatency(eligibleAssistantRpcNodes(chainKey));
  const healthyNodes = rankedNodes.filter((node) => node.lastHealth?.status === "healthy");
  const pool = healthyNodes.length ? healthyNodes : rankedNodes;
  const limit = includeMultiple ? Math.min(Math.max(pool.length, 1), 3) : 1;
  return pool.slice(0, limit);
}

function isAssistantDefaultRpcRef(normalized) {
  return [
    "default",
    "default rpc",
    "fastest",
    "fastest rpc",
    "best rpc",
    "low latency",
    "lowest latency",
    "lowest latency rpc"
  ].includes(normalized);
}

function isAssistantAllRpcRef(normalized) {
  return ["all", "all rpc", "all rpcs", "every rpc", "all nodes", "all rpc nodes"].includes(normalized);
}

function isAssistantHealthyRpcRef(normalized) {
  return ["healthy", "healthy rpc", "healthy rpcs", "healthy nodes"].includes(normalized);
}

function buildAssistantClaimTaskSettings(args = {}, existingTask = null) {
  return {
    claimIntegrationEnabled: Boolean(
      args.claimIntegrationEnabled ?? existingTask?.claimIntegrationEnabled ?? false
    ),
    claimProjectKey: String(args.claimProjectKey ?? existingTask?.claimProjectKey ?? "").trim(),
    walletClaimsJson: normalizeAssistantJsonString(
      args.walletClaimsJson,
      existingTask?.walletClaimsJson || ""
    ),
    claimFetchEnabled: Boolean(args.claimFetchEnabled ?? existingTask?.claimFetchEnabled ?? false),
    claimFetchUrl: String(args.claimFetchUrl ?? existingTask?.claimFetchUrl ?? "").trim(),
    claimFetchMethod:
      String(args.claimFetchMethod ?? existingTask?.claimFetchMethod ?? "GET").trim().toUpperCase() || "GET",
    claimFetchHeadersJson: normalizeAssistantJsonString(
      args.claimFetchHeadersJson,
      existingTask?.claimFetchHeadersJson || ""
    ),
    claimFetchCookiesJson: normalizeAssistantJsonString(
      args.claimFetchCookiesJson,
      existingTask?.claimFetchCookiesJson || ""
    ),
    claimFetchBodyJson: normalizeAssistantJsonString(
      args.claimFetchBodyJson,
      existingTask?.claimFetchBodyJson || ""
    ),
    claimResponseMappingJson: normalizeAssistantJsonString(
      args.claimResponseMappingJson,
      existingTask?.claimResponseMappingJson || ""
    ),
    claimResponseRoot: String(args.claimResponseRoot ?? existingTask?.claimResponseRoot ?? "").trim()
  };
}

function buildAssistantTaskSummary(taskLike) {
  const task = taskLike?.id ? getTaskById(taskLike.id) || taskLike : taskLike;
  if (!task) {
    return {};
  }

  const selectedWallets = appState.wallets.filter((wallet) => (task.walletIds || []).includes(wallet.id));
  const selectedRpcNodes = appState.rpcNodes.filter((node) => (task.rpcNodeIds || []).includes(node.id));
  const defaultWallet = selectAssistantDefaultWallet();
  const defaultRpc = selectAssistantDefaultRpcNodes(task.chainKey)[0] || null;
  const sourceContext = resolveMintSourceContext(task.sourceType || defaultMintSourceType, {
    sourceTarget: task.sourceTarget,
    sourceStage: task.sourceStage
  });

  return {
    taskId: task.id || null,
    taskName: task.name || null,
    chainKey: task.chainKey || null,
    chainLabel: chainLabel(task.chainKey),
    sourceType: task.sourceType || defaultMintSourceType,
    sourceLabel: getMintSourceDefinition(task.sourceType || defaultMintSourceType).label,
    sourceTarget: task.sourceTarget || "",
    sourceStage: task.sourceStage || defaultMintSourceStage,
    sourceSummary: sourceContext.summary,
    sourceDisplayTarget: sourceContext.displayTarget,
    sourceProjectSlug: sourceContext.projectSlug,
    walletLabels: selectedWallets.map((wallet) => assistantWalletLabel(wallet)),
    rpcNames: selectedRpcNodes.map((node) => assistantRpcLabel(node)),
    usedDefaultWallet:
      Boolean(defaultWallet) &&
      Array.isArray(task.walletIds) &&
      task.walletIds.length === 1 &&
      task.walletIds[0] === defaultWallet.id,
    usedDefaultRpc:
      Boolean(defaultRpc) &&
      Array.isArray(task.rpcNodeIds) &&
      task.rpcNodeIds.includes(defaultRpc.id),
    useSchedule: Boolean(task.useSchedule),
    waitUntilIso: task.waitUntilIso || "",
    schedulePending: Boolean(task.schedulePending),
    autoArmPending: Boolean(task.autoArmPending)
  };
}

function resolveAssistantChainKey(requestedChain = "") {
  const chains = getAvailableChains();
  const normalized = normalizeAssistantRef(requestedChain);
  if (!normalized) {
    if (chains.length === 1) {
      return chains[0].key;
    }

    throw new Error(
      chains.length
        ? `Choose a chain before scheduling. Available chains: ${chains.map((chain) => chain.label).join(", ")}.`
        : "No chains are currently available. Add at least one RPC node first."
    );
  }

  const exact =
    chains.find((chain) => normalizeAssistantRef(chain.key) === normalized) ||
    chains.find((chain) => normalizeAssistantRef(chain.label) === normalized) ||
    chains.find((chain) => String(chain.chainId) === normalized);

  if (exact) {
    return exact.key;
  }

  throw new Error(
    `Chain "${requestedChain}" was not recognized. Available chains: ${chains.map((chain) => chain.label).join(", ")}.`
  );
}

function resolveAssistantWalletIds(walletRefs = []) {
  const refs = Array.isArray(walletRefs)
    ? walletRefs.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  if (refs.length === 0) {
    if (appState.wallets.length === 0) {
      throw new Error("No wallets are loaded. Import a wallet before asking me to mint.");
    }

    return [selectAssistantDefaultWallet().id];
  }

  const resolvedIds = refs.flatMap((ref) => {
    const normalized = normalizeAssistantRef(ref);

    if (isAssistantAllWalletsRef(normalized)) {
      return appState.wallets.map((wallet) => wallet.id);
    }

    if (isAssistantDefaultWalletRef(normalized)) {
      return selectAssistantDefaultWallet()?.id || [];
    }

    if (isAssistantEnvWalletRef(normalized)) {
      const envWallets = rankAssistantWallets(appState.wallets.filter((wallet) => wallet.source === "env"));
      if (envWallets.length === 0) {
        throw new Error("No environment-backed wallets are loaded.");
      }
      return envWallets.map((wallet) => wallet.id);
    }

    const matches = appState.wallets.filter((wallet) => {
      return [wallet.id, wallet.label, wallet.address, wallet.addressShort]
        .filter(Boolean)
        .some((candidate) => normalizeAssistantRef(candidate) === normalized);
    });

    if (matches.length === 1) {
      return matches[0].id;
    }

    const partialMatches = appState.wallets.filter((wallet) => {
      return [wallet.id, wallet.label, wallet.address, wallet.addressShort]
        .filter(Boolean)
        .some((candidate) => normalizeAssistantRef(candidate).includes(normalized));
    });

    if (partialMatches.length === 1) {
      return partialMatches[0].id;
    }

    if (partialMatches.length > 1) {
      throw new Error(`Wallet reference "${ref}" is ambiguous. Use one of: ${partialMatches.map((wallet) => wallet.label || wallet.addressShort || wallet.address).join(", ")}.`);
    }

    throw new Error(`Wallet "${ref}" was not found.`);
  });

  const uniqueIds = [...new Set(resolvedIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("No matching wallet was found.");
  }

  return uniqueIds;
}

function resolveAssistantRpcNodeIds(chainKey, rpcRefs = [], options = {}) {
  const { includeMultiple = false } = options;
  const refs = Array.isArray(rpcRefs)
    ? rpcRefs.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  const eligibleNodes = eligibleAssistantRpcNodes(chainKey);

  if (refs.length === 0) {
    const defaults = selectAssistantDefaultRpcNodes(chainKey, { includeMultiple });
    if (defaults.length === 0) {
      throw new Error(`No enabled RPC nodes are configured for ${chainLabel(chainKey)}.`);
    }
    return defaults.map((node) => node.id);
  }

  const resolvedIds = refs.flatMap((ref) => {
    const normalized = normalizeAssistantRef(ref);

    if (isAssistantAllRpcRef(normalized)) {
      return eligibleNodes.map((node) => node.id);
    }

    if (isAssistantHealthyRpcRef(normalized)) {
      const healthyNodes = rankRpcNodesByLatency(
        eligibleNodes.filter((node) => node.lastHealth?.status === "healthy")
      );
      if (healthyNodes.length > 0) {
        return healthyNodes.map((node) => node.id);
      }

      const fallbackNodes = selectAssistantDefaultRpcNodes(chainKey, { includeMultiple });
      return fallbackNodes.map((node) => node.id);
    }

    if (isAssistantDefaultRpcRef(normalized)) {
      const defaults = selectAssistantDefaultRpcNodes(chainKey, { includeMultiple });
      if (defaults.length === 0) {
        throw new Error(`No enabled RPC nodes are configured for ${chainLabel(chainKey)}.`);
      }
      return defaults.map((node) => node.id);
    }

    const exact = eligibleNodes.filter((node) => {
      return [node.id, node.name, node.url]
        .filter(Boolean)
        .some((candidate) => normalizeAssistantRef(candidate) === normalized);
    });

    if (exact.length === 1) {
      return exact[0].id;
    }

    const partial = eligibleNodes.filter((node) => {
      return [node.id, node.name, node.url]
        .filter(Boolean)
        .some((candidate) => normalizeAssistantRef(candidate).includes(normalized));
    });

    if (partial.length === 1) {
      return partial[0].id;
    }

    if (partial.length > 1) {
      throw new Error(`RPC reference "${ref}" is ambiguous on ${chainLabel(chainKey)}.`);
    }

    throw new Error(`RPC "${ref}" was not found on ${chainLabel(chainKey)}.`);
  });

  const uniqueIds = [...new Set(resolvedIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error(`No matching RPC nodes were found on ${chainLabel(chainKey)}.`);
  }

  return uniqueIds;
}

function resolveAssistantTask(taskRef) {
  const ref = String(taskRef || "").trim();
  if (!ref) {
    throw new Error("Task reference is required.");
  }

  const normalized = normalizeAssistantRef(ref);
  const exact =
    appState.tasks.find((task) => normalizeAssistantRef(task.id) === normalized) ||
    appState.tasks.find((task) => normalizeAssistantRef(task.name) === normalized);
  if (exact) {
    return exact;
  }

  const partial = appState.tasks.filter((task) => normalizeAssistantRef(task.name).includes(normalized));
  if (partial.length === 1) {
    return partial[0];
  }

  if (partial.length > 1) {
    throw new Error(`Task reference "${ref}" is ambiguous. Matching tasks: ${partial.map((task) => task.name).join(", ")}.`);
  }

  throw new Error(`Task "${ref}" was not found.`);
}

const assistantApiKeyDefinitions = {
  explorerApiKey: {
    label: "Explorer API key",
    aliases: ["explorer", "explorer api", "etherscan", "etherscan api", "abi key"]
  },
  openaiApiKey: {
    label: "OpenAI API key",
    aliases: ["openai", "openai api", "operator ai key", "assistant key", "ai key"]
  },
  alchemyApiKey: {
    label: "Alchemy API key",
    aliases: ["alchemy", "alchemy api", "alchemy key"]
  },
  drpcApiKey: {
    label: "dRPC API key",
    aliases: ["drpc", "drpc api", "drpc key", "d rpc", "d rpc api"]
  },
  openseaApiKey: {
    label: "OpenSea API key",
    aliases: ["opensea", "opensea api", "opensea key", "open sea", "open sea api"]
  }
};

function resolveAssistantOptionalChainKey(requestedChain = "") {
  const normalized = normalizeAssistantRef(requestedChain);
  if (!normalized) {
    return "";
  }

  const chains = getAvailableChains();
  const exact =
    chains.find((chain) => normalizeAssistantRef(chain.key) === normalized) ||
    chains.find((chain) => normalizeAssistantRef(chain.label) === normalized) ||
    chains.find((chain) => String(chain.chainId) === normalized);

  if (exact) {
    return exact.key;
  }

  throw new Error(
    `Chain "${requestedChain}" was not recognized. Available chains: ${chains.map((chain) => chain.label).join(", ")}.`
  );
}

function assistantRpcSearchCandidates(node) {
  const chainName = node?.chainLabel || chainLabel(node?.chainKey);
  return [
    node?.id,
    node?.name,
    node?.url,
    chainName,
    `${node?.name || ""} ${chainName || ""}`.trim(),
    `${chainName || ""} ${node?.name || ""}`.trim()
  ].filter(Boolean);
}

function resolveAssistantRpcNode(rpcRef, options = {}) {
  const { chainKey = "", includeEnv = true, failedOnly = false } = options;
  const ref = String(rpcRef || "").trim();
  const scopedNodes = appState.rpcNodes.filter(
    (node) =>
      (!chainKey || node.chainKey === chainKey) &&
      (includeEnv || node.source !== "env") &&
      (!failedOnly || node.lastHealth?.status === "error")
  );

  if (!ref) {
    if (scopedNodes.length === 1) {
      return scopedNodes[0];
    }

    if (failedOnly) {
      throw new Error(
        scopedNodes.length
          ? `More than one failed RPC is available${chainKey ? ` on ${chainLabel(chainKey)}` : ""}. Name the RPC you want repaired.`
          : `No failed RPCs are currently detected${chainKey ? ` on ${chainLabel(chainKey)}` : ""}.`
      );
    }

    throw new Error(`RPC reference is required${chainKey ? ` on ${chainLabel(chainKey)}` : ""}.`);
  }

  const normalized = normalizeAssistantRef(ref);
  const exact = scopedNodes.filter((node) =>
    assistantRpcSearchCandidates(node).some((candidate) => normalizeAssistantRef(candidate) === normalized)
  );
  if (exact.length === 1) {
    return exact[0];
  }

  if (exact.length > 1) {
    throw new Error(`RPC reference "${ref}" is ambiguous${chainKey ? ` on ${chainLabel(chainKey)}` : ""}.`);
  }

  const partial = scopedNodes.filter((node) =>
    assistantRpcSearchCandidates(node).some((candidate) => normalizeAssistantRef(candidate).includes(normalized))
  );
  if (partial.length === 1) {
    return partial[0];
  }

  if (partial.length > 1) {
    throw new Error(`RPC reference "${ref}" is ambiguous${chainKey ? ` on ${chainLabel(chainKey)}` : ""}.`);
  }

  throw new Error(`RPC "${ref}" was not found${chainKey ? ` on ${chainLabel(chainKey)}` : ""}.`);
}

function resolveAssistantApiKeySecretName(secretRef) {
  const ref = String(secretRef || "").trim();
  if (!ref) {
    throw new Error("API key reference is required.");
  }

  const normalized = normalizeAssistantRef(ref);
  const exactMatches = Object.entries(assistantApiKeyDefinitions).filter(([secretName, definition]) =>
    [secretName, definition.label, ...(definition.aliases || [])]
      .filter(Boolean)
      .some((candidate) => normalizeAssistantRef(candidate) === normalized)
  );

  if (exactMatches.length === 1) {
    return exactMatches[0][0];
  }

  if (exactMatches.length > 1) {
    throw new Error(`API key reference "${ref}" is ambiguous.`);
  }

  const partialMatches = Object.entries(assistantApiKeyDefinitions).filter(([secretName, definition]) =>
    [secretName, definition.label, ...(definition.aliases || [])]
      .filter(Boolean)
      .some((candidate) => normalizeAssistantRef(candidate).includes(normalized))
  );

  if (partialMatches.length === 1) {
    return partialMatches[0][0];
  }

  if (partialMatches.length > 1) {
    throw new Error(`API key reference "${ref}" is ambiguous.`);
  }

  throw new Error(`API key "${ref}" was not recognized.`);
}

function normalizeAssistantJsonString(value, fallback = "") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return JSON.stringify(value);
}

async function buildAssistantTaskPayload(args = {}) {
  const existingTask = args.taskRef ? resolveAssistantTask(args.taskRef) : null;
  const chainKey = resolveAssistantChainKey(args.chainKey || existingTask?.chainKey || "");
  const sourceSelection = normalizeMintSourceSelection({
    sourceType: args.sourceType ?? existingTask?.sourceType ?? defaultMintSourceType,
    sourceTarget: args.sourceTarget ?? existingTask?.sourceTarget ?? "",
    sourceStage: args.sourceStage ?? existingTask?.sourceStage ?? defaultMintSourceStage,
    sourceConfig: args.sourceConfigJson ?? existingTask?.sourceConfigJson ?? ""
  });
  const quantityPerWallet = Math.max(
    1,
    Number(args.quantityPerWallet ?? existingTask?.quantityPerWallet ?? 1)
  );
  const multiRpcBroadcast = Boolean(args.multiRpcBroadcast ?? existingTask?.multiRpcBroadcast ?? false);
  const walletIds = resolveAssistantWalletIds(
    Array.isArray(args.walletRefs) && args.walletRefs.length > 0 ? args.walletRefs : existingTask?.walletIds || []
  );
  const rpcNodeIds = resolveAssistantRpcNodeIds(
    chainKey,
    Array.isArray(args.rpcRefs) && args.rpcRefs.length > 0 ? args.rpcRefs : existingTask?.rpcNodeIds || [],
    { includeMultiple: multiRpcBroadcast }
  );
  const claimTaskSettings = buildAssistantClaimTaskSettings(args, existingTask);
  let priceEth = String(args.priceEth ?? existingTask?.priceEth ?? "").trim();
  const abiJson = normalizeAssistantJsonString(args.abiJson, existingTask?.abiJson || "");
  let platform =
    String(args.platform || existingTask?.platform || "AI Operator").trim() || "AI Operator";
  let mintFunction = String(args.mintFunction ?? existingTask?.mintFunction ?? "").trim();
  let mintArgs = normalizeAssistantJsonString(args.mintArgs, existingTask?.mintArgs || "");
  let mintStartDetectionEnabled = Boolean(
    args.mintStartDetectionEnabled ?? existingTask?.mintStartDetectionEnabled ?? false
  );
  let mintStartDetectionConfig =
    args.mintStartDetectionConfig && typeof args.mintStartDetectionConfig === "object"
      ? args.mintStartDetectionConfig
      : existingTask?.mintStartDetectionConfig && typeof existingTask.mintStartDetectionConfig === "object"
        ? existingTask.mintStartDetectionConfig
        : null;

  if (abiJson) {
    try {
      const abiEntries = parseTaskAbiEntries(abiJson);
      const autofill = await buildMintAutofill({
        chainKey,
        contractAddress: String(args.contractAddress || existingTask?.contractAddress || "").trim(),
        abiEntries,
        requestedFunction: mintFunction,
        walletIds,
        rpcNodeIds,
        quantityPerWallet,
        claimTaskSettings
      });

      if (!mintFunction && autofill.mintFunction) {
        mintFunction = autofill.mintFunction;
      }

      if (!mintArgs && Array.isArray(autofill.mintArgs)) {
        mintArgs = JSON.stringify(autofill.mintArgs);
      }

      if (!priceEth && autofill.priceEth) {
        priceEth = autofill.priceEth;
      }

      if (
        (!platform || platform === "AI Operator" || platform === "Generic EVM (auto-detect)") &&
        autofill.platform
      ) {
        platform = autofill.platform;
      }

      if (autofill.mintStartDetection && typeof autofill.mintStartDetection === "object") {
        mintStartDetectionEnabled = true;
        mintStartDetectionConfig = autofill.mintStartDetection;
      }
    } catch {
      // Let the normal task validation return the authoritative error later if needed.
    }
  }

  validateMintSourceSelection(sourceSelection.sourceType, sourceSelection);

  return {
    id: existingTask?.id,
    name: String(args.name || existingTask?.name || "").trim() || `AI Mint ${String(args.contractAddress || existingTask?.contractAddress || "").slice(0, 10)}`,
    priority: String(args.priority || existingTask?.priority || "standard").trim() || "standard",
    notes: String(args.notes || existingTask?.notes || "").trim(),
    tags: Array.isArray(args.tags) ? args.tags : existingTask?.tags || [],
    contractAddress: String(args.contractAddress || existingTask?.contractAddress || "").trim(),
    chainKey,
    sourceType: sourceSelection.sourceType,
    sourceTarget: sourceSelection.sourceTarget,
    sourceStage: sourceSelection.sourceStage,
    sourceConfigJson: sourceSelection.sourceConfigJson,
    quantityPerWallet,
    priceEth,
    abiJson,
    platform,
    walletIds,
    rpcNodeIds,
    mintFunction,
    mintArgs,
    ...claimTaskSettings,
    autoGeneratePhaseTasks: Boolean(args.autoGeneratePhaseTasks),
    autoArm: Boolean(args.autoArm ?? existingTask?.autoArm ?? true),
    gasStrategy: String(args.gasStrategy || existingTask?.gasStrategy || "normal").trim() || "normal",
    gasLimit: String(args.gasLimit ?? existingTask?.gasLimit ?? "").trim(),
    maxFeeGwei: String(args.maxFeeGwei ?? existingTask?.maxFeeGwei ?? "").trim(),
    maxPriorityFeeGwei: String(args.maxPriorityFeeGwei ?? existingTask?.maxPriorityFeeGwei ?? "").trim(),
    simulateTransaction: Boolean(args.simulateTransaction ?? existingTask?.simulateTransaction ?? true),
    dryRun: Boolean(args.dryRun ?? existingTask?.dryRun ?? false),
    warmupRpc: Boolean(args.warmupRpc ?? existingTask?.warmupRpc ?? true),
    multiRpcBroadcast,
    walletMode: String(args.walletMode || existingTask?.walletMode || "parallel").trim() || "parallel",
    useSchedule: Boolean(args.useSchedule ?? existingTask?.useSchedule ?? false),
    waitUntilIso: String(args.waitUntilIso ?? existingTask?.waitUntilIso ?? "").trim(),
    mintStartDetectionEnabled,
    mintStartDetectionConfig,
    pollIntervalMs: String(args.pollIntervalMs ?? existingTask?.pollIntervalMs ?? "1000").trim() || "1000",
    txTimeoutMs: String(args.txTimeoutMs ?? existingTask?.txTimeoutMs ?? "").trim(),
    maxRetries: String(args.maxRetries ?? existingTask?.maxRetries ?? "1").trim() || "1",
    retryDelayMs: String(args.retryDelayMs ?? existingTask?.retryDelayMs ?? "1000").trim() || "1000",
    retryWindowMs: String(args.retryWindowMs ?? existingTask?.retryWindowMs ?? "1800000").trim() || "1800000",
    startJitterMs: String(args.startJitterMs ?? existingTask?.startJitterMs ?? "0").trim() || "0",
    smartGasReplacement: Boolean(args.smartGasReplacement ?? existingTask?.smartGasReplacement ?? false),
    replacementBumpPercent: String(
      args.replacementBumpPercent ?? existingTask?.replacementBumpPercent ?? "12"
    ).trim() || "12",
    replacementMaxAttempts: String(
      args.replacementMaxAttempts ?? existingTask?.replacementMaxAttempts ?? "2"
    ).trim() || "2",
    executionTriggerMode:
      String(args.executionTriggerMode || existingTask?.executionTriggerMode || "standard").trim() || "standard",
    triggerContractAddress: String(
      args.triggerContractAddress ?? existingTask?.triggerContractAddress ?? ""
    ).trim(),
    triggerEventSignature: String(
      args.triggerEventSignature ?? existingTask?.triggerEventSignature ?? ""
    ).trim(),
    triggerEventCondition: normalizeAssistantJsonString(
      args.triggerEventCondition,
      existingTask?.triggerEventCondition || ""
    ),
    triggerMempoolSignature: String(
      args.triggerMempoolSignature ?? existingTask?.triggerMempoolSignature ?? ""
    ).trim(),
    triggerBlockNumber: String(args.triggerBlockNumber ?? existingTask?.triggerBlockNumber ?? "").trim(),
    triggerTimeoutMs: String(args.triggerTimeoutMs ?? existingTask?.triggerTimeoutMs ?? "").trim(),
    privateRelayEnabled: Boolean(args.privateRelayEnabled ?? existingTask?.privateRelayEnabled ?? false),
    privateRelayUrl: String(args.privateRelayUrl ?? existingTask?.privateRelayUrl ?? "").trim(),
    privateRelayMethod:
      String(args.privateRelayMethod || existingTask?.privateRelayMethod || "eth_sendRawTransaction").trim() ||
      "eth_sendRawTransaction",
    privateRelayHeadersJson: normalizeAssistantJsonString(
      args.privateRelayHeadersJson,
      existingTask?.privateRelayHeadersJson || ""
    ),
    privateRelayOnly: Boolean(args.privateRelayOnly ?? existingTask?.privateRelayOnly ?? false)
  };
}

function buildAssistantToolDefinitions() {
  return [
    {
      type: "function",
      name: "get_dashboard_state",
      description: "Read the live dashboard state including task status, API key status, RPC health, alerts, recommended defaults, and recent logs.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "save_task",
      description: "Create or update a mint task. Use this when the user wants a task drafted, scheduled, auto-armed, or prepared to mint. When ABI is provided, the app can auto-detect mint function, args, platform, and launch-watch settings.",
      parameters: {
        type: "object",
        properties: {
          taskRef: { type: "string", description: "Existing task id or name to update. Leave empty to create a new task." },
          name: { type: "string" },
          contractAddress: { type: "string" },
          chainKey: { type: "string", description: "Chain key like ethereum, base, base_sepolia, arbitrum, etc." },
          sourceType: { type: "string", enum: ["generic_contract", "opensea", "magiceden", "custom_launchpad"] },
          sourceTarget: { type: "string", description: "Marketplace drop URL, slug, or launch identifier when using a source adapter." },
          sourceStage: { type: "string", enum: ["auto", "public", "allowlist", "gtd", "custom"] },
          sourceConfigJson: { type: "string", description: "Optional JSON string for source-specific adapter config." },
          abiJson: { type: "string", description: "Full contract ABI JSON string." },
          quantityPerWallet: { type: "integer", minimum: 1 },
          priceEth: { type: "string" },
          mintFunction: { type: "string" },
          mintArgs: { type: "string", description: "JSON string for mint args." },
          walletRefs: { type: "array", items: { type: "string" } },
          rpcRefs: { type: "array", items: { type: "string" } },
          priority: { type: "string", enum: ["standard", "high", "critical"] },
          notes: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          autoGeneratePhaseTasks: { type: "boolean" },
          autoArm: { type: "boolean" },
          useSchedule: { type: "boolean" },
          waitUntilIso: { type: "string", description: "Scheduled time in ISO-8601 format." },
          multiRpcBroadcast: { type: "boolean" },
          warmupRpc: { type: "boolean" },
          walletMode: { type: "string", enum: ["parallel", "sequential"] },
          gasStrategy: { type: "string", enum: ["normal", "aggressive", "custom"] },
          simulateTransaction: { type: "boolean" },
          dryRun: { type: "boolean" },
          pollIntervalMs: { type: "integer" },
          txTimeoutMs: { type: "integer" },
          maxRetries: { type: "integer" },
          retryDelayMs: { type: "integer" },
          retryWindowMs: { type: "integer" },
          startJitterMs: { type: "integer" },
          smartGasReplacement: { type: "boolean" },
          replacementBumpPercent: { type: "integer" },
          replacementMaxAttempts: { type: "integer" },
          executionTriggerMode: { type: "string", enum: ["standard", "event", "mempool", "block"] },
          triggerContractAddress: { type: "string" },
          triggerEventSignature: { type: "string" },
          triggerEventCondition: { type: "string" },
          triggerMempoolSignature: { type: "string" },
          triggerBlockNumber: { type: "integer" },
          triggerTimeoutMs: { type: "integer" },
          privateRelayEnabled: { type: "boolean" },
          privateRelayUrl: { type: "string" },
          privateRelayMethod: { type: "string", enum: ["eth_sendRawTransaction", "eth_sendPrivateTransaction"] },
          privateRelayHeadersJson: { type: "string" },
          privateRelayOnly: { type: "boolean" }
        },
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "run_task",
      description: "Run or queue an existing task immediately.",
      parameters: {
        type: "object",
        properties: {
          taskRef: { type: "string", description: "Task id or task name." }
        },
        required: ["taskRef"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "stop_task",
      description: "Request stop for a currently running or queued task.",
      parameters: {
        type: "object",
        properties: {
          taskRef: { type: "string", description: "Task id or task name." }
        },
        required: ["taskRef"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "delete_task",
      description: "Delete a task by id or name.",
      parameters: {
        type: "object",
        properties: {
          taskRef: { type: "string", description: "Task id or task name." }
        },
        required: ["taskRef"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "delete_api_key",
      description: "Delete a saved dashboard API key such as Explorer, OpenAI, Alchemy, dRPC, or OpenSea. Use only when the user clearly asks to delete the key.",
      parameters: {
        type: "object",
        properties: {
          keyRef: { type: "string", description: "API key name like OpenAI, Explorer, Alchemy, dRPC, or OpenSea." }
        },
        required: ["keyRef"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "add_rpc_node",
      description: "Add a new RPC node from a raw URL. The app will inspect the endpoint, detect the chain, and save the node.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full RPC URL such as https://... or wss://..." },
          name: { type: "string", description: "Optional display name for the RPC node." },
          group: { type: "string", description: "Optional group label like Custom, Assistant, Backup, or Primary." },
          enabled: { type: "boolean" }
        },
        required: ["url"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "remove_rpc_node",
      description: "Remove a stored RPC node by name, id, or URL. Use only when the user clearly asks to remove or delete the RPC.",
      parameters: {
        type: "object",
        properties: {
          rpcRef: { type: "string", description: "RPC name, id, or URL." },
          chainKey: { type: "string", description: "Optional chain key to disambiguate similarly named RPCs." }
        },
        required: ["rpcRef"],
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "test_rpc_node",
      description: "Run a live RPC health test. If rpcRef is omitted, pulse the full RPC mesh.",
      parameters: {
        type: "object",
        properties: {
          rpcRef: { type: "string", description: "Optional RPC name, id, or URL." },
          chainKey: { type: "string", description: "Optional chain key to disambiguate similarly named RPCs." }
        },
        additionalProperties: false
      }
    },
    {
      type: "function",
      name: "fix_failed_rpc",
      description: "Repair a failed stored RPC by re-inspecting its URL and re-adding the endpoint cleanly. If rpcRef is omitted, repair all currently failed stored RPCs.",
      parameters: {
        type: "object",
        properties: {
          rpcRef: { type: "string", description: "Optional RPC name, id, or URL. Leave empty to repair all currently failed stored RPCs." },
          chainKey: { type: "string", description: "Optional chain key to narrow the repair scope." }
        },
        additionalProperties: false
      }
    }
  ];
}

function extractResponseFunctionCalls(payload = {}) {
  return Array.isArray(payload.output)
    ? payload.output
        .filter((item) => item?.type === "function_call" && item?.name)
        .map((item) => ({
          name: item.name,
          arguments: item.arguments || "{}",
          callId: item.call_id || item.id
        }))
    : [];
}

async function createOpenAiResponse({
  apiKey,
  instructions,
  input,
  tools = [],
  previousResponseId = "",
  model = operatorAssistantModel
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        instructions,
        previous_response_id: previousResponseId || undefined,
        input,
        tools,
        text: {
          format: {
            type: "text"
          }
        },
        max_output_tokens: 1400
      }),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error?.message || payload?.error || `OpenAI request failed with status ${response.status}`
      );
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("AI operator timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function executeAssistantToolCall(call) {
  let parsedArgs = {};
  try {
    parsedArgs = JSON.parse(call.arguments || "{}");
  } catch (error) {
    return {
      ok: false,
      changedState: false,
      action: `Tool ${call.name} failed`,
      error: `Tool arguments were invalid JSON: ${formatError(error)}`
    };
  }

  try {
    if (call.name === "get_dashboard_state") {
      return {
        ok: true,
        changedState: false,
        action: "Read dashboard state",
        snapshot: buildAssistantStateSnapshot()
      };
    }

    if (call.name === "save_task") {
      const result = await saveTaskPayload(await buildAssistantTaskPayload(parsedArgs));
      const savedTask =
        (result.task?.id && getTaskById(result.task.id)) ||
        (Array.isArray(result.tasks) && result.tasks[0]?.id ? getTaskById(result.tasks[0].id) : null) ||
        result.task ||
        result.tasks?.[0] ||
        null;
      return {
        ok: true,
        changedState: true,
        navigateTo: "tasks",
        focusTaskId: savedTask?.id || null,
        action: result.autoGeneratedPhaseTasks
          ? `Created ${result.tasks?.length || 0} phase task(s)`
          : `Saved task ${result.task?.name || ""}`.trim(),
        result: {
          ...result,
          ...buildAssistantTaskSummary(savedTask)
        }
      };
    }

    if (call.name === "run_task") {
      const task = resolveAssistantTask(parsedArgs.taskRef);
      const result = await requestTaskRun(task.id);
      return {
        ok: true,
        changedState: true,
        navigateTo: "tasks",
        focusTaskId: task.id,
        action: `Run requested for ${task.name}`,
        result: {
          taskId: task.id,
          taskName: task.name,
          ...result
        }
      };
    }

    if (call.name === "stop_task") {
      const task = resolveAssistantTask(parsedArgs.taskRef);
      const result = await requestTaskStop(task.id);
      return {
        ok: true,
        changedState: true,
        navigateTo: "tasks",
        focusTaskId: task.id,
        action: `Stop requested for ${task.name}`,
        result: {
          taskId: task.id,
          taskName: task.name,
          ...result
        }
      };
    }

    if (call.name === "delete_task") {
      const task = resolveAssistantTask(parsedArgs.taskRef);
      const result = await deleteTaskById(task.id);
      return {
        ok: true,
        changedState: true,
        navigateTo: "tasks",
        action: `Deleted task ${task.name}`,
        result: {
          taskId: task.id,
          taskName: task.name,
          ...result
        }
      };
    }

    if (call.name === "delete_api_key") {
      const secretName = resolveAssistantApiKeySecretName(parsedArgs.keyRef);
      const result = await deleteSavedApiKey(secretName);
      return {
        ok: true,
        changedState: true,
        navigateTo: "settings",
        action:
          result.sourceAfter === "env"
            ? `Deleted saved ${result.label}; environment fallback is now active`
            : `Deleted ${result.label}`,
        result
      };
    }

    if (call.name === "add_rpc_node") {
      const result = await saveRpcNodePayload({
        url: parsedArgs.url,
        name: parsedArgs.name,
        group: parsedArgs.group || "Assistant",
        enabled: parsedArgs.enabled
      });
      return {
        ok: true,
        changedState: true,
        navigateTo: "rpc",
        action: `Added RPC ${result.rpcNode.name}`,
        result: {
          rpcId: result.rpcNode.id,
          rpcName: result.rpcNode.name,
          chainKey: result.rpcNode.chainKey,
          chainLabel: result.rpcNode.chainLabel,
          latencyMs: result.rpcNode.lastHealth?.latencyMs ?? null,
          url: result.rpcNode.url
        }
      };
    }

    if (call.name === "remove_rpc_node") {
      const chainKey = resolveAssistantOptionalChainKey(parsedArgs.chainKey || "");
      const rpcNode = resolveAssistantRpcNode(parsedArgs.rpcRef, { chainKey });
      const result = await deleteRpcNodeById(rpcNode.id);
      return {
        ok: true,
        changedState: true,
        navigateTo: "rpc",
        action: `Removed RPC ${rpcNode.name}`,
        result: {
          rpcId: rpcNode.id,
          rpcName: rpcNode.name,
          chainKey: rpcNode.chainKey,
          chainLabel: rpcNode.chainLabel || chainLabel(rpcNode.chainKey),
          ...result
        }
      };
    }

    if (call.name === "test_rpc_node") {
      const chainKey = resolveAssistantOptionalChainKey(parsedArgs.chainKey || "");
      if (!String(parsedArgs.rpcRef || "").trim()) {
        const result = await testRpcMesh();
        return {
          ok: true,
          changedState: true,
          navigateTo: "rpc",
          action: `Tested ${result.summary.total} RPC node${result.summary.total === 1 ? "" : "s"}`,
          result
        };
      }

      const rpcNode = resolveAssistantRpcNode(parsedArgs.rpcRef, { chainKey });
      const result = await testRpcNodeById(rpcNode.id);
      return {
        ok: true,
        changedState: true,
        navigateTo: "rpc",
        action:
          result.health?.status === "healthy"
            ? `Checked RPC health for ${rpcNode.name}`
            : `Detected RPC failure on ${rpcNode.name}`,
        result: {
          rpcId: rpcNode.id,
          rpcName: rpcNode.name,
          chainKey: rpcNode.chainKey,
          chainLabel: rpcNode.chainLabel || chainLabel(rpcNode.chainKey),
          health: result.health
        }
      };
    }

    if (call.name === "fix_failed_rpc") {
      const chainKey = resolveAssistantOptionalChainKey(parsedArgs.chainKey || "");
      let targetNodes = [];

      if (String(parsedArgs.rpcRef || "").trim()) {
        targetNodes = [resolveAssistantRpcNode(parsedArgs.rpcRef, { chainKey, includeEnv: false })];
      } else {
        targetNodes = appState.rpcNodes.filter(
          (node) =>
            node.source !== "env" &&
            node.lastHealth?.status === "error" &&
            (!chainKey || node.chainKey === chainKey)
        );
        if (!targetNodes.length) {
          throw new Error(`No failed stored RPCs are currently detected${chainKey ? ` on ${chainLabel(chainKey)}` : ""}.`);
        }
      }

      const repaired = [];
      for (const rpcNode of targetNodes) {
        const result = await repairStoredRpcNode(rpcNode.id);
        repaired.push({
          rpcId: result.rpcNode.id,
          rpcName: result.rpcNode.name,
          chainKey: result.rpcNode.chainKey,
          chainLabel: result.rpcNode.chainLabel || chainLabel(result.rpcNode.chainKey),
          latencyMs: result.rpcNode.lastHealth?.latencyMs ?? null,
          url: result.rpcNode.url
        });
      }

      return {
        ok: true,
        changedState: true,
        navigateTo: "rpc",
        action:
          repaired.length === 1
            ? `Rebuilt failed RPC ${repaired[0].rpcName}`
            : `Rebuilt ${repaired.length} failed RPCs`,
        result: {
          repaired
        }
      };
    }

    return {
      ok: false,
      changedState: false,
      action: `Tool ${call.name} is unavailable`,
      error: `Unknown tool: ${call.name}`
    };
  } catch (error) {
    return {
      ok: false,
      changedState: false,
      action: `Tool ${call.name} failed`,
      error: formatError(error)
    };
  }
}

async function requestOperatorAssistantReply({ message, previousResponseId = "" }) {
  const apiKey = String(integrationSecrets.openaiApiKey || "").trim();
  if (!apiKey) {
    throw new Error("Save an OpenAI API key in Settings to enable the AI operator.");
  }
  if (integrationHealthStatus("openaiApiKey") === "error") {
    throw new Error("The saved OpenAI API key failed validation. Replace it in Settings to re-enable the AI operator.");
  }

  const instructions = [
    "You are MintBot Operator, a floating in-app AI assistant with authenticated live control over the mint dashboard.",
    "You can inspect the live dashboard state and use tools to create, update, schedule, run, stop, and delete tasks, manage saved API keys, and add, remove, test, or repair RPC nodes.",
    "Use tools whenever the user asks about current app state or wants actions performed.",
    "Prefer taking the action yourself instead of giving manual dashboard instructions when the request is specific and safe.",
    "When the user gives a contract address plus ABI and asks to schedule or mint, create a real task instead of only explaining.",
    "If the user asks to delete a saved API key, remove it. If the user asks to fix a failed RPC, use the repair tool so the endpoint is re-added cleanly.",
    "Sound like a sharp human operations copilot: natural, concise, fast, and explicit about what changed.",
    "Do not invent wallets, RPC nodes, or chains. If wallet choice or chain choice is ambiguous, ask a brief clarifying question.",
    "Default behavior: if exactly one wallet exists, you may use it automatically. If multiple wallets exist and none are specified, ask which one to use.",
    "You may use all enabled RPC nodes on the chosen chain by default.",
    "For destructive actions like deleting tasks, deleting saved API keys, or removing RPC nodes, only do it when the user clearly asked.",
    "Assume the app's validation rules are authoritative. If a tool fails, explain the actual failure and what the user needs to fix."
  ].join(" ");

  const tools = buildAssistantToolDefinitions();
  const actionLog = [];
  let changedState = false;
  let navigateTo = "";
  let focusTaskId = "";
  let responsePayload = await createOpenAiResponse({
    apiKey,
    instructions,
    previousResponseId,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: String(message || "").trim() }]
      }
    ],
    tools
  });

  for (let step = 0; step < 8; step += 1) {
    const calls = extractResponseFunctionCalls(responsePayload);
    if (calls.length === 0) {
      break;
    }

    const toolOutputs = [];
    for (const call of calls) {
      const result = await executeAssistantToolCall(call);
      if (result.action) {
        actionLog.push(result.action);
      }
      changedState = changedState || Boolean(result.changedState);
      navigateTo = result.navigateTo || navigateTo;
      focusTaskId = result.focusTaskId || focusTaskId;
      toolOutputs.push({
        type: "function_call_output",
        call_id: call.callId,
        output: JSON.stringify(result)
      });
    }

    responsePayload = await createOpenAiResponse({
      apiKey,
      instructions,
      previousResponseId: responsePayload.id || previousResponseId,
      input: toolOutputs,
      tools
    });
  }

  const reply =
    extractOpenAiResponseText(responsePayload) ||
    (actionLog.length ? `Completed: ${actionLog.join("; ")}.` : "I reviewed the request, but I do not have a text reply yet.");

  return {
    reply,
    responseId: responsePayload.id || previousResponseId,
    changedState,
    actions: actionLog,
    navigateTo,
    focusTaskId
  };
}

async function inspectRpcEndpoint(rpcUrl, timeoutMs = 10000) {
  const normalizedUrl = String(rpcUrl || "").trim();
  if (!normalizedUrl) {
    throw new Error("RPC URL is required");
  }

  try {
    new URL(normalizedUrl);
  } catch {
    throw new Error("RPC URL is invalid");
  }

  if (isSocketRpcUrl(normalizedUrl)) {
    const inspection = await probeSocketRpcEndpoint(normalizedUrl, timeoutMs, { includeChainId: true });
    const chain = deriveChainDescriptor(inspection.chainId, normalizedUrl);
    return {
      url: normalizedUrl,
      chainId: inspection.chainId,
      chainKey: chain.key,
      chainLabel: chain.label,
      supportedChain: true,
      cataloguedChain: Boolean(chain.catalogued),
      blockNumber: inspection.blockNumber,
      latencyMs: inspection.latencyMs,
      checkedAt: inspection.checkedAt,
      nameSuggestion: buildRpcNameSuggestion(normalizedUrl, chain, inspection.chainId)
    };
  }

  let provider = null;
  let timeoutId = null;
  const started = Date.now();
  try {
    provider = createProviderForRpcUrl(normalizedUrl);
    const [network, blockNumber] = await Promise.race([
      Promise.all([provider.getNetwork(), provider.getBlockNumber()]),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("RPC inspection timed out")), timeoutMs);
      })
    ]);
    const chainId = Number(network.chainId);
    if (!Number.isFinite(chainId)) {
      throw new Error("RPC did not return a valid chain ID");
    }

    const chain = deriveChainDescriptor(chainId, normalizedUrl);
    const checkedAt = new Date().toISOString();
    return {
      url: normalizedUrl,
      chainId,
      chainKey: chain.key,
      chainLabel: chain.label,
      supportedChain: true,
      cataloguedChain: Boolean(chain.catalogued),
      blockNumber,
      latencyMs: Date.now() - started,
      checkedAt,
      nameSuggestion: buildRpcNameSuggestion(normalizedUrl, chain, chainId)
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    await destroyProvider(provider);
  }
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

function applySecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", appContentSecurityPolicy);
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
  );
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
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

function normalizePrivateKeyValue(value) {
  const trimmed = String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return `0x${trimmed}`;
  }

  return trimmed;
}

function deriveAddress(privateKey) {
  return new ethers.Wallet(normalizePrivateKeyValue(privateKey)).address;
}

function validateResolvedPrivateKey(privateKey, wallet = null) {
  const normalized = normalizePrivateKeyValue(privateKey);
  const walletLabel = wallet?.label || wallet?.addressShort || wallet?.address || "Selected wallet";

  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`${walletLabel} has an invalid private key format. Re-import that wallet secret.`);
  }

  let derivedAddress;
  try {
    derivedAddress = deriveAddress(normalized);
  } catch {
    throw new Error(`${walletLabel} has an unreadable private key. Re-import that wallet secret.`);
  }

  if (wallet?.address && derivedAddress.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(
      `${walletLabel} private key does not match the saved wallet address ${wallet.address}. Re-import that wallet.`
    );
  }

  return normalized;
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

function requestIsSecure(request) {
  if (request?.socket?.encrypted) {
    return true;
  }

  const forwardedProto = String(request?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }

  const forwardedScheme = String(request?.headers?.["x-forwarded-scheme"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (forwardedScheme) {
    return forwardedScheme === "https";
  }

  const forwardedSsl = String(request?.headers?.["x-forwarded-ssl"] || "").trim().toLowerCase();
  if (forwardedSsl) {
    return forwardedSsl === "on";
  }

  const origin = String(request?.headers?.origin || request?.headers?.referer || "").trim();
  if (/^https:\/\//i.test(origin)) {
    return true;
  }
  if (/^http:\/\//i.test(origin)) {
    return false;
  }

  return false;
}

function shouldUseSecureCookie(request) {
  if (process.env.COOKIE_SECURE === "true") {
    return true;
  }

  if (process.env.COOKIE_SECURE === "false") {
    return false;
  }

  return requestIsSecure(request);
}

function getClientAddress(request) {
  const forwardedFor = String(request?.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const rawAddress = forwardedFor || String(request?.socket?.remoteAddress || "").trim();
  return rawAddress.replace(/^::ffff:/, "") || "unknown";
}

function pruneLoginAttemptBuckets(now = Date.now()) {
  for (const [key, bucket] of loginAttemptBuckets) {
    if ((bucket.blockedUntil || 0) > now) {
      continue;
    }

    if (now - (bucket.lastAttemptAt || bucket.windowStartedAt || 0) <= loginRateLimitBlockMs) {
      continue;
    }

    loginAttemptBuckets.delete(key);
  }
}

function getLoginAttemptBucket(request) {
  const now = Date.now();
  const key = getClientAddress(request);
  const existing = loginAttemptBuckets.get(key);

  if (!existing || now - existing.windowStartedAt > loginRateLimitWindowMs) {
    const bucket = {
      count: 0,
      windowStartedAt: now,
      lastAttemptAt: 0,
      blockedUntil: 0
    };
    loginAttemptBuckets.set(key, bucket);
    return { key, bucket };
  }

  return { key, bucket: existing };
}

function buildLoginRateLimitError(blockedUntil) {
  const retryAfterSeconds = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));
  const error = createHttpError(
    `Too many login attempts. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}.`,
    429
  );
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}

function ensureLoginAllowed(request) {
  pruneLoginAttemptBuckets();
  const key = getClientAddress(request);
  const bucket = loginAttemptBuckets.get(key);
  if (bucket?.blockedUntil && bucket.blockedUntil > Date.now()) {
    throw buildLoginRateLimitError(bucket.blockedUntil);
  }
}

function recordFailedLoginAttempt(request) {
  pruneLoginAttemptBuckets();

  const now = Date.now();
  const { key, bucket } = getLoginAttemptBucket(request);
  bucket.count += 1;
  bucket.lastAttemptAt = now;

  if (bucket.count >= loginRateLimitMaxAttempts) {
    bucket.blockedUntil = now + loginRateLimitBlockMs;
  }

  loginAttemptBuckets.set(key, bucket);
  return bucket;
}

function clearLoginAttempts(request) {
  loginAttemptBuckets.delete(getClientAddress(request));
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
    sourceType: defaultMintSourceType,
    sourceTarget: "",
    sourceStage: "public",
    sourceConfigJson: "",
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
    claimIntegrationEnabled: false,
    claimProjectKey: "",
    walletClaimsJson: "",
    claimFetchEnabled: false,
    claimFetchUrl: "",
    claimFetchMethod: "GET",
    claimFetchHeadersJson: "",
    claimFetchCookiesJson: "",
    claimFetchBodyJson: "",
    claimResponseMappingJson: "",
    claimResponseRoot: "",
    gasStrategy: "aggressive",
    gasLimit: "",
    maxFeeGwei: "",
    maxPriorityFeeGwei: "",
    gasBoostPercent: "8",
    priorityBoostPercent: "10",
    simulateTransaction: true,
    dryRun: false,
    waitForReceipt: true,
    warmupRpc: true,
    continueOnError: false,
    walletMode: "parallel",
    autoArm: true,
    autoArmPending: false,
    useSchedule: false,
    waitUntilIso: "",
    preSignTransactions: true,
    multiRpcBroadcast: true,
    schedulePending: false,
    mintStartDetectionEnabled: false,
    mintStartDetectionConfig: null,
    readyCheckFunction: "",
    readyCheckArgs: "[]",
    readyCheckMode: "truthy",
    readyCheckExpected: "",
    readyCheckIntervalMs: "1000",
    pollIntervalMs: "150",
    txTimeoutMs: "25000",
    maxRetries: "1",
    retryDelayMs: "250",
    retryWindowMs: "300000",
    startJitterMs: "0",
    minBalanceEth: "",
    nonceOffset: "0",
    smartGasReplacement: true,
    replacementBumpPercent: "15",
    replacementMaxAttempts: "3",
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
  const sourceSelection = normalizeMintSourceSelection({
    sourceType: payload.sourceType ?? base.sourceType ?? defaultMintSourceType,
    sourceTarget: payload.sourceTarget ?? base.sourceTarget ?? "",
    sourceStage: "public",
    sourceConfig: payload.sourceConfigJson ?? base.sourceConfigJson ?? ""
  });
  const autoArm = true;
  const useSchedule = Boolean(payload.useSchedule ?? base.useSchedule ?? false);
  const waitUntilIso = String(payload.waitUntilIso ?? base.waitUntilIso ?? "").trim();
  const retryWindowMs = String(payload.retryWindowMs ?? base.retryWindowMs ?? "300000").trim() || "300000";
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

  validateMintSourceSelection(sourceSelection.sourceType, sourceSelection);

  return {
    ...base,
    name: String(payload.name || base.name).trim() || "Untitled Task",
    contractAddress: String(payload.contractAddress || "").trim(),
    chainKey: String(payload.chainKey || base.chainKey || "base_sepolia"),
    sourceType: sourceSelection.sourceType,
    sourceTarget: sourceSelection.sourceTarget,
    sourceStage: "public",
    sourceConfigJson: sourceSelection.sourceConfigJson,
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
    claimIntegrationEnabled: false,
    claimProjectKey: "",
    walletClaimsJson: "",
    claimFetchEnabled: false,
    claimFetchUrl: "",
    claimFetchMethod: "GET",
    claimFetchHeadersJson: "",
    claimFetchCookiesJson: "",
    claimFetchBodyJson: "",
    claimResponseMappingJson: "",
    claimResponseRoot: "",
    gasStrategy: normalizeGasStrategyValue(payload.gasStrategy || base.gasStrategy || "aggressive"),
    gasLimit: String(payload.gasLimit ?? base.gasLimit ?? "").trim(),
    maxFeeGwei: String(payload.maxFeeGwei ?? base.maxFeeGwei ?? "").trim(),
    maxPriorityFeeGwei: String(payload.maxPriorityFeeGwei ?? base.maxPriorityFeeGwei ?? "").trim(),
    gasBoostPercent: String(payload.gasBoostPercent ?? base.gasBoostPercent ?? "8").trim() || "8",
    priorityBoostPercent: String(
      payload.priorityBoostPercent ?? base.priorityBoostPercent ?? "10"
    ).trim() || "10",
    simulateTransaction: Boolean(payload.simulateTransaction ?? base.simulateTransaction ?? true),
    dryRun: Boolean(payload.dryRun ?? base.dryRun ?? false),
    waitForReceipt: Boolean(payload.waitForReceipt ?? base.waitForReceipt ?? true),
    warmupRpc: true,
    continueOnError: Boolean(payload.continueOnError ?? base.continueOnError ?? false),
    walletMode: "parallel",
    autoArm,
    autoArmPending: Boolean(payload.autoArmPending ?? base.autoArmPending ?? false),
    useSchedule,
    waitUntilIso,
    preSignTransactions: true,
    multiRpcBroadcast: true,
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
    pollIntervalMs: String(payload.pollIntervalMs ?? base.pollIntervalMs ?? "150").trim() || "150",
    txTimeoutMs: String(payload.txTimeoutMs ?? base.txTimeoutMs ?? "25000").trim() || "25000",
    maxRetries: String(payload.maxRetries ?? base.maxRetries ?? "1").trim() || "1",
    retryDelayMs: String(payload.retryDelayMs ?? base.retryDelayMs ?? "250").trim() || "250",
    retryWindowMs,
    startJitterMs: String(payload.startJitterMs ?? base.startJitterMs ?? "0").trim() || "0",
    minBalanceEth: String(payload.minBalanceEth ?? base.minBalanceEth ?? "").trim(),
    nonceOffset: String(payload.nonceOffset ?? base.nonceOffset ?? "0").trim() || "0",
    smartGasReplacement: true,
    replacementBumpPercent: String(
      payload.replacementBumpPercent ?? base.replacementBumpPercent ?? "15"
    ).trim() || "15",
    replacementMaxAttempts: String(
      payload.replacementMaxAttempts ?? base.replacementMaxAttempts ?? "3"
    ).trim() || "3",
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
    transferAfterMinted: false,
    transferAddress: "",
    status: payload.status || base.status || "draft",
    progress: base.progress || { phase: "Ready", percent: 0 },
    summary: base.summary || { total: 0, success: 0, failed: 0, stopped: 0, hashes: [] },
    history: base.history || [],
    lastRunAt: base.lastRunAt || null,
    done: Boolean(payload.done ?? base.done ?? false),
    updatedAt: new Date().toISOString()
  };
}

async function enrichTaskFromSource(task) {
  if (String(task?.sourceType || "").trim() !== "opensea" || !String(task?.sourceTarget || "").trim()) {
    return task;
  }

  const needsDiscovery =
    !String(task.contractAddress || "").trim() ||
    !String(task.abiJson || "").trim();

  if (!needsDiscovery) {
    return task;
  }

  const discovery = await discoverOpenSeaSource({
    sourceTarget: task.sourceTarget,
    sourceStage: task.sourceStage || defaultMintSourceStage,
    preferredChainKey: task.chainKey,
    walletIds: Array.isArray(task.walletIds) ? task.walletIds : [],
    rpcNodeIds: Array.isArray(task.rpcNodeIds) ? task.rpcNodeIds : [],
    quantityPerWallet: Math.max(1, Number(task.quantityPerWallet || 1)),
    requestedFunction: String(task.mintFunction || "").trim()
  });
  const autofill = discovery.autofill || null;
  const nextTask = {
    ...task
  };

  if (
    discovery.chainKey &&
    (!nextTask.chainKey || nextTask.chainKey === "base_sepolia" || !String(nextTask.contractAddress || "").trim())
  ) {
    nextTask.chainKey = discovery.chainKey;
  }

  if (!String(nextTask.contractAddress || "").trim() && discovery.contractAddress) {
    nextTask.contractAddress = discovery.contractAddress;
  }

  if (!String(nextTask.abiJson || "").trim() && Array.isArray(discovery.abi) && discovery.abi.length > 0) {
    nextTask.abiJson = JSON.stringify(discovery.abi);
  }

  if (autofill?.mintFunction && !String(nextTask.mintFunction || "").trim()) {
    nextTask.mintFunction = autofill.mintFunction;
  }

  if (Array.isArray(autofill?.mintArgs) && !String(nextTask.mintArgs || "").trim()) {
    nextTask.mintArgs = JSON.stringify(autofill.mintArgs);
  }

  if (autofill?.priceEth !== undefined && autofill?.priceEth !== null && !String(nextTask.priceEth || "").trim()) {
    nextTask.priceEth = String(autofill.priceEth);
  }

  if (
    autofill?.platform &&
    (!String(nextTask.platform || "").trim() || nextTask.platform === "Generic EVM (auto-detect)")
  ) {
    nextTask.platform = autofill.platform;
  }

  if (!nextTask.mintStartDetectionEnabled && autofill?.mintStartDetection?.enabled) {
    nextTask.mintStartDetectionEnabled = true;
    nextTask.mintStartDetectionConfig = autofill.mintStartDetection;
  }

  return nextTask;
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

function formatFunctionSignature(entry) {
  const inputTypes = Array.isArray(entry?.inputs) ? entry.inputs.map((input) => input.type).join(",") : "";
  return `${entry?.name || "unknown"}(${inputTypes})`;
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
const seaDropContractAddresses = Object.freeze({
  ethereum: "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5"
});
const seaDropPublicMintAbi = Object.freeze([
  {
    inputs: [{ internalType: "address", name: "nftContract", type: "address" }],
    name: "getPayers",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "nftContract", type: "address" }],
    name: "getAllowedFeeRecipients",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "nftContract", type: "address" }],
    name: "getPublicDrop",
    outputs: [
      {
        components: [
          { internalType: "uint80", name: "mintPrice", type: "uint80" },
          { internalType: "uint48", name: "startTime", type: "uint48" },
          { internalType: "uint48", name: "endTime", type: "uint48" },
          {
            internalType: "uint16",
            name: "maxTotalMintableByWallet",
            type: "uint16"
          },
          { internalType: "uint16", name: "feeBps", type: "uint16" },
          {
            internalType: "bool",
            name: "restrictFeeRecipients",
            type: "bool"
          }
        ],
        internalType: "struct PublicDrop",
        name: "",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "nftContract", type: "address" },
      { internalType: "address", name: "feeRecipient", type: "address" },
      { internalType: "address", name: "minterIfNotPayer", type: "address" },
      { internalType: "uint256", name: "quantity", type: "uint256" }
    ],
    name: "mintPublic",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  }
]);

function mintFunctionCandidateScore(entry) {
  const normalizedName = normalizeAbiName(entry?.name);
  if (!normalizedName) {
    return -1;
  }

  if (normalizedName === "mintseadrop") {
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
  if (isSeaDropTokenContractAbi(abiEntries) || isSeaDropMintContractAbi(abiEntries)) {
    return "OpenSea SeaDrop";
  }

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

function isSeaDropTokenContractAbi(abiEntries) {
  return Boolean(
    findAbiFunctionEntry(abiEntries, "mintSeaDrop") &&
      findAbiFunctionEntry(abiEntries, "updatePublicDrop")
  );
}

function isSeaDropMintContractAbi(abiEntries) {
  return Boolean(
    findAbiFunctionEntry(abiEntries, "mintPublic") &&
      findAbiFunctionEntry(abiEntries, "getPublicDrop")
  );
}

function seaDropContractAddressForChain(chainKey) {
  return seaDropContractAddresses[String(chainKey || "").trim().toLowerCase()] || "";
}

function normalizeSeaDropPublicDrop(value) {
  if (!value) {
    return null;
  }

  const source = Array.isArray(value)
    ? {
        mintPrice: value[0],
        startTime: value[1],
        endTime: value[2],
        maxTotalMintableByWallet: value[3],
        feeBps: value[4],
        restrictFeeRecipients: value[5]
      }
    : value;

  return {
    mintPrice: source.mintPrice ?? source[0] ?? 0n,
    startTime: source.startTime ?? source[1] ?? 0n,
    endTime: source.endTime ?? source[2] ?? 0n,
    maxTotalMintableByWallet:
      source.maxTotalMintableByWallet ?? source[3] ?? 0,
    feeBps: source.feeBps ?? source[4] ?? 0,
    restrictFeeRecipients: Boolean(
      source.restrictFeeRecipients ?? source[5] ?? false
    )
  };
}

async function buildSeaDropPublicAutofill({
  chainKey,
  nftContractAddress,
  abiEntries,
  walletIds = [],
  rpcNodeIds = [],
  quantityPerWallet = 1
}) {
  if (!isSeaDropTokenContractAbi(abiEntries || [])) {
    return null;
  }

  const seaDropContractAddress = seaDropContractAddressForChain(chainKey);
  if (!seaDropContractAddress || !ethers.isAddress(nftContractAddress)) {
    return null;
  }

  const normalizedQuantity = Math.max(1, Number(quantityPerWallet || 1));
  const warnings = [
    `Detected ERC721SeaDrop. Switched the mint route to the shared SeaDrop contract ${seaDropContractAddress}.`
  ];
  let rpcNodeName = null;
  let priceEth = "0";
  let priceSource = "SeaDrop.getPublicDrop";
  let waitUntilIso = "";
  let feeRecipient = ethers.ZeroAddress;
  let publicDrop = null;
  let allowedPayers = [];
  let executionBlocker = "";
  const providerResult = await createReadProviderForChain(chainKey, rpcNodeIds);

  if (!providerResult.provider) {
    return null;
  }

  rpcNodeName = providerResult.rpcNode?.name || null;
  try {
    const contract = new ethers.Contract(
      seaDropContractAddress,
      seaDropPublicMintAbi,
      providerResult.provider
    );
    const [publicDropResult, feeRecipientsResult, payersResult] = await Promise.allSettled([
      contract.getPublicDrop(nftContractAddress),
      contract.getAllowedFeeRecipients(nftContractAddress),
      contract.getPayers(nftContractAddress)
    ]);

    if (publicDropResult.status === "fulfilled") {
      publicDrop = normalizeSeaDropPublicDrop(publicDropResult.value);
      const formattedPrice = formatEthString(publicDrop?.mintPrice);
      if (formattedPrice !== null) {
        priceEth = formattedPrice;
      }
      waitUntilIso = normalizeContractTimestampValue(publicDrop?.startTime) || "";
    } else {
      return null;
    }

    if (feeRecipientsResult.status === "fulfilled") {
      const feeRecipients = Array.isArray(feeRecipientsResult.value)
        ? feeRecipientsResult.value.filter((entry) => ethers.isAddress(entry))
        : [];
      if (feeRecipients.length > 0) {
        feeRecipient = feeRecipients[0];
      } else if (publicDrop?.restrictFeeRecipients) {
        warnings.push(
          "SeaDrop requires an allowed fee recipient, but no allowed fee recipient was returned."
        );
      }
    } else {
      warnings.push(
        `SeaDrop fee recipient read failed: ${formatError(
          feeRecipientsResult.reason
        )}`
      );
    }

    if (payersResult.status === "fulfilled") {
      allowedPayers = Array.isArray(payersResult.value)
        ? payersResult.value.filter((entry) => ethers.isAddress(entry))
        : [];
    }
  } finally {
    await destroyProvider(providerResult.provider);
  }

  if (allowedPayers.length > 0) {
    const selectedWallets = (appState?.wallets || []).filter((wallet) =>
      (walletIds || []).includes(wallet.id)
    );
    const selectedWalletAllowed = selectedWallets.some((wallet) =>
      allowedPayers.some(
        (payer) => payer.toLowerCase() === String(wallet.address || "").toLowerCase()
      )
    );

    if (selectedWallets.length > 0 && !selectedWalletAllowed) {
      executionBlocker =
        "This collection restricts mint calls to approved payer contracts, so a direct wallet mint task will not succeed without the project’s relayer or website-backed flow.";
      warnings.push(executionBlocker);
    } else if (selectedWallets.length === 0) {
      warnings.push(
        "SeaDrop uses approved payer contracts for this collection. Select a wallet to verify whether direct minting is allowed."
      );
    }
  }

  const waitUntilMs = waitUntilIso ? new Date(waitUntilIso).getTime() : null;
  const launchRecommendation =
    waitUntilMs && waitUntilMs > Date.now()
      ? {
          mode: "utc",
          waitUntilIso,
          reason: "SeaDrop public drop start time"
        }
      : {
          mode: "live",
          waitUntilIso: "",
          reason: "SeaDrop public drop"
        };

  return {
    mintFunction: "mintPublic",
    mintArgs: [
      nftContractAddress,
      feeRecipient,
      "{{wallet}}",
      normalizedQuantity
    ],
    quantityPerWallet: normalizedQuantity,
    priceEth,
    platform: "OpenSea SeaDrop",
    detectedMintFunctions: ["mintPublic"],
    mintStartDetection: {
      enabled: false,
      pollIntervalMs: 500,
      saleActiveFunction: null,
      pausedFunction: null,
      totalSupplyFunction: null,
      stateFunction: null,
      signals: []
    },
    phasePreview: [
      {
        phaseType: "public",
        label: "Public",
        mintFunction: "mintPublic",
        signature: "mintPublic(address,address,address,uint256)",
        priceEth,
        priceSource,
        waitUntilIso: waitUntilIso || null,
        startTimeSource: waitUntilIso ? "SeaDrop.getPublicDrop" : null,
        autoLaunchMode:
          launchRecommendation.mode === "utc" ? "scheduled" : "instant",
        autoLaunchLabel:
          launchRecommendation.mode === "utc"
            ? "scheduled from SeaDrop public drop"
            : "ready to launch through SeaDrop",
        eligibilityStatus: "review",
        eligibilityLabel: "SeaDrop route derived from contract metadata",
        eligibleWalletLabels: [],
        reviewWalletLabels: [],
        ineligibleWalletLabels: [],
        requiresReview: Boolean(executionBlocker),
        rpcNodeName,
        warning: executionBlocker || warnings[0] || null
      }
    ],
    priceSource,
    rpcNodeName,
    warnings,
    contractAddressOverride: seaDropContractAddress,
    abiOverride: seaDropPublicMintAbi,
    launchRecommendation,
    routeLabel: executionBlocker ? "SeaDrop payer-restricted route" : "SeaDrop public mint route",
    executionBlocker,
    payerRestriction: {
      enabled: allowedPayers.length > 0,
      allowedPayers
    }
  };
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

function defaultValueForAbiInput(input, inputIndex, totalInputs, quantity = 1) {
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
    return looksLikeQuantityInput(input, inputIndex, totalInputs) ? quantity : 0;
  }

  return null;
}

function inferMintArgsFromAbi(abiEntries, mintFunction = "", quantity = 1) {
  const mintEntry = findAbiFunctionEntry(abiEntries, mintFunction);
  if (!mintEntry?.inputs?.length) {
    return [];
  }

  return mintEntry.inputs.map((input, inputIndex) =>
    defaultValueForAbiInput(input, inputIndex, mintEntry.inputs.length, quantity)
  );
}

function formatEthString(value, decimals = 18) {
  if (typeof value !== "bigint") {
    return null;
  }

  const normalizedDecimals = Number.isFinite(Number(decimals)) ? Number(decimals) : 18;
  const formatted = ethers.formatUnits(value, normalizedDecimals);
  const trimmed = formatted.includes(".") ? formatted.replace(/\.?0+$/, "") : formatted;
  return trimmed || "0";
}

function formatUsdString(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: normalized >= 1000 ? 0 : 2
  }).format(normalized);
}

function nativeAssetPriceKey(chainKey, symbol = "") {
  const normalizedChainKey = String(chainKey || "").trim();
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();

  if (normalizedSymbol === "BNB" || normalizedChainKey === "bsc") {
    return "bnb";
  }

  if (
    normalizedSymbol === "ETH" ||
    ["ethereum", "sepolia", "base", "base_sepolia", "arbitrum", "blast", "shape", "plasma"].includes(
      normalizedChainKey
    )
  ) {
    return "eth";
  }

  return null;
}

function nativeAssetMetaForChain(chainInput) {
  const chain = chainInput && typeof chainInput === "object" ? chainInput : { key: chainInput };
  const chainKey = String(chain?.key || chainInput || "").trim();
  const nativeCurrencySymbol = String(chain?.nativeCurrencySymbol || "").trim();
  const nativeCurrencyName = String(chain?.nativeCurrencyName || "").trim();
  const nativeCurrencyDecimals = Number.isFinite(Number(chain?.nativeCurrencyDecimals))
    ? Number(chain.nativeCurrencyDecimals)
    : 18;

  switch (chainKey) {
    case "bsc":
      return { symbol: "BNB", name: "BNB", priceKey: "bnb", decimals: nativeCurrencyDecimals };
    case "ethereum":
    case "sepolia":
    case "base":
    case "base_sepolia":
    case "arbitrum":
    case "blast":
    case "shape":
    case "plasma":
      return { symbol: "ETH", name: "Ether", priceKey: "eth", decimals: nativeCurrencyDecimals };
    default:
      return {
        symbol: nativeCurrencySymbol || "COIN",
        name: nativeCurrencyName || nativeCurrencySymbol || "Native Coin",
        priceKey: nativeAssetPriceKey(chainKey, nativeCurrencySymbol),
        decimals: nativeCurrencyDecimals
      };
  }
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId = null;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function extractUsdNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeNativeUsdPrices(payload = {}) {
  const prices = {};
  const ethUsd = extractUsdNumber(
    payload.ethereum?.usd ?? payload.eth?.usd ?? payload.ethereum ?? payload.eth
  );
  const bnbUsd = extractUsdNumber(
    payload.binancecoin?.usd ?? payload.bnb?.usd ?? payload.binancecoin ?? payload.bnb
  );

  if (ethUsd !== null) {
    prices.eth = ethUsd;
  }

  if (bnbUsd !== null) {
    prices.bnb = bnbUsd;
  }

  return prices;
}

async function fetchNativeUsdPrices(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && nativeUsdPriceCache.value && nativeUsdPriceCache.expiresAt > now) {
    return nativeUsdPriceCache.value;
  }

  if (!forceRefresh && nativeUsdPriceCache.pending) {
    return nativeUsdPriceCache.pending;
  }

  const pending = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), nativeUsdPriceFetchTimeoutMs);

    try {
      const response = await fetch(nativeUsdPriceUrl, {
        headers: {
          accept: "application/json"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`USD price lookup failed with ${response.status}`);
      }

      const payload = await response.json();
      const prices = normalizeNativeUsdPrices(payload);
      if (Object.keys(prices).length === 0) {
        throw new Error("USD price lookup returned no supported native prices");
      }

      nativeUsdPriceCache = {
        expiresAt: Date.now() + nativeUsdPriceCacheTtlMs,
        value: prices,
        pending: null
      };
      return prices;
    } catch (error) {
      nativeUsdPriceCache = {
        expiresAt: nativeUsdPriceCache.value ? Date.now() + nativeUsdPriceCacheTtlMs : 0,
        value: nativeUsdPriceCache.value,
        pending: null
      };

      if (nativeUsdPriceCache.value) {
        return nativeUsdPriceCache.value;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  nativeUsdPriceCache = {
    ...nativeUsdPriceCache,
    pending
  };

  return pending;
}

function getChainRpcNodes(chainKey) {
  return rankRpcNodesByLatency(
    (appState?.rpcNodes || []).filter((node) => node.enabled && node.chainKey === chainKey)
  );
}

async function createReadProviderForChain(chainKey, preferredRpcNodeIds = []) {
  const preferredIds = Array.isArray(preferredRpcNodeIds) ? preferredRpcNodeIds : [];
  const chainRpcNodes = getChainRpcNodes(chainKey).filter(
    (node) => preferredIds.length === 0 || preferredIds.includes(node.id)
  );
  if (chainRpcNodes.length === 0) {
    return {
      provider: null,
      rpcNode: null,
      warning: `No enabled RPC nodes configured for ${chainKey}`
    };
  }

  let lastError = null;

  for (const rpcNode of chainRpcNodes) {
    const provider = /^wss?:\/\//i.test(String(rpcNode.url || ""))
      ? new ethers.WebSocketProvider(rpcNode.url)
      : new ethers.JsonRpcProvider(rpcNode.url);
    try {
      await provider.getBlockNumber();
      return {
        provider,
        rpcNode,
        warning: null
      };
    } catch (error) {
      if (typeof provider.destroy === "function") {
        await provider.destroy().catch(() => {});
      }
      lastError = error;
    }
  }

  return {
    provider: null,
    rpcNode: null,
    warning: lastError ? `Unable to reach configured RPC nodes: ${formatError(lastError)}` : null
  };
}

async function createWalletAssetReadProvider(chainInput, options = {}) {
  const chain =
    chainInput && typeof chainInput === "object"
      ? normalizeChainEntry(chainInput)
      : findAvailableChainByKey(chainInput) ||
        buildAvailableChains().find((entry) => entry.key === chainInput) ||
        null;
  const chainKey = String(chain?.key || chainInput || "").trim();
  const configuredProvider = await createReadProviderForChain(chainKey);
  if (configuredProvider.provider) {
    return {
      ...configuredProvider,
      sourceLabel: configuredProvider.rpcNode?.name || "Configured RPC"
    };
  }
  if (!chain) {
    return {
      provider: null,
      rpcNode: null,
      warning: configuredProvider.warning || `Unknown chain ${chainKey}`,
      sourceLabel: null
    };
  }

  const chainlistEntry =
    options.chainlistEntry ||
    findChainlistEntry(options.chainlistCatalog || (await fetchChainlistRpcCatalog(false)), chain);
  if (!chainlistEntry) {
    return {
      provider: null,
      rpcNode: null,
      warning: configuredProvider.warning || `Chainlist does not currently publish RPCs for ${chain.label}`,
      sourceLabel: null
    };
  }

  const publishedUrls = filterRpcUrlsByTransport(extractChainlistRpcUrls(chainlistEntry), "http");
  const candidateUrls = selectChainlistProbeUrls(publishedUrls, walletAssetChainlistUrlBudget, "http");
  let lastError = null;

  for (const rpcUrl of candidateUrls) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const checkedAt = new Date().toISOString();
    const started = Date.now();

    try {
      await withTimeout(
        provider.getBlockNumber(),
        walletAssetRpcTimeoutMs,
        `${chain.label} RPC probe timed out after ${walletAssetRpcTimeoutMs}ms`
      );

      const latencyMs = Date.now() - started;
      const providerName = buildRpcNameSuggestion(rpcUrl, chain, chain.chainId) || "Chainlist RPC";
      return {
        provider,
        rpcNode: {
          id: createId("rpc_asset"),
          name: providerName,
          url: rpcUrl,
          chainKey,
          chainId: chain.chainId,
          chainLabel: chain.label,
          lastHealth: {
            status: "healthy",
            latencyMs,
            checkedAt
          }
        },
        warning: null,
        sourceLabel: `${providerName} · Chainlist`
      };
    } catch (error) {
      lastError = error;
      await destroyProvider(provider);
    }
  }

  return {
    provider: null,
    rpcNode: null,
    warning:
      configuredProvider.warning ||
      (lastError
        ? `Unable to find a reachable public RPC for ${chain.label}: ${formatError(lastError)}`
        : `No healthy public RPC was found for ${chain.label}`),
    sourceLabel: null
  };
}

async function readWalletAssetSnapshot(wallet) {
  if (!wallet?.address) {
    throw new Error("Wallet address is required");
  }

  const chainsToInspect = buildAvailableChains().filter(
    (chain) => !/sepolia/i.test(String(chain.key || "")) && !/sepolia/i.test(String(chain.label || ""))
  );
  if (chainsToInspect.length === 0) {
    return {
      wallet,
      generatedAt: new Date().toISOString(),
      assets: [],
      warnings: [{ chainLabel: "RPC", message: "No supported chains are available for balance inspection yet." }],
      summary: {
        chainCount: 0,
        warningCount: 1,
        nonZeroAssetCount: 0,
        totalUsd: null,
        totalUsdFormatted: null,
        pricedAssetCount: 0,
        usdAvailable: false
      }
    };
  }

  let nativeUsdPrices = {};
  try {
    nativeUsdPrices = await fetchNativeUsdPrices();
  } catch {
    nativeUsdPrices = {};
  }

  const results = await Promise.all(
    chainsToInspect.map(async (chain) => {
      const providerResult = await createWalletAssetReadProvider(chain.key);
      if (!providerResult.provider) {
        return {
          asset: null,
          warning: {
            chainKey: chain.key,
            chainLabel: chain.label,
            message: providerResult.warning || `Unable to inspect ${chain.label} right now.`
          }
        };
      }

      try {
        const assetMeta = nativeAssetMetaForChain(chain.key);
        const balance = await providerResult.provider.getBalance(wallet.address);
        const balanceFormatted = formatEthString(balance, assetMeta.decimals) || "0";
        const balanceFloat = Number(balanceFormatted || 0);
        const usdPrice =
          assetMeta.priceKey && Number.isFinite(Number(nativeUsdPrices[assetMeta.priceKey]))
            ? Number(nativeUsdPrices[assetMeta.priceKey])
            : null;
        const usdValue = Number.isFinite(balanceFloat) && Number.isFinite(usdPrice) ? balanceFloat * usdPrice : null;
        return {
          asset: {
            chainKey: chain.key,
            chainLabel: chain.label,
            assetSymbol: assetMeta.symbol,
            assetName: assetMeta.name,
            balanceWei: balance.toString(),
            balanceFormatted,
            balanceFloat,
            usdPrice,
            usdValue,
            usdValueFormatted: formatUsdString(usdValue),
            rpcLabel: providerResult.sourceLabel || providerResult.rpcNode?.name || "RPC",
            transportLabel: isSocketRpcUrl(providerResult.rpcNode?.url) ? "WebSocket" : "HTTPS",
            latencyMs: providerResult.rpcNode?.lastHealth?.latencyMs ?? null,
            checkedAt: providerResult.rpcNode?.lastHealth?.checkedAt || new Date().toISOString()
          },
          warning: null
        };
      } catch (error) {
        return {
          asset: null,
          warning: {
            chainKey: chain.key,
            chainLabel: chain.label,
            message: formatError(error)
          }
        };
      } finally {
        await destroyProvider(providerResult.provider);
      }
    })
  );

  const assets = results
    .map((entry) => entry.asset)
    .filter(Boolean)
    .sort((left, right) => {
      const balanceDelta = Number(right.balanceFloat || 0) - Number(left.balanceFloat || 0);
      if (balanceDelta !== 0) {
        return balanceDelta;
      }

      return String(left.chainLabel || "").localeCompare(String(right.chainLabel || ""));
    });

  const warnings = results.map((entry) => entry.warning).filter(Boolean);
  const nonZeroAssetCount = assets.filter((asset) => Number(asset.balanceFloat || 0) > 0).length;
  const pricedAssets = assets.filter((asset) => Number.isFinite(Number(asset.usdValue)));
  const totalUsd = pricedAssets.reduce((sum, asset) => sum + Number(asset.usdValue || 0), 0);
  return {
    wallet,
    generatedAt: new Date().toISOString(),
    assets,
    warnings,
    summary: {
      chainCount: assets.length,
      warningCount: warnings.length,
      nonZeroAssetCount,
      totalUsd: pricedAssets.length > 0 ? totalUsd : null,
      totalUsdFormatted: pricedAssets.length > 0 ? formatUsdString(totalUsd) : null,
      pricedAssetCount: pricedAssets.length,
      usdAvailable: pricedAssets.length > 0
    }
  };
}

async function inferMintPriceFromContract({ chainKey, contractAddress, abiEntries, rpcNodeIds = [] }) {
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
  const { provider, rpcNode, warning } = await createReadProviderForChain(chainKey, rpcNodeIds);

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

function buildPhaseDescriptor(entry) {
  const inputLabels = Array.isArray(entry?.inputs)
    ? entry.inputs.map((input) => `${input?.name || ""}:${input?.type || ""}`).join(" ")
    : "";

  return `${entry?.name || ""} ${inputLabels}`.toLowerCase();
}

function hasProofLikeInput(entry) {
  return Array.isArray(entry?.inputs)
    ? entry.inputs.some((input) =>
        /proof|merkle|whitelist|allowlist|allow|wl|sig|signature|voucher|permit/i.test(
          String(input?.name || "")
        )
      )
    : false;
}

function hasSignatureLikeInput(entry) {
  return Array.isArray(entry?.inputs)
    ? entry.inputs.some((input) =>
        /sig|signature|voucher|permit|auth|signed/i.test(String(input?.name || ""))
      )
    : false;
}

function parseJsonArraySafely(value, fallback = null) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function isEmptyProofLikeValue(value) {
  if (value == null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "" ||
      normalized === "0x" ||
      /\{\{\s*claim\./i.test(normalized) ||
      /^0x0+$/.test(normalized) ||
      normalized === String(mintAutomation.ZERO_BYTES_32 || "").toLowerCase()
    );
  }

  return false;
}

function taskRequiresManualLaunchReview(task, abiEntries = null) {
  if (hasClaimAutomation(task)) {
    return false;
  }

  const resolvedAbiEntries =
    abiEntries ||
    (() => {
      try {
        return parseTaskAbiEntries(task?.abiJson || "");
      } catch {
        return null;
      }
    })();

  if (!resolvedAbiEntries || !task?.mintFunction) {
    return false;
  }

  const mintEntry = findAbiFunctionEntry(resolvedAbiEntries, task.mintFunction);
  if (!mintEntry || !Array.isArray(mintEntry.inputs) || mintEntry.inputs.length === 0) {
    return false;
  }

  const args = parseJsonArraySafely(task.mintArgs, []);
  if (!Array.isArray(args)) {
    return true;
  }

  return mintEntry.inputs.some((input, index) => {
    const label = String(input?.name || "").toLowerCase();
    if (!/proof|merkle|allowlist|whitelist|allow|wl|sig|signature|voucher|permit|auth|signed/.test(label)) {
      return false;
    }

    return isEmptyProofLikeValue(args[index]);
  });
}

function taskHasAutomaticWaitGate(task) {
  const triggerMode = String(task?.executionTriggerMode || "standard").trim().toLowerCase();
  const mintStartDetectionConfig =
    task?.mintStartDetectionConfig && typeof task.mintStartDetectionConfig === "object"
      ? task.mintStartDetectionConfig
      : {};

  return Boolean(
    task?.readyCheckFunction ||
      (task?.mintStartDetectionEnabled &&
        (mintStartDetectionConfig.saleActiveFunction || mintStartDetectionConfig.stateFunction)) ||
      (triggerMode === "event" && task?.triggerEventSignature) ||
      (triggerMode === "mempool" && task?.triggerMempoolSignature) ||
      (triggerMode === "block" && task?.triggerBlockNumber)
  );
}

function resolveTaskAutoLaunchPlan(task, abiEntries = null) {
  const walletIds = Array.isArray(task?.walletIds) ? task.walletIds : [];
  const hasReadyState =
    Boolean(task?.contractAddress) &&
    Boolean(task?.abiJson) &&
    walletIds.length > 0 &&
    getTaskRpcNodes(task).length > 0;

  if (!task?.autoArm) {
    return {
      mode: "disabled",
      pending: false
    };
  }

  if (!hasReadyState) {
    return {
      mode: "not_ready",
      pending: false
    };
  }

  if (taskRequiresManualLaunchReview(task, abiEntries)) {
    return {
      mode: "review",
      pending: false
    };
  }

  const scheduledAt = scheduledTaskTimestamp(task);
  if (scheduledAt != null && scheduledAt > Date.now()) {
    return {
      mode: "scheduled",
      pending: false
    };
  }

  if (taskHasAutomaticWaitGate(task)) {
    return {
      mode: "watch",
      pending: true
    };
  }

  return {
    mode: "instant",
    pending: true
  };
}

function applyTaskAutoLaunchState(task, abiEntries = null) {
  const plan = resolveTaskAutoLaunchPlan(task, abiEntries);
  return {
    ...task,
    autoArmPending: plan.pending
  };
}

function describeAutoLaunchMode(mode) {
  if (mode === "scheduled") {
    return "scheduled from on-chain start time";
  }

  if (mode === "watch") {
    return "auto-armed and waiting for mint-open signals";
  }

  if (mode === "instant") {
    return "ready to launch immediately after save";
  }

  if (mode === "review") {
    return "needs manual proof or signature values";
  }

  if (mode === "not_ready") {
    return "waiting for wallets, ABI, contract, or RPC selection";
  }

  return "automatic launch disabled";
}

function detectMintPhaseType(entry) {
  const descriptor = buildPhaseDescriptor(entry);

  if (/gtd|guaranteed|holder|pass|vip|founder|reserve|og|earlyaccess/.test(descriptor)) {
    return "gtd";
  }

  if (/allowlist|whitelist|presale|presell|private|merkle|proof|voucher|signature|wl/.test(descriptor)) {
    return "allowlist";
  }

  if (/public|sale|open|live/.test(descriptor)) {
    return "public";
  }

  if (/mint|buy|purchase|claim|redeem/.test(descriptor)) {
    return "public";
  }

  return null;
}

function scoreMintPhaseCandidate(entry, phaseType) {
  const descriptor = buildPhaseDescriptor(entry);
  let score = mintFunctionCandidateScore(entry);

  if (phaseType === "gtd" && /gtd|guaranteed|holder|pass|vip|founder|reserve|og|earlyaccess/.test(descriptor)) {
    score += 12;
  }

  if (
    phaseType === "allowlist" &&
    /allowlist|whitelist|presale|presell|private|merkle|proof|voucher|signature|wl/.test(descriptor)
  ) {
    score += 12;
  }

  if (phaseType === "public" && /public|sale|open|live/.test(descriptor)) {
    score += 10;
  }

  if (
    phaseType === "public" &&
    !/allowlist|whitelist|presale|private|gtd|guaranteed|holder|pass|vip|founder|reserve/.test(
      descriptor
    )
  ) {
    score += 4;
  }

  if (Array.isArray(entry?.inputs)) {
    score -= entry.inputs.length;
  }

  if (phaseType === "allowlist" && hasProofLikeInput(entry)) {
    score += 3;
  }

  return score;
}

function buildMintPhaseCandidates(abiEntries) {
  const candidates = writableAbiFunctionEntries(abiEntries)
    .map((entry) => {
      const phaseType = detectMintPhaseType(entry);
      if (!phaseType) {
        return null;
      }

      return {
        ...entry,
        phaseType,
        score: scoreMintPhaseCandidate(entry, phaseType),
        signature: formatFunctionSignature(entry)
      };
    })
    .filter((candidate) => candidate && candidate.score > 0)
    .sort((left, right) => {
      const phaseDelta = mintPhaseOrder.indexOf(left.phaseType) - mintPhaseOrder.indexOf(right.phaseType);
      if (phaseDelta !== 0) {
        return phaseDelta;
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return (left.inputs?.length || 0) - (right.inputs?.length || 0);
    });

  const selected = [];
  const seenPhases = new Set();

  for (const candidate of candidates) {
    if (seenPhases.has(candidate.phaseType)) {
      continue;
    }

    selected.push(candidate);
    seenPhases.add(candidate.phaseType);
  }

  return selected;
}

function findAddressEligibilityReadFunction(abiEntries, preferredNames) {
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
      entry.inputs.length === 1 &&
      /^address$/i.test(String(entry.inputs[0]?.type || "")) &&
      Array.isArray(entry.outputs) &&
      entry.outputs.length >= 1 &&
      (String(entry.outputs[0]?.type || "").toLowerCase() === "bool" || isIntegerAbiType(entry.outputs[0]?.type)) &&
      ["view", "pure"].includes(entry.stateMutability)
    ) {
      return actualName;
    }
  }

  return null;
}

function findPhaseEligibilityFunction(abiEntries, phaseType) {
  if (phaseType === "gtd") {
    return findAddressEligibilityReadFunction(abiEntries, [
      "isGtdEligible",
      "isGuaranteedEligible",
      "isGuaranteed",
      "isHolderEligible",
      "isPassHolder",
      "hasMintPass",
      "hasPass",
      "holderEligible",
      "gtdEligible",
      "canHolderMint"
    ]);
  }

  if (phaseType === "allowlist") {
    return findAddressEligibilityReadFunction(abiEntries, [
      "isAllowlisted",
      "isWhitelist",
      "isWhitelisted",
      "allowlist",
      "whitelist",
      "allowlistEligible",
      "whitelistEligible",
      "presaleEligible",
      "canPresaleMint",
      "canAllowlistMint"
    ]);
  }

  return null;
}

function findPhaseActiveFunction(abiEntries, phaseType) {
  if (phaseType === "gtd") {
    return findMintStartReadFunction(
      abiEntries,
      [
        "gtdMintActive",
        "guaranteedMintActive",
        "holderMintActive",
        "passMintActive",
        "earlyAccessActive",
        "vipMintActive"
      ],
      (type) => /^bool$/i.test(String(type || ""))
    );
  }

  if (phaseType === "allowlist") {
    return findMintStartReadFunction(
      abiEntries,
      [
        "allowlistMintActive",
        "allowlistActive",
        "whitelistMintActive",
        "whitelistActive",
        "presaleMintActive",
        "presaleActive",
        "privateSaleActive"
      ],
      (type) => /^bool$/i.test(String(type || ""))
    );
  }

  return findMintStartReadFunction(
    abiEntries,
    [
      "publicMintActive",
      "publicSaleActive",
      "publicSaleOpen",
      "isPublicSaleOpen",
      "saleActive",
      "isSaleActive",
      "mintActive",
      "isMintActive"
    ],
    (type) => /^bool$/i.test(String(type || ""))
  );
}

function findPhaseStartTimeFunction(abiEntries, phaseType) {
  if (phaseType === "gtd") {
    return findMintStartReadFunction(
      abiEntries,
      [
        "gtdStartTime",
        "guaranteedStartTime",
        "holderMintStartTime",
        "passMintStartTime",
        "earlyAccessStartTime",
        "vipMintStartTime"
      ],
      (type) => isIntegerAbiType(type)
    );
  }

  if (phaseType === "allowlist") {
    return findMintStartReadFunction(
      abiEntries,
      [
        "allowlistStartTime",
        "allowlistMintStartTime",
        "whitelistStartTime",
        "whitelistMintStartTime",
        "presaleStartTime",
        "presaleMintStartTime",
        "privateSaleStartTime"
      ],
      (type) => isIntegerAbiType(type)
    );
  }

  return findMintStartReadFunction(
    abiEntries,
    [
      "publicSaleStartTime",
      "publicMintStartTime",
      "saleStartTime",
      "mintStartTime",
      "startTime"
    ],
    (type) => isIntegerAbiType(type)
  );
}

function normalizeContractTimestampValue(value) {
  const normalized =
    typeof value === "bigint"
      ? value
      : typeof value === "number" && Number.isFinite(value)
        ? BigInt(Math.trunc(value))
        : typeof value === "string" && /^\d+$/.test(value.trim())
          ? BigInt(value.trim())
          : null;

  if (normalized == null || normalized <= 0n) {
    return null;
  }

  const milliseconds = normalized > 1000000000000n ? normalized : normalized * 1000n;
  const safeMs = Number(milliseconds);
  if (!Number.isFinite(safeMs) || safeMs < 1577836800000 || safeMs > 4102444800000) {
    return null;
  }

  return new Date(safeMs).toISOString();
}

function truthyContractReadResult(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value > 0n;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  if (typeof value === "string") {
    return value.trim() !== "" && value.trim() !== "0";
  }

  return Boolean(value);
}

async function readMintPriceByNames(contract, abiEntries, preferredNames = []) {
  const namesByLower = abiFunctionNameMap(abiEntries);

  for (const preferredName of preferredNames) {
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
        priceSource: actualName
      };
    } catch {
      // Try the next candidate.
    }
  }

  return {
    priceEth: null,
    priceSource: null
  };
}

async function readPhasePrice(contract, abiEntries, phaseType) {
  const phaseSpecificNames = {
    gtd: ["gtdPrice", "holderPrice", "passPrice", "vipPrice"],
    allowlist: ["allowlistPrice", "whitelistPrice", "presalePrice", "wlPrice"],
    public: ["publicSalePrice", "publicMintPrice", "publicPrice", "salePrice"]
  };

  const specificResult = await readMintPriceByNames(contract, abiEntries, phaseSpecificNames[phaseType] || []);
  if (specificResult.priceEth != null) {
    return specificResult;
  }

  return readMintPriceByNames(contract, abiEntries, [
    "mintPrice",
    "price",
    "cost",
    "mintCost",
    "mintFee",
    "getMintPrice",
    "getPrice"
  ]);
}

async function readPhaseStartTime(contract, abiEntries, phaseType) {
  const functionName = findPhaseStartTimeFunction(abiEntries, phaseType);
  if (!functionName) {
    return {
      waitUntilIso: null,
      source: null
    };
  }

  try {
    const value = await contract[functionName]();
    return {
      waitUntilIso: normalizeContractTimestampValue(value),
      source: functionName
    };
  } catch {
    return {
      waitUntilIso: null,
      source: functionName
    };
  }
}

function getTaskRpcNodes(task) {
  const rpcNodeIds = Array.isArray(task?.rpcNodeIds) ? task.rpcNodeIds : [];
  return (appState?.rpcNodes || []).filter(
    (node) =>
      node.enabled &&
      node.chainKey === task.chainKey &&
      (rpcNodeIds.length === 0 || rpcNodeIds.includes(node.id))
  );
}

async function createReadProviderForTask(task) {
  const taskRpcNodes = getTaskRpcNodes(task);
  if (taskRpcNodes.length === 0) {
    return {
      provider: null,
      rpcNode: null,
      warning: `No enabled RPC nodes configured for ${task.chainKey}`
    };
  }

  let lastError = null;

  for (const rpcNode of taskRpcNodes) {
    const provider = /^wss?:\/\//i.test(String(rpcNode.url || ""))
      ? new ethers.WebSocketProvider(rpcNode.url)
      : new ethers.JsonRpcProvider(rpcNode.url);

    try {
      await provider.getBlockNumber();
      return {
        provider,
        rpcNode,
        warning: null
      };
    } catch (error) {
      if (typeof provider.destroy === "function") {
        await provider.destroy().catch(() => {});
      }
      lastError = error;
    }
  }

  return {
    provider: null,
    rpcNode: null,
    warning: lastError ? `Unable to reach configured RPC nodes: ${formatError(lastError)}` : null
  };
}

function classifyEligibilityError(phaseType, message = "") {
  const normalized = String(message || "").toLowerCase();
  if (!normalized) {
    return "review";
  }

  if (/not active|not live|not open|sale not|mint not|closed|paused|not started|before start|hasn't started|has not started/.test(normalized)) {
    return "not_open";
  }

  if (/sold out|max supply|supply exceeded|no tokens left|mint closed/.test(normalized)) {
    return "ineligible";
  }

  if (
    /not whitelisted|not allowlisted|not eligible|not on list|not in allowlist|not in whitelist|not authorized|not approved|must hold|holder required|pass required/.test(
      normalized
    )
  ) {
    return "ineligible";
  }

  if (/invalid proof|proof|merkle|signature|voucher|permit/.test(normalized)) {
    return phaseType === "public" ? "review" : "review";
  }

  if (/gtd|guaranteed|holder|pass|vip|founder|reserve|og/.test(normalized)) {
    return phaseType === "gtd" ? "review" : "ineligible";
  }

  return "review";
}

async function evaluateWalletPhaseEligibility({
  provider,
  contractAddress,
  abiEntries,
  candidate,
  walletAddress,
  quantityPerWallet,
  eligibilityFunction,
  phasePriceEth,
  phaseType
}) {
  if (phaseType === "public") {
    return {
      status: "eligible",
      source: "phase_public"
    };
  }

  const contract = new ethers.Contract(contractAddress, abiEntries, provider);

  if (eligibilityFunction) {
    try {
      const result = await contract[eligibilityFunction](walletAddress);
      return {
        status: truthyContractReadResult(result) ? "eligible" : "ineligible",
        source: `view:${eligibilityFunction}`
      };
    } catch {
      // Fall through to simulation when the view function is not callable.
    }
  }

  const argResolution = mintAutomation.resolveFunctionArgsFromEntry(candidate, {
    walletAddress,
    quantity: quantityPerWallet
  });

  if (!argResolution.supported) {
    return {
      status: "review",
      source: "unsupported_args",
      reason: argResolution.reason
    };
  }

  const runner = new ethers.VoidSigner(walletAddress, provider);
  const contractWithRunner = new ethers.Contract(contractAddress, abiEntries, runner);
  const method = contractWithRunner.getFunction(candidate.name);
  const overrides = {};
  if (String(candidate.stateMutability || "").toLowerCase() === "payable" && phasePriceEth) {
    try {
      overrides.value = ethers.parseEther(String(phasePriceEth)) * BigInt(Math.max(1, quantityPerWallet));
    } catch {
      // Keep zero-value simulation if the parsed price is invalid.
    }
  }

  try {
    await method.staticCall(...argResolution.args, overrides);
    return {
      status: "eligible",
      source: "simulation"
    };
  } catch (error) {
    const errorMessage = formatError(error);
    const classification = classifyEligibilityError(phaseType, errorMessage);
    if (classification === "not_open" && !hasProofLikeInput(candidate)) {
      return {
        status: "eligible",
        source: "simulation:not_open",
        reason: errorMessage
      };
    }

    return {
      status: classification === "ineligible" ? "ineligible" : "review",
      source: `simulation:${classification}`,
      reason: errorMessage
    };
  }
}

function mergeTaskNotes(...parts) {
  return parts
    .flat()
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" | ");
}

function buildPhaseTaskName(baseName, phaseType) {
  return `${baseName} · ${mintPhaseLabels[phaseType] || phaseType}`;
}

function maxNumericString(currentValue, minimumValue) {
  const current = Number(currentValue || 0);
  const minimum = Number(minimumValue || 0);

  if (!Number.isFinite(current) || current <= 0) {
    return String(minimum);
  }

  return String(Math.max(current, minimum));
}

function minPositiveNumericString(currentValue, preferredValue) {
  const current = Number(currentValue || 0);
  const preferred = Number(preferredValue || 0);

  if (!Number.isFinite(current) || current <= 0) {
    return String(preferred);
  }

  return String(Math.min(current, preferred));
}

function applyPhaseGasProfile(task, phaseType) {
  const profile = mintPhaseGasProfiles[phaseType];
  if (!profile) {
    return task;
  }

  return {
    ...task,
    priority: profile.priority,
    gasStrategy: profile.gasStrategy,
    gasBoostPercent: maxNumericString(task.gasBoostPercent, profile.gasBoostPercent),
    priorityBoostPercent: maxNumericString(task.priorityBoostPercent, profile.priorityBoostPercent),
    maxRetries: maxNumericString(task.maxRetries, profile.maxRetries),
    retryDelayMs: minPositiveNumericString(task.retryDelayMs, profile.retryDelayMs)
  };
}

function isoTimestampValue(isoString) {
  if (!isoString) {
    return null;
  }

  const value = new Date(isoString).getTime();
  return Number.isNaN(value) ? null : value;
}

function resolvePhaseWaitUntil(baseWaitUntilIso, detectedWaitUntilIso) {
  const now = Date.now();
  const detectedMs = isoTimestampValue(detectedWaitUntilIso);
  if (detectedMs != null && detectedMs > now) {
    return detectedWaitUntilIso;
  }

  const baseMs = isoTimestampValue(baseWaitUntilIso);
  if (baseMs != null && baseMs > now) {
    return baseWaitUntilIso;
  }

  return detectedWaitUntilIso || baseWaitUntilIso || "";
}

function buildPhaseTaskReadyState(task, abiEntries, phaseType, phaseWaitUntilIso) {
  const phaseActiveFunction = findPhaseActiveFunction(abiEntries, phaseType);
  const baseMintStartDetection =
    task.mintStartDetectionConfig && typeof task.mintStartDetectionConfig === "object"
      ? task.mintStartDetectionConfig
      : {};

  return {
    useSchedule: Boolean(phaseWaitUntilIso),
    waitUntilIso: phaseWaitUntilIso || "",
    schedulePending:
      Boolean(phaseWaitUntilIso) &&
      !Number.isNaN(new Date(phaseWaitUntilIso).getTime()) &&
      new Date(phaseWaitUntilIso).getTime() > Date.now(),
    readyCheckFunction: phaseActiveFunction || task.readyCheckFunction,
    readyCheckArgs: phaseActiveFunction ? "[]" : task.readyCheckArgs,
    readyCheckMode: phaseActiveFunction ? "truthy" : task.readyCheckMode,
    readyCheckExpected: phaseActiveFunction ? "" : task.readyCheckExpected,
    mintStartDetectionEnabled: Boolean(phaseActiveFunction || task.mintStartDetectionEnabled),
    mintStartDetectionConfig:
      phaseActiveFunction || Object.keys(baseMintStartDetection).length > 0
        ? {
            ...baseMintStartDetection,
            saleActiveFunction: phaseActiveFunction || baseMintStartDetection.saleActiveFunction || null,
            pollIntervalMs: 500
          }
        : null
  };
}

async function buildPhaseTasksFromTask(task, abiEntries) {
  const candidates = buildMintPhaseCandidates(abiEntries);
  if (!candidates.length) {
    return [];
  }

  const selectedWallets = appState.wallets.filter((wallet) => (task.walletIds || []).includes(wallet.id));
  if (!selectedWallets.length) {
    return [];
  }

  const { provider, rpcNode, warning } = await createReadProviderForTask(task);
  const contract =
    provider && ethers.isAddress(task.contractAddress)
      ? new ethers.Contract(task.contractAddress, abiEntries, provider)
      : null;

  const phaseTasks = [];

  for (const candidate of candidates) {
    const phaseType = candidate.phaseType;
    const priceInfo = contract ? await readPhasePrice(contract, abiEntries, phaseType) : { priceEth: null, priceSource: null };
    const startTimeInfo = contract ? await readPhaseStartTime(contract, abiEntries, phaseType) : { waitUntilIso: null, source: null };
    const eligibilityFunction = findPhaseEligibilityFunction(abiEntries, phaseType);
    const eligibleWalletIds = [];
    const reviewWalletIds = [];
    const ineligibleWalletLabels = [];

    for (const wallet of selectedWallets) {
      if (!provider) {
        reviewWalletIds.push(wallet.id);
        continue;
      }

      const eligibility = await evaluateWalletPhaseEligibility({
        provider,
        contractAddress: task.contractAddress,
        abiEntries,
        candidate,
        walletAddress: wallet.address,
        quantityPerWallet: task.quantityPerWallet,
        eligibilityFunction,
        phasePriceEth: priceInfo.priceEth,
        phaseType
      });

      if (eligibility.status === "eligible") {
        eligibleWalletIds.push(wallet.id);
        continue;
      }

      if (eligibility.status === "review") {
        reviewWalletIds.push(wallet.id);
        continue;
      }

      ineligibleWalletLabels.push(wallet.label || wallet.addressShort || wallet.address);
    }

    const phaseWalletIds =
      phaseType === "public"
        ? selectedWallets.map((wallet) => wallet.id)
        : eligibleWalletIds.length > 0
          ? [...new Set([...eligibleWalletIds, ...reviewWalletIds])]
          : reviewWalletIds;

    if (!phaseWalletIds.length) {
      continue;
    }

    const argResolution = mintAutomation.resolveFunctionArgsFromEntry(candidate, {
      walletAddress: "{{wallet}}",
      quantity: task.quantityPerWallet
    });

    const phaseWaitUntilIso = resolvePhaseWaitUntil(task.waitUntilIso, startTimeInfo.waitUntilIso);
    const readyState = buildPhaseTaskReadyState(task, abiEntries, phaseType, phaseWaitUntilIso);
    const reviewNeeded =
      reviewWalletIds.length > 0 ||
      (!provider && Boolean(warning)) ||
      (hasProofLikeInput(candidate) && !hasClaimAutomation(task));
    const phaseTags = [...new Set([...(task.tags || []), "auto-phase", mintPhaseLabels[phaseType].toLowerCase()])];
    if (reviewNeeded) {
      phaseTags.push("review");
    }

    const phaseDraft = applyPhaseGasProfile(
      {
        ...task,
        id: createId("task"),
        name: buildPhaseTaskName(task.name, phaseType),
        tags: phaseTags,
        walletIds: phaseWalletIds,
        mintFunction: candidate.name,
        mintArgs: argResolution.supported ? JSON.stringify(argResolution.args) : task.mintArgs,
        priceEth: priceInfo.priceEth || task.priceEth || "0",
        platform:
          phaseType === "allowlist"
            ? "Allowlist Mint"
            : phaseType === "public"
              ? "ERC721 Public Mint"
              : "Generic EVM (auto-detect)",
        status: "draft",
        done: false,
        autoArm: task.autoArm !== false,
        ...readyState,
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
      },
      phaseType
    );
    const autoLaunchPlan = resolveTaskAutoLaunchPlan(phaseDraft, abiEntries);
    const phaseNotes = mergeTaskNotes(
      task.notes,
      `Auto-generated ${mintPhaseLabels[phaseType]} phase using ${candidate.signature}`,
      eligibleWalletIds.length > 0 ? `${eligibleWalletIds.length} wallet(s) confirmed eligible` : "",
      reviewWalletIds.length > 0
        ? `${reviewWalletIds.length} wallet(s) need review before launch`
        : "",
      ineligibleWalletLabels.length > 0
        ? `${ineligibleWalletLabels.length} wallet(s) excluded as ineligible`
        : "",
      eligibilityFunction ? `Eligibility check: ${eligibilityFunction}(address)` : "",
      priceInfo.priceSource ? `Price source: ${priceInfo.priceSource}` : "",
      startTimeInfo.source ? `Start source: ${startTimeInfo.source}` : "",
      rpcNode?.name ? `Planner RPC: ${rpcNode.name}` : "",
      `Auto launch: ${describeAutoLaunchMode(autoLaunchPlan.mode)}`,
      warning || "",
      (hasProofLikeInput(candidate) || hasSignatureLikeInput(candidate)) && !hasClaimAutomation(task)
        ? "Proof or signature inputs may still need manual values."
        : "",
      !argResolution.supported ? `Args need review: ${argResolution.reason}` : ""
    );

    phaseTasks.push(
      applyTaskAutoLaunchState(
        {
          ...phaseDraft,
          notes: phaseNotes
        },
        abiEntries
      )
    );
  }

  return phaseTasks.sort(
    (left, right) =>
      mintPhaseOrder.indexOf((left.tags || []).find((tag) => mintPhaseOrder.includes(tag)) || "public") -
      mintPhaseOrder.indexOf((right.tags || []).find((tag) => mintPhaseOrder.includes(tag)) || "public")
  );
}

function summarizePhaseEligibility(entries = []) {
  const summary = {
    eligible: [],
    review: [],
    ineligible: []
  };

  entries.forEach((entry) => {
    if (entry.status === "eligible") {
      summary.eligible.push(entry.walletLabel);
      return;
    }

    if (entry.status === "ineligible") {
      summary.ineligible.push(entry.walletLabel);
      return;
    }

    summary.review.push(entry.walletLabel);
  });

  return summary;
}

function buildPhaseEligibilityPreview(summary, selectedWalletCount) {
  if (!selectedWalletCount) {
    return {
      status: "no_wallets",
      label: "Select wallet(s) to check eligibility"
    };
  }

  const parts = [];
  if (summary.eligible.length > 0) {
    parts.push(`${summary.eligible.length} eligible`);
  }
  if (summary.review.length > 0) {
    parts.push(`${summary.review.length} review`);
  }
  if (summary.ineligible.length > 0) {
    parts.push(`${summary.ineligible.length} excluded`);
  }

  return {
    status:
      summary.eligible.length > 0
        ? "eligible"
        : summary.review.length > 0
          ? "review"
          : "ineligible",
    label: parts.join(" · ") || `${selectedWalletCount} wallet(s) selected`
  };
}

async function buildPhaseAutofillPreview({
  chainKey,
  contractAddress,
  abiEntries,
  walletIds = [],
  rpcNodeIds = [],
  quantityPerWallet = 1,
  claimTaskSettings = {}
}) {
  const candidates = buildMintPhaseCandidates(abiEntries);
  if (!candidates.length) {
    return [];
  }

  const selectedWallets = (appState?.wallets || []).filter((wallet) => (walletIds || []).includes(wallet.id));
  const hasValidContract = Boolean(chainKey) && ethers.isAddress(contractAddress);
  const { provider, rpcNode, warning } =
    hasValidContract && chainKey
      ? await createReadProviderForChain(chainKey, rpcNodeIds)
      : {
          provider: null,
          rpcNode: null,
          warning: chainKey ? null : "Select a chain to verify phase eligibility"
        };
  const contract = provider && hasValidContract ? new ethers.Contract(contractAddress, abiEntries, provider) : null;

  return Promise.all(
    candidates.map(async (candidate) => {
      const phaseType = candidate.phaseType;
      const eligibilityFunction = findPhaseEligibilityFunction(abiEntries, phaseType);
      const priceInfo = contract
        ? await readPhasePrice(contract, abiEntries, phaseType)
        : { priceEth: null, priceSource: null };
      const startTimeInfo = contract
        ? await readPhaseStartTime(contract, abiEntries, phaseType)
        : { waitUntilIso: null, source: null };
      const eligibilityEntries = [];

      if (selectedWallets.length > 0) {
        if (!hasValidContract) {
          selectedWallets.forEach((wallet) => {
            eligibilityEntries.push({
              walletId: wallet.id,
              walletLabel: wallet.label || wallet.addressShort || wallet.address,
              status: "review",
              source: "missing_contract",
              reason: "Add a valid contract address to check eligibility"
            });
          });
        } else if (!provider) {
          selectedWallets.forEach((wallet) => {
            eligibilityEntries.push({
              walletId: wallet.id,
              walletLabel: wallet.label || wallet.addressShort || wallet.address,
              status: "review",
              source: "missing_rpc",
              reason: warning || "Add an RPC node for this chain to check eligibility"
            });
          });
        } else {
          for (const wallet of selectedWallets) {
            const eligibility = await evaluateWalletPhaseEligibility({
              provider,
              contractAddress,
              abiEntries,
              candidate,
              walletAddress: wallet.address,
              quantityPerWallet,
              eligibilityFunction,
              phasePriceEth: priceInfo.priceEth,
              phaseType
            });

            eligibilityEntries.push({
              walletId: wallet.id,
              walletLabel: wallet.label || wallet.addressShort || wallet.address,
              ...eligibility
            });
          }
        }
      }

      const readyState = buildPhaseTaskReadyState(
        {
          autoArm: true,
          abiJson: JSON.stringify(abiEntries),
          ...claimTaskSettings,
          mintStartDetectionEnabled: false,
          mintStartDetectionConfig: null,
          readyCheckFunction: "",
          readyCheckArgs: "[]",
          readyCheckMode: "truthy",
          readyCheckExpected: "",
          executionTriggerMode: "standard",
          triggerEventSignature: "",
          triggerMempoolSignature: "",
          triggerBlockNumber: "",
          useSchedule: false,
          waitUntilIso: "",
          walletIds: ["preview"],
          rpcNodeIds: [],
          chainKey,
          contractAddress,
          mintFunction: candidate.name,
          mintArgs: JSON.stringify(
            mintAutomation.resolveFunctionArgsFromEntry(candidate, {
              walletAddress: "{{wallet}}",
              quantity: quantityPerWallet
            }).args || []
          )
        },
        abiEntries,
        phaseType,
        startTimeInfo.waitUntilIso
      );
      const previewTask = applyTaskAutoLaunchState(
        {
          autoArm: true,
          abiJson: JSON.stringify(abiEntries),
          ...claimTaskSettings,
          chainKey,
          contractAddress,
          walletIds: ["preview"],
          rpcNodeIds: [],
          mintFunction: candidate.name,
          mintArgs: JSON.stringify(
            mintAutomation.resolveFunctionArgsFromEntry(candidate, {
              walletAddress: "{{wallet}}",
              quantity: quantityPerWallet
            }).args || []
          ),
          executionTriggerMode: "standard",
          triggerEventSignature: "",
          triggerMempoolSignature: "",
          triggerBlockNumber: "",
          ...readyState
        },
        abiEntries
      );
      const autoLaunchPlan = resolveTaskAutoLaunchPlan(previewTask, abiEntries);
      const eligibilitySummary = summarizePhaseEligibility(eligibilityEntries);
      const eligibilityPreview = buildPhaseEligibilityPreview(
        eligibilitySummary,
        selectedWallets.length
      );

      return {
        phaseType,
        label: mintPhaseLabels[phaseType] || phaseType,
        mintFunction: candidate.name,
        signature: candidate.signature,
        priceEth: priceInfo.priceEth,
        priceSource: priceInfo.priceSource,
        waitUntilIso: startTimeInfo.waitUntilIso,
        startTimeSource: startTimeInfo.source,
        autoLaunchMode: autoLaunchPlan.mode,
        autoLaunchLabel: describeAutoLaunchMode(autoLaunchPlan.mode),
        eligibilityStatus: eligibilityPreview.status,
        eligibilityLabel: eligibilityPreview.label,
        eligibilityWallets: eligibilityEntries,
        eligibleWalletLabels: eligibilitySummary.eligible,
        reviewWalletLabels: eligibilitySummary.review,
        ineligibleWalletLabels: eligibilitySummary.ineligible,
        requiresReview: taskRequiresManualLaunchReview(previewTask, abiEntries),
        rpcNodeName: rpcNode?.name || null,
        warning:
          warning ||
          (!hasValidContract ? "Add a valid contract address to read on-chain phase data" : null)
      };
    })
  );
}

async function buildMintAutofill({
  chainKey,
  contractAddress,
  abiEntries,
  requestedFunction = "",
  walletIds = [],
  rpcNodeIds = [],
  quantityPerWallet = 1,
  claimTaskSettings = {}
}) {
  const seaDropAutofill = await buildSeaDropPublicAutofill({
    chainKey,
    nftContractAddress: contractAddress,
    abiEntries,
    walletIds,
    rpcNodeIds,
    quantityPerWallet
  });
  if (seaDropAutofill) {
    return seaDropAutofill;
  }

  const resolvedMintFunction = resolveMintFunctionFromAbi(abiEntries, requestedFunction);
  const warnings = [];
  const mintStartDetection = detectMintStartFunctionsFromAbi(abiEntries);
  const priceResolution =
    chainKey && contractAddress && ethers.isAddress(contractAddress)
      ? await inferMintPriceFromContract({ chainKey, contractAddress, abiEntries, rpcNodeIds })
      : {
          priceEth: null,
          priceSource: null,
          warning: contractAddress ? "Contract address must be a valid EVM address for price detection" : null,
          rpcNodeName: null
        };

  if (priceResolution.warning) {
    warnings.push(priceResolution.warning);
  }

  const phasePreview = await buildPhaseAutofillPreview({
    chainKey,
    contractAddress,
    abiEntries,
    walletIds,
    rpcNodeIds,
    quantityPerWallet,
    claimTaskSettings
  });

  return {
    mintFunction: resolvedMintFunction.mintFunction,
    mintArgs: inferMintArgsFromAbi(
      abiEntries,
      resolvedMintFunction.mintFunction,
      Math.max(1, Number(quantityPerWallet || 1))
    ),
    quantityPerWallet: Math.max(1, Number(quantityPerWallet || 1)),
    priceEth: priceResolution.priceEth || "0",
    platform: inferTaskPlatformFromAbi(abiEntries, resolvedMintFunction.mintFunction),
    detectedMintFunctions: resolvedMintFunction.detectedFunctions,
    mintStartDetection,
    phasePreview,
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
      const normalizedPrivateKey = validateResolvedPrivateKey(privateKey);
      const address = deriveAddress(normalizedPrivateKey);
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
      keyMap.set(id, normalizedPrivateKey);
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

function buildAlchemyRpcUrl(endpointKey, apiKey, transport = "http") {
  const protocol = transport === "ws" ? "wss" : "https";
  return `${protocol}://${endpointKey}.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
}

function buildDrpcRpcUrl(networkKey, apiKey, transport = "http") {
  const protocol = transport === "ws" ? "wss" : "https";
  const hostname = transport === "ws" ? "lb.drpc.org" : "lb.drpc.live";
  return `${protocol}://${hostname}/${networkKey}/${encodeURIComponent(apiKey)}`;
}

function findAlchemyRpcImportEntry(chain) {
  if (!chain) {
    return null;
  }

  const normalizedChainId = Number(chain.chainId);
  if (Number.isFinite(normalizedChainId)) {
    const byChainId = alchemyRpcImportCatalog.find((entry) => Number(entry.chainId) === normalizedChainId);
    if (byChainId) {
      return byChainId;
    }
  }

  const normalizedKey = String(chain.key || "").trim();
  if (normalizedKey) {
    const byKey = alchemyRpcImportCatalog.find((entry) => String(entry.chainKey || "").trim() === normalizedKey);
    if (byKey) {
      return byKey;
    }
  }

  const normalizedTerms = new Set(
    [chain.key, chain.label].map((value) => normalizeChainSearchQuery(value)).filter(Boolean)
  );
  return (
    alchemyRpcImportCatalog.find((entry) =>
      normalizedTerms.has(normalizeChainSearchQuery(entry.chainKey)) ||
      normalizedTerms.has(normalizeChainSearchQuery(entry.label))
    ) || null
  );
}

function findDrpcRpcImportEntry(chain) {
  if (!chain) {
    return null;
  }

  const normalizedChainId = Number(chain.chainId);
  if (Number.isFinite(normalizedChainId)) {
    const byChainId = drpcRpcImportCatalog.find((entry) => Number(entry.chainId) === normalizedChainId);
    if (byChainId) {
      return byChainId;
    }
  }

  const normalizedKey = String(chain.key || "").trim();
  if (normalizedKey) {
    const byKey = drpcRpcImportCatalog.find((entry) => String(entry.chainKey || "").trim() === normalizedKey);
    if (byKey) {
      return byKey;
    }
  }

  const normalizedTerms = new Set(
    [chain.key, chain.label].map((value) => normalizeChainSearchQuery(value)).filter(Boolean)
  );
  return (
    drpcRpcImportCatalog.find((entry) =>
      normalizedTerms.has(normalizeChainSearchQuery(entry.chainKey)) ||
      normalizedTerms.has(normalizeChainSearchQuery(entry.label))
    ) || null
  );
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
  return findAvailableChainByKey(chainKey)?.label || chainKey || "Unknown";
}

function normalizeOpenSeaChainKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) {
    return "";
  }

  return openseaChainKeyAliases.get(normalized) || normalized;
}

function chooseOpenSeaCollectionContract(contracts = [], options = {}) {
  const candidates = (Array.isArray(contracts) ? contracts : [])
    .filter((entry) => entry?.address && ethers.isAddress(entry.address))
    .map((entry) => ({
      ...entry,
      resolvedChainKey: normalizeOpenSeaChainKey(entry.chain)
    }));

  if (candidates.length === 0) {
    return null;
  }

  const preferredChainKeys = [
    options.preferredChainKey,
    options.chainHint,
    options.fallbackChainKey
  ]
    .map((entry) => normalizeOpenSeaChainKey(entry))
    .filter(Boolean);

  for (const preferredChainKey of preferredChainKeys) {
    const matchedCandidate = candidates.find((entry) => entry.resolvedChainKey === preferredChainKey);
    if (matchedCandidate) {
      return matchedCandidate;
    }
  }

  return candidates.find((entry) => entry.resolvedChainKey) || candidates[0];
}

function normalizeWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value = "") {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };

  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalizedEntity = String(entity || "").toLowerCase();

    if (normalizedEntity in namedEntities) {
      return namedEntities[normalizedEntity];
    }

    if (normalizedEntity.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalizedEntity.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return match;
  });
}

function stripHtmlTags(value = "") {
  return normalizeWhitespace(
    decodeHtmlEntities(
      String(value || "")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function collapseRepeatedText(value = "") {
  const normalized = normalizeWhitespace(value);
  const repeatedMatch = normalized.match(/^(.{20,}?)\s+\1$/i);
  return repeatedMatch ? repeatedMatch[1].trim() : normalized;
}

function stripOpenSeaWidgetCssNoise(value = "") {
  return normalizeWhitespace(
    String(value || "")
      .replace(/(?:[a-z0-9_-]*[:.\[]+[a-z0-9:_\-\[\]\(\).,'"=]*\s*)+\{[^{}]*\}/gi, " ")
      .replace(/:[a-z-]+(?:\([^)]*\))?\s*\{[^{}]*\}/gi, " ")
      .replace(/\b(?:display|direction|white-space|line-height|will-change|padding|transform)\s*:\s*[^; ]+[;]?/gi, " ")
      .replace(/\bvar\([^)]*\)/gi, " ")
      .replace(/\b(?:inline-block|nowrap|important|symbol|digit|number|ltr)\b/gi, " ")
  );
}

function hasOpenSeaWidgetCssNoise(value = "") {
  return /:host\s*\{|number-flow-|display\s*:|white-space\s*:|will-change\s*:/i.test(String(value || ""));
}

function extractOpenSeaMintRadarContext(html = "", startIndex = 0, anchorLength = 0) {
  const rawHtml = String(html || "");
  const sliceStart = Math.max(0, Number(startIndex || 0) - 220);
  const sliceEnd = Math.min(rawHtml.length, Number(startIndex || 0) + Number(anchorLength || 0) + 1800);
  return collapseRepeatedText(stripHtmlTags(rawHtml.slice(sliceStart, sliceEnd)));
}

function extractOpenSeaCollectionSlug(value = "") {
  try {
    const url = new URL(String(value || ""), openSeaDropsBaseUrl);
    const pathname = decodeURIComponent(url.pathname || "");
    const match = pathname.match(/^\/(?:[a-z]{2}\/)?collection\/([^/?#]+)/i);
    return match ? normalizeWhitespace(match[1]) : "";
  } catch {
    return "";
  }
}

function normalizeOpenSeaMintRadarStatus(text = "") {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  if (/\bminting now\b|\bstatus minting\b|\blive now\b/.test(normalized)) {
    return "live";
  }

  if (/\bmint starts in\b|\bcoming soon\b|\bupcoming\b|\bstarts in\b/.test(normalized)) {
    return "upcoming";
  }

  return "unknown";
}

function shouldKeepOpenSeaMintRadarCard(text = "") {
  const normalized = String(text || "").toLowerCase();
  const hasMintWord = /\bmint/.test(normalized);
  const hasLaunchSignal =
    /\bminting now\b|\bmint starts in\b|\bmint price\b|\bstatus minting\b|\beligible\b/.test(normalized);
  return hasMintWord && hasLaunchSignal;
}

function extractOpenSeaMintRadarMetadata(text = "") {
  const normalized = collapseRepeatedText(stripOpenSeaWidgetCssNoise(text));
  const creatorMatch = normalized.match(
    /\bBy\s+(.+?)(?=\s+(?:Minting now|Status Minting|Mint price|Total items|Items minted|Mint starts in)\b|$)/i
  );
  const nameMatch = normalized.match(
    /^(.*?)(?=\s+(?:By\s+.+?\s+)?(?:Minting now|Status Minting|Mint price|Mint starts in|Total items)\b|$)/i
  );
  const priceMatch = normalized.match(
    /(?:\bminting now\b|\bmint price\b)\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)/i
  );
  const startsMatch = normalized.match(
    /\bMint starts in\b\s+(.+?)(?=\s+(?:Mint price|Total items|Items minted|Status)\b|$)/i
  );
  const totalItemsMatch = normalized.match(/\bTotal items\b\s+([0-9,]+|Open edition)/i);
  const mintedCountMatch = normalized.match(/\bItems minted\b\s+([0-9,]+)/i);
  const status = normalizeOpenSeaMintRadarStatus(normalized);

  const summaryParts = [];
  if (priceMatch) {
    summaryParts.push(`Mint price ${priceMatch[1]} ${String(priceMatch[2] || "").toUpperCase()}`);
  }
  if (startsMatch) {
    summaryParts.push(`Starts in ${normalizeWhitespace(startsMatch[1])}`);
  } else if (status === "live") {
    summaryParts.push("Minting now");
  }
  if (totalItemsMatch) {
    summaryParts.push(`Total items ${normalizeWhitespace(totalItemsMatch[1])}`);
  }
  if (mintedCountMatch) {
    summaryParts.push(`Items minted ${normalizeWhitespace(mintedCountMatch[1])}`);
  }

  return {
    rawText: normalized,
    name: normalizeWhitespace(nameMatch?.[1] || ""),
    creator: normalizeWhitespace(creatorMatch?.[1] || ""),
    status,
    priceText: priceMatch ? `${priceMatch[1]} ${String(priceMatch[2] || "").toUpperCase()}` : "",
    scheduleText: startsMatch ? `Starts in ${normalizeWhitespace(startsMatch[1])}` : "",
    totalItemsText: normalizeWhitespace(totalItemsMatch?.[1] || ""),
    mintedCountText: normalizeWhitespace(mintedCountMatch?.[1] || ""),
    summary: summaryParts.join(" · ")
  };
}

function mergeOpenSeaMintRadarEntries(baseEntry, candidateEntry) {
  if (!baseEntry) {
    return candidateEntry;
  }

  const mergedStatus =
    baseEntry.status === "live" || candidateEntry.status === "live"
      ? "live"
      : baseEntry.status === "upcoming" || candidateEntry.status === "upcoming"
        ? "upcoming"
        : baseEntry.status || candidateEntry.status || "unknown";

  return {
    ...baseEntry,
    ...candidateEntry,
    name:
      candidateEntry.name && candidateEntry.name.length >= (baseEntry.name || "").length
        ? candidateEntry.name
        : baseEntry.name || candidateEntry.name,
    creator: baseEntry.creator || candidateEntry.creator,
    priceText: baseEntry.priceText || candidateEntry.priceText,
    scheduleText: baseEntry.scheduleText || candidateEntry.scheduleText,
    totalItemsText: baseEntry.totalItemsText || candidateEntry.totalItemsText,
    mintedCountText: baseEntry.mintedCountText || candidateEntry.mintedCountText,
    summary: baseEntry.summary || candidateEntry.summary,
    warnings: [...new Set([...(baseEntry.warnings || []), ...(candidateEntry.warnings || [])])],
    sources: [...new Set([...(baseEntry.sources || []), ...(candidateEntry.sources || [])])],
    status: mergedStatus
  };
}

function parseOpenSeaMintRadarEntries(html = "", options = {}) {
  const pageLabel = normalizeWhitespace(options.pageLabel || "OpenSea Drops");
  const baseUrl = options.baseUrl || openSeaDropsBaseUrl;
  const rawHtml = String(html || "");
  const entriesBySlug = new Map();
  const anchorPattern =
    /<a\b[^>]*href=(["'])([^"'#>]+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match = null;

  while ((match = anchorPattern.exec(rawHtml))) {
    const [, , hrefValue, anchorHtml] = match;
    const slug = extractOpenSeaCollectionSlug(hrefValue);
    if (!slug) {
      continue;
    }

    const rawAnchorText = collapseRepeatedText(stripHtmlTags(anchorHtml));
    const contextText = extractOpenSeaMintRadarContext(rawHtml, match.index, match[0]?.length || 0);
    const candidateText = shouldKeepOpenSeaMintRadarCard(rawAnchorText) ? rawAnchorText : contextText;
    if (!shouldKeepOpenSeaMintRadarCard(candidateText)) {
      continue;
    }

    const metadata = extractOpenSeaMintRadarMetadata(candidateText);
    if (!metadata.name) {
      continue;
    }

    const url = new URL(hrefValue, baseUrl);
    const entry = {
      slug,
      name: metadata.name,
      creator: metadata.creator,
      status: metadata.status,
      url: `https://opensea.io/collection/${encodeURIComponent(slug)}`,
      priceText: metadata.priceText,
      scheduleText: metadata.scheduleText,
      totalItemsText: metadata.totalItemsText,
      mintedCountText: metadata.mintedCountText,
      summary: metadata.summary || metadata.rawText,
      rawText: metadata.rawText,
      sources: [pageLabel],
      warnings: []
    };

    if (hasOpenSeaWidgetCssNoise(rawAnchorText) || hasOpenSeaWidgetCssNoise(contextText)) {
      entry.warnings.push("OpenSea countdown widget noise was stripped from this drop card.");
    }

    if (url.hostname && !/opensea\.io$/i.test(url.hostname)) {
      entry.warnings.push(`Parsed a non-OpenSea hostname for ${slug}.`);
    }

    entriesBySlug.set(slug, mergeOpenSeaMintRadarEntries(entriesBySlug.get(slug), entry));
  }

  return [...entriesBySlug.values()];
}

async function fetchOpenSeaDropsHtml(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), openSeaMintRadarFetchTimeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OpenSea Drops request failed with status ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("OpenSea Drops request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function enrichOpenSeaMintRadarEntries(entries = [], apiKey = "") {
  if (!apiKey || !Array.isArray(entries) || entries.length === 0) {
    return entries;
  }

  const enrichedEntries = entries.map((entry) => ({ ...entry }));
  const pendingEntries = [...enrichedEntries];
  const concurrency = Math.max(1, Math.min(4, pendingEntries.length));

  async function worker() {
    while (pendingEntries.length > 0) {
      const entry = pendingEntries.shift();
      if (!entry?.slug) {
        continue;
      }

      try {
        const payload = await fetchOpenSeaCollectionBySlug({
          slug: entry.slug,
          apiKey
        });
        const collection = normalizeOpenSeaCollection(payload, { slug: entry.slug });
        const selectedContract = chooseOpenSeaCollectionContract(collection.contracts, {
          fallbackChainKey: "ethereum"
        });
        const chainKey = normalizeOpenSeaChainKey(selectedContract?.chain);
        const chain = chainKey ? findAvailableChainByKey(chainKey) : null;

        entry.collectionName = collection.name || entry.name;
        entry.description = collection.description || "";
        entry.imageUrl = collection.imageUrl || "";
        entry.externalUrl = collection.externalUrl || "";
        entry.url = collection.openseaUrl || entry.url;
        entry.nftContractAddress = selectedContract?.address || "";
        entry.chainKey = chain?.key || chainKey || "";
        entry.chainLabel = chain?.label || chainLabel(chainKey);
      } catch (error) {
        entry.warnings = [...new Set([...(entry.warnings || []), `Collection enrichment failed: ${formatError(error)}`])];
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return enrichedEntries;
}

function buildOpenSeaMintRadarPageUrls() {
  const urls = new Map();

  function addTarget(url, label) {
    const key = String(url || "").trim();
    if (!key || urls.has(key)) {
      return;
    }

    urls.set(key, {
      url: key,
      label
    });
  }

  addTarget(new URL("/drops", openSeaDropsBaseUrl).toString(), "Live & Upcoming");
  addTarget(new URL("/drops/?tab=upcoming", openSeaDropsBaseUrl).toString(), "Upcoming Tab");

  for (let page = 1; page <= openSeaMintRadarMaxPages; page += 1) {
    const upcomingUrl = new URL("/drops/upcoming/", openSeaDropsBaseUrl);
    if (page > 1) {
      upcomingUrl.searchParams.set("page", String(page));
    }

    const upcomingTabUrl = new URL("/drops/", openSeaDropsBaseUrl);
    upcomingTabUrl.searchParams.set("tab", "upcoming");
    if (page > 1) {
      upcomingTabUrl.searchParams.set("page", String(page));
    }

    addTarget(upcomingUrl.toString(), page === 1 ? "Upcoming" : `Upcoming Page ${page}`);
    addTarget(upcomingTabUrl.toString(), page === 1 ? "Upcoming Tab" : `Upcoming Tab Page ${page}`);
  }

  return [...urls.values()];
}

function sortOpenSeaMintRadarEntries(entries = []) {
  const statusRank = {
    live: 0,
    upcoming: 1,
    unknown: 2
  };

  return [...entries].sort((left, right) => {
    const leftRank = statusRank[left.status] ?? 9;
    const rightRank = statusRank[right.status] ?? 9;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

function summarizeOpenSeaMintRadarStatus(entries = []) {
  return entries.reduce(
    (summary, entry) => {
      const key = entry.status === "live" ? "live" : entry.status === "upcoming" ? "upcoming" : "unknown";
      summary[key] += 1;
      summary.total += 1;
      return summary;
    },
    { total: 0, live: 0, upcoming: 0, unknown: 0 }
  );
}

async function buildOpenSeaMintRadarSnapshot() {
  const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
  const pageTargets = buildOpenSeaMintRadarPageUrls();
  const pageResults = await Promise.allSettled(
    pageTargets.map(async (target) => ({
      ...target,
      html: await fetchOpenSeaDropsHtml(target.url)
    }))
  );
  const entriesBySlug = new Map();
  const warnings = [];
  const pageErrors = [];

  pageResults.forEach((result, index) => {
    const target = pageTargets[index];
    if (result.status !== "fulfilled") {
      pageErrors.push(`${target.label}: ${formatError(result.reason)}`);
      return;
    }

    const parsedEntries = parseOpenSeaMintRadarEntries(result.value.html, {
      pageLabel: target.label,
      baseUrl: openSeaDropsBaseUrl
    });

    parsedEntries.forEach((entry) => {
      entriesBySlug.set(entry.slug, mergeOpenSeaMintRadarEntries(entriesBySlug.get(entry.slug), entry));
    });
  });

  if (pageErrors.length > 0) {
    warnings.push(...pageErrors);
  }

  let items = sortOpenSeaMintRadarEntries([...entriesBySlug.values()]);

  if (items.length === 0) {
    throw new Error(
      pageErrors.length > 0
        ? `OpenSea Drops could not be parsed. ${pageErrors[0]}`
        : "OpenSea Drops returned no live or upcoming mint cards."
    );
  }

  if (!resolvedSecrets.openseaApiKey) {
    warnings.push("OpenSea API key is not configured, so collection enrichment is unavailable.");
  } else {
    const enrichedItems = await enrichOpenSeaMintRadarEntries(items, resolvedSecrets.openseaApiKey);
    if (Array.isArray(enrichedItems) && enrichedItems.length > 0) {
      items = sortOpenSeaMintRadarEntries(enrichedItems);
    }
  }

  return {
    limitation: openSeaMintRadarLimitation,
    fetchedAt: new Date().toISOString(),
    items,
    counts: summarizeOpenSeaMintRadarStatus(items),
    warnings
  };
}

function filterOpenSeaMintRadarSnapshot(snapshot, options = {}) {
  const statusFilter = String(options.status || "all").trim().toLowerCase();
  const chainFilter = String(options.chainKey || "all").trim().toLowerCase();
  const limit = Math.max(1, Math.min(openSeaMintRadarMaxItems, Number(options.limit || openSeaMintRadarMaxItems)));
  const filteredItems = (Array.isArray(snapshot?.items) ? snapshot.items : [])
    .filter((entry) => statusFilter === "all" || entry.status === statusFilter)
    .filter((entry) => {
      if (chainFilter === "all") {
        return true;
      }

      const entryChainKey = String(entry?.chainKey || "").trim().toLowerCase();
      if (chainFilter === "__unknown") {
        return !entryChainKey;
      }

      return entryChainKey === chainFilter;
    })
    .slice(0, limit);

  return {
    limitation: snapshot?.limitation || openSeaMintRadarLimitation,
    fetchedAt: snapshot?.fetchedAt || new Date().toISOString(),
    counts: summarizeOpenSeaMintRadarStatus(filteredItems),
    warnings: Array.isArray(snapshot?.warnings) ? snapshot.warnings : [],
    items: filteredItems
  };
}

async function getOpenSeaMintRadarSnapshot(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const now = Date.now();
  const staleSnapshot = openSeaMintRadarCache.value;

  if (!forceRefresh && staleSnapshot && openSeaMintRadarCache.expiresAt > now) {
    return filterOpenSeaMintRadarSnapshot(staleSnapshot, options);
  }

  if (!forceRefresh && openSeaMintRadarCache.pending) {
    return filterOpenSeaMintRadarSnapshot(await openSeaMintRadarCache.pending, options);
  }

  openSeaMintRadarCache.pending = buildOpenSeaMintRadarSnapshot()
    .then((snapshot) => {
      openSeaMintRadarCache = {
        expiresAt: Date.now() + openSeaMintRadarCacheTtlMs,
        value: snapshot,
        pending: null
      };
      return snapshot;
    })
    .catch((error) => {
      openSeaMintRadarCache.pending = null;
      if (staleSnapshot) {
        return {
          ...staleSnapshot,
          warnings: [
            ...new Set([
              ...(Array.isArray(staleSnapshot.warnings) ? staleSnapshot.warnings : []),
              `Refresh failed, showing cached data: ${formatError(error)}`
            ])
          ]
        };
      }
      throw error;
    });

  return filterOpenSeaMintRadarSnapshot(await openSeaMintRadarCache.pending, options);
}

async function discoverOpenSeaSource({
  sourceTarget,
  sourceStage = "auto",
  preferredChainKey = "",
  walletIds = [],
  rpcNodeIds = [],
  quantityPerWallet = 1,
  requestedFunction = ""
}) {
  const sourceContext = resolveMintSourceContext("opensea", {
    sourceTarget,
    sourceStage
  });
  validateMintSourceSelection("opensea", {
    sourceTarget,
    sourceStage,
    sourceContext
  });

  if (!sourceContext.projectSlug) {
    throw new Error("OpenSea auto-discovery needs a valid collection URL or slug.");
  }

  const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
  if (!resolvedSecrets.openseaApiKey) {
    throw new Error("Add an OpenSea API key in Settings to enable automatic OpenSea discovery.");
  }

  const collectionPayload = await fetchOpenSeaCollectionBySlug({
    slug: sourceContext.projectSlug,
    apiKey: resolvedSecrets.openseaApiKey
  });
  const collection = normalizeOpenSeaCollection(collectionPayload, {
    slug: sourceContext.projectSlug
  });
  const warnings = [];
  const selectedContract = chooseOpenSeaCollectionContract(collection.contracts, {
    preferredChainKey,
    chainHint: sourceContext.chainHint,
    fallbackChainKey: "ethereum"
  });
  const chainKey =
    normalizeOpenSeaChainKey(selectedContract?.chain) ||
    normalizeOpenSeaChainKey(preferredChainKey) ||
    normalizeOpenSeaChainKey(sourceContext.chainHint);
  const chain = chainKey ? findAvailableChainByKey(chainKey) : null;

  if (!selectedContract) {
    warnings.push("OpenSea returned no contract addresses for this collection.");
  }

  if (selectedContract && !chain) {
    warnings.push(
      selectedContract.chain
        ? `OpenSea returned contract chain "${selectedContract.chain}", which MintBot does not recognize yet.`
        : "OpenSea did not return a recognized chain for the discovered contract."
    );
  }

  let abi = [];
  let abiProvider = "";
  let autofill = null;

  if (selectedContract?.address && chain?.chainId && resolvedSecrets.explorerApiKey) {
    try {
      const abiResult = await fetchAbiFromExplorer({
        chainId: chain.chainId,
        address: selectedContract.address,
        apiKey: resolvedSecrets.explorerApiKey
      });
      abi = Array.isArray(abiResult?.abi) ? abiResult.abi : [];
      abiProvider = "Etherscan V2";

      if (abi.length > 0) {
        autofill = await buildMintAutofill({
          chainKey: chain.key,
          contractAddress: selectedContract.address,
          abiEntries: abi,
          requestedFunction,
          walletIds,
          rpcNodeIds,
          quantityPerWallet
        });
      }
    } catch (error) {
      warnings.push(`ABI auto-load failed: ${formatError(error)}`);
    }
  } else if (selectedContract?.address && !resolvedSecrets.explorerApiKey) {
    warnings.push("Explorer API key is not configured, so ABI auto-load is unavailable.");
  }

  return {
    sourceType: "opensea",
    sourceTarget,
    sourceStage,
    sourceContext,
    collection: {
      slug: collection.slug || sourceContext.projectSlug,
      name: collection.name || sourceContext.projectLabel || sourceContext.projectSlug,
      description: collection.description || "",
      openseaUrl: collection.openseaUrl || sourceContext.canonicalUrl || "",
      externalUrl: collection.externalUrl || ""
    },
    contracts: collection.contracts,
    contractCount: collection.contracts.length,
    chainKey: chain?.key || chainKey || "",
    chainId: chain?.chainId || null,
    chainLabel: chain?.label || chainLabel(chainKey),
    contractAddress: selectedContract?.address || "",
    contractChain: selectedContract?.chain || "",
    abi,
    abiProvider,
    autofill,
    warnings
  };
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
  return {
    ...buildClientSettings(appState?.settings, integrationSecrets, integrationHealthState),
    operatorAssistantModel
  };
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
  appState.chains = getAvailableChains();
}

async function persistAppState() {
  await database.saveState(extractPersistentState());
}

async function syncDistributedQueueSnapshot() {
  if (!queueCoordinator?.enabled) {
    distributedRunState = createIdleRunState(getQueueConfig());
    distributedQueuedTaskIds.clear();
    clearAllQueuedTaskFallbacks();
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
  reconcileQueuedTaskFallbacks();
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
      clearAllQueuedTaskFallbacks();
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
        clearQueuedTaskFallback(message.payload.runState.activeTaskId);
      }
      activeTaskIds.forEach((taskId) => {
        distributedQueuedTaskIds.delete(taskId);
        clearQueuedTaskFallback(taskId);
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
      scheduleQueuedTaskFallback(message.payload.taskId);
      emitState();
      return;
    }

    if (message.type === "task-dequeued" && message.payload?.taskId) {
      distributedQueuedTaskIds.delete(message.payload.taskId);
      clearQueuedTaskFallback(message.payload.taskId);
      emitState();
      return;
    }

    if (message.type === "task-sync") {
      clearQueuedTaskFallback(message.payload?.taskId);
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
      const normalizedPrivateKey = validateResolvedPrivateKey(legacyWallet.privateKey);
      const address = deriveAddress(normalizedPrivateKey);
      const addressLower = address.toLowerCase();
      if (knownAddresses.has(addressLower) || envWalletAddresses.has(addressLower)) {
        continue;
      }

      await database.insertWallet({
        id: legacyWallet.id || createId("wallet"),
        label: legacyWallet.label || "Migrated Wallet",
        address,
        addressShort: legacyWallet.addressShort || truncateMiddle(address),
        secretCiphertext: encryptSecret(normalizedPrivateKey),
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
  await refreshIntegrationHealthState();
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
  const sourceType = task.sourceType || defaultMintSourceType;
  const sourceDefinition = getMintSourceDefinition(sourceType);
  const sourceContext = resolveMintSourceContext(sourceType, {
    sourceTarget: task.sourceTarget,
    sourceStage: task.sourceStage
  });

  const response = {
    ...task,
    gasStrategy: normalizeGasStrategyValue(task.gasStrategy || "normal"),
    preSignTransactions: true,
    sourceType,
    sourceLabel: sourceDefinition.label,
    sourceTarget: task.sourceTarget || "",
    sourceStage: task.sourceStage || defaultMintSourceStage,
    sourceSummary: sourceContext.summary,
    sourceContext,
    sourceTargetKind: sourceContext.targetKind,
    sourceDisplayTarget: sourceContext.displayTarget,
    sourceProjectSlug: sourceContext.projectSlug,
    sourceProjectLabel: sourceContext.projectLabel,
    sourceDiscoveryPlan: sourceContext.discoveryPlan,
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
  const sourceType = task.sourceType || defaultMintSourceType;
  const sourceContext =
    task.sourceContext ||
    resolveMintSourceContext(sourceType, {
      sourceTarget: task.sourceTarget,
      sourceStage: task.sourceStage
    });
  let blockingSourceIssue = false;

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

  if (sourceType !== defaultMintSourceType) {
    if (!sourceContext.hasTarget) {
      issues.push("Source target missing");
      blockingSourceIssue = true;
    } else if (!sourceContext.valid) {
      issues.push(sourceContext.error || "Source target is invalid");
      blockingSourceIssue = true;
    } else {
      score += 10;
    }
  }

  let health = "blocked";
  if (!blockingSourceIssue && score >= (sourceType === defaultMintSourceType ? 100 : 110)) {
    health = "armed";
  } else if (!blockingSourceIssue && score >= 50) {
    health = "warming";
  }

  return {
    score,
    health,
    rpcCount: eligibleRpcNodes.length,
    issues
  };
}

function rpcLatencyLabel(latencyMs) {
  const normalized = Number(latencyMs);
  return Number.isFinite(normalized) ? `${Math.round(normalized)}ms` : "Untested";
}

function rpcAlertSeverity(node) {
  if (node?.lastHealth?.status === "error") {
    return "critical";
  }

  if (node?.lastHealth?.status !== "healthy") {
    return null;
  }

  const latency = Number(node?.lastHealth?.latencyMs);
  if (!Number.isFinite(latency)) {
    return null;
  }

  if (latency >= rpcHealthCriticalLatencyMs) {
    return "critical";
  }

  if (latency >= rpcHealthWarningLatencyMs) {
    return "warning";
  }

  return null;
}

function rpcAlertNodeLabel(node) {
  return node?.name || truncateMiddle(node?.url || "RPC node", 20, 14);
}

function buildRpcHealthAlerts(rpcNodes = appState.rpcNodes) {
  const enabledNodes = (rpcNodes || []).filter((node) => node.enabled !== false);
  const downNodes = enabledNodes.filter((node) => node.lastHealth?.status === "error");
  const highLatencyNodes = enabledNodes
    .filter((node) => node.lastHealth?.status === "healthy" && rpcAlertSeverity(node))
    .sort((left, right) => Number(right.lastHealth?.latencyMs || 0) - Number(left.lastHealth?.latencyMs || 0));
  const alerts = [];

  if (downNodes.length > 0) {
    const rpcNames = downNodes
      .slice(0, 3)
      .map((node) => rpcAlertNodeLabel(node))
      .join(", ");
    alerts.push({
      severity: "critical",
      title: downNodes.length === 1 ? "RPC node down" : "Multiple RPC nodes down",
      detail: `${rpcNames}${downNodes.length > 3 ? ` +${downNodes.length - 3} more` : ""}. Check or replace the failing endpoint${downNodes.length === 1 ? "" : "s"} before the next mint window.`
    });
  }

  if (highLatencyNodes.length > 0) {
    const latencyPreview = highLatencyNodes
      .slice(0, 3)
      .map((node) => `${rpcAlertNodeLabel(node)} (${rpcLatencyLabel(node.lastHealth?.latencyMs)})`)
      .join(", ");
    const hasCriticalLatency = highLatencyNodes.some((node) => rpcAlertSeverity(node) === "critical");
    alerts.push({
      severity: hasCriticalLatency ? "critical" : "warning",
      title: highLatencyNodes.length === 1 ? "High-latency RPC detected" : "High-latency RPCs detected",
      detail: `${latencyPreview}${highLatencyNodes.length > 3 ? ` +${highLatencyNodes.length - 3} more` : ""}. Avoid routing hot mints through the slow endpoint${highLatencyNodes.length === 1 ? "" : "s"}.`
    });
  }

  return alerts;
}

function buildTelemetry() {
  const taskViews = appState.tasks.map(buildTaskResponse);
  const activeTask = findActiveTask() ? buildTaskResponse(findActiveTask()) : null;
  const currentRunState = getRunState();
  const readyTaskCount = taskViews.filter((task) => taskReadiness(task).health === "armed").length;

  const alerts = [...buildRpcHealthAlerts(appState.rpcNodes)];
  if (appState.wallets.length === 0) {
    alerts.push({
      severity: "critical",
      title: "No wallets loaded",
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
  if (taskViews.some((task) => taskReadiness(task).health === "blocked")) {
    alerts.push({
      severity: "warning",
      title: "Blocked tasks detected",
      detail: "One or more priority tasks are missing required inputs such as source targets, contract data, wallets, or RPC coverage."
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
    readyTaskCount,
    runDurationMs: currentRunState.startedAt ? Date.now() - new Date(currentRunState.startedAt).getTime() : 0,
    alerts
  };
}

function buildPublicState(includeDefaults = false) {
  const payload = {
    tasks: appState.tasks.map(buildTaskResponse),
    wallets: appState.wallets,
    rpcNodes: appState.rpcNodes,
    settings: buildPublicSettings(),
    chains: appState.chains || getAvailableChains(),
    mintSources: listMintSourceDefinitions(),
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
    autoArm: task.autoArm !== false,
    autoArmPending: false,
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

function clearQueuedTaskFallback(taskId) {
  if (!taskId) {
    return;
  }

  const timer = queuedTaskFallbackTimers.get(taskId);
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  queuedTaskFallbackTimers.delete(taskId);
}

function clearAllQueuedTaskFallbacks() {
  queuedTaskFallbackTimers.forEach((timer) => {
    clearTimeout(timer);
  });
  queuedTaskFallbackTimers.clear();
}

function scheduleQueuedTaskFallback(taskId) {
  if (!taskId || !queueModeEnabled() || !queueCoordinator?.enabled || queuedTaskFallbackTimers.has(taskId)) {
    return;
  }

  const timer = setTimeout(() => {
    queuedTaskFallbackTimers.delete(taskId);
    void reclaimQueuedTaskRun(taskId).catch(reportBackgroundError);
  }, queueInlineFallbackMs);

  if (typeof timer?.unref === "function") {
    timer.unref();
  }

  queuedTaskFallbackTimers.set(taskId, timer);
}

function reconcileQueuedTaskFallbacks() {
  const queuedTaskIds = new Set(distributedQueuedTaskIds);

  queuedTaskFallbackTimers.forEach((_, taskId) => {
    if (!queuedTaskIds.has(taskId)) {
      clearQueuedTaskFallback(taskId);
    }
  });

  queuedTaskIds.forEach((taskId) => {
    scheduleQueuedTaskFallback(taskId);
  });
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
  const walletMap = new Map((appState?.wallets || []).map((wallet) => [wallet.id, wallet]));
  const privateKeys = [];

  for (const walletId of walletIds) {
    const wallet = walletMap.get(walletId) || null;
    if (keyMap.has(walletId)) {
      privateKeys.push(validateResolvedPrivateKey(keyMap.get(walletId), wallet));
      continue;
    }

    const storedSecret = await database.getStoredWalletSecret(walletId);
    if (!storedSecret?.secret_ciphertext) {
      throw new Error(`${wallet?.label || walletId} secret was not found in storage`);
    }

    let decryptedSecret;
    try {
      decryptedSecret = decryptSecret(storedSecret.secret_ciphertext);
    } catch (error) {
      throw new Error(
        `${wallet?.label || walletId} secret could not be decrypted. Check ENCRYPTION_KEY and re-import the wallet if needed.`
      );
    }

    privateKeys.push(validateResolvedPrivateKey(decryptedSecret, wallet));
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
  const rankedRpcNodes = rankRpcNodesByLatency(configuredRpcNodes);

  if (rankedRpcNodes.length === 0) {
    throw new Error(`No enabled RPC nodes configured for ${task.chainKey}`);
  }

  const chain = findAvailableChainByKey(task.chainKey);

  return normalizeConfig({
    ...defaultInputValues,
    RPC_URLS: rankedRpcNodes.map((node) => node.url).join("\n"),
    PRIVATE_KEYS: privateKeys.join("\n"),
    SOURCE_TYPE: task.sourceType,
    SOURCE_TARGET: task.sourceTarget,
    SOURCE_STAGE: task.sourceStage,
    SOURCE_CONFIG_JSON: task.sourceConfigJson,
    CONTRACT_ADDRESS: task.contractAddress,
    ABI_JSON: task.abiJson,
    MINT_FUNCTION: task.mintFunction,
    MINT_ARGS: task.mintArgs,
    QUANTITY_PER_WALLET: task.quantityPerWallet,
    MINT_VALUE_ETH: task.priceEth,
    CHAIN_KEY: task.chainKey,
    CLAIM_INTEGRATION_ENABLED: task.claimIntegrationEnabled,
    CLAIM_PROJECT_KEY: task.claimProjectKey,
    WALLET_CLAIMS_JSON: task.walletClaimsJson,
    CLAIM_FETCH_ENABLED: task.claimFetchEnabled,
    CLAIM_FETCH_URL: task.claimFetchUrl,
    CLAIM_FETCH_METHOD: task.claimFetchMethod,
    CLAIM_FETCH_HEADERS_JSON: task.claimFetchHeadersJson,
    CLAIM_FETCH_COOKIES_JSON: task.claimFetchCookiesJson,
    CLAIM_FETCH_BODY_JSON: task.claimFetchBodyJson,
    CLAIM_RESPONSE_MAPPING_JSON: task.claimResponseMappingJson,
    CLAIM_RESPONSE_ROOT: task.claimResponseRoot,
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

function listPendingAutoArmTasks() {
  if (!appState?.tasks?.length) {
    return [];
  }

  return appState.tasks
    .filter(
      (task) =>
        Boolean(task.autoArmPending) &&
        !task.done &&
        !task.schedulePending &&
        !["running", "queued", "completed"].includes(task.status)
    )
    .sort((left, right) => {
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

async function markAutoArmTaskLaunchFailure(taskId, error) {
  const task = getTaskById(taskId);
  if (!task) {
    return;
  }

  await updateTask(taskId, {
    autoArmPending: false,
    status: "failed",
    progress: {
      phase: "Auto-Arm Failed",
      percent: 100
    }
  });

  pushLog({
    level: "error",
    message: `Automatic launch failed for ${task.name}: ${formatError(error)}`,
    timestamp: new Date().toISOString()
  });
}

async function scanAndRunAutomaticTasks() {
  if (scheduledTaskScanInFlight || !initialized || !appState) {
    return;
  }

  scheduledTaskScanInFlight = true;

  try {
    const dueTasks = listDueScheduledTasks();
    const pendingAutoArmTasks = listPendingAutoArmTasks();
    if (dueTasks.length === 0 && pendingAutoArmTasks.length === 0) {
      return;
    }

    const tasksToLaunch = [...dueTasks, ...pendingAutoArmTasks];

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
        message: task.schedulePending
          ? `Auto-starting scheduled task ${task.name}`
          : `Auto-arming task ${task.name}`,
        timestamp: new Date().toISOString()
      });

      try {
        await requestTaskRun(task.id);
      } catch (error) {
        if (error?.statusCode === 409) {
          continue;
        }

        if (task.schedulePending) {
          await markScheduledTaskLaunchFailure(task.id, error);
        } else {
          await markAutoArmTaskLaunchFailure(task.id, error);
        }
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
    void scanAndRunAutomaticTasks().catch(reportBackgroundError);
  }, scheduledTaskPollIntervalMs);

  void scanAndRunAutomaticTasks().catch(reportBackgroundError);
}

async function startTaskRunLocal(taskId) {
  const task = getTaskById(taskId);
  if (!task) {
    throw createHttpError("Task not found", 404);
  }

  if (localTaskRuns.has(taskId)) {
    throw createHttpError("Task is already running", 409);
  }

  clearQueuedTaskFallback(taskId);
  const runContext = {
    taskId,
    taskName: task.name,
    controller: new AbortController(),
    startedAt: null,
    active: false,
    workerId: queueModeEnabled() ? queueInlineWorkerId : null
  };
  localTaskRuns.set(taskId, runContext);
  try {
    const config = await buildConfigForTask(task);
    const walletIds = Array.isArray(task.walletIds) ? task.walletIds : [];
    runContext.startedAt = new Date().toISOString();
    runContext.active = true;

    if (queueModeEnabled()) {
      distributedQueuedTaskIds.delete(taskId);
      clearDistributedTaskPatch(taskId);
      await setTaskRuntimeRecord(taskId, {
        status: "running",
        progress: {
          phase: "Preparing",
          percent: 8
        },
        summary: createEmptySummary(walletIds.length),
        active: true,
        queued: false,
        error: null,
        workerId: runContext.workerId,
        startedAt: runContext.startedAt
      });
    }

    await updateTask(taskId, {
      autoArmPending: false,
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
        const completedAt = new Date().toISOString();
        clearDistributedTaskPatch(taskId);
        if (queueModeEnabled()) {
          await setTaskRuntimeRecord(taskId, {
            status: "completed",
            progress: {
              phase: "Completed",
              percent: 100
            },
            summary,
            active: false,
            queued: false,
            error: null,
            workerId: runContext.workerId,
            startedAt: null,
            lastRunAt: completedAt
          });
        }
        await updateTask(taskId, {
          status: "completed",
          progress: {
            phase: "Completed",
            percent: 100
          },
          summary,
          lastRunAt: completedAt,
          history: [
            {
              id: createId("history"),
              ranAt: completedAt,
              summary
            },
            ...(taskAfterRun.history || [])
          ].slice(0, 8)
        });
      })
      .catch(async (error) => {
        const stopped = error instanceof AbortRunError || runContext.controller.signal.aborted;
        const failedAt = new Date().toISOString();
        clearDistributedTaskPatch(taskId);
        if (queueModeEnabled()) {
          await setTaskRuntimeRecord(taskId, {
            status: stopped ? "stopped" : "failed",
            progress: {
              phase: stopped ? "Stopped" : "Failed",
              percent: stopped ? 0 : 100
            },
            summary: createEmptySummary((task.walletIds || []).length),
            active: false,
            queued: false,
            error: formatError(error),
            workerId: runContext.workerId,
            startedAt: null,
            lastRunAt: failedAt
          });
        }
        await updateTask(taskId, {
          status: stopped ? "stopped" : "failed",
          progress: {
            phase: stopped ? "Stopped" : "Failed",
            percent: stopped ? 0 : 100
          },
          lastRunAt: failedAt
        });
        pushLog({
          level: "error",
          taskId,
          message: `[task ${runContext.taskName}] ${formatError(error)}`,
          timestamp: failedAt
        });
      })
      .catch(reportBackgroundError)
      .finally(() => {
        localTaskRuns.delete(taskId);
        clearDistributedTaskPatch(taskId);
        emitState();
      });

    emitState();
    return { ok: true };
  } catch (error) {
    localTaskRuns.delete(taskId);
    clearDistributedTaskPatch(taskId);
    throw error;
  }
}

async function reclaimQueuedTaskRun(taskId) {
  if (!taskId || !queueModeEnabled() || !queueCoordinator?.enabled) {
    return { ok: false, reclaimed: false };
  }

  clearQueuedTaskFallback(taskId);

  if (localTaskRuns.has(taskId) || !distributedQueuedTaskIds.has(taskId) || isTaskActive(taskId)) {
    return { ok: false, reclaimed: false };
  }

  const task = getTaskById(taskId);
  if (!task) {
    return { ok: false, reclaimed: false };
  }

  const removal = await queueCoordinator.removeQueuedTask(taskId);
  if (!removal.removed) {
    await refreshDistributedState();
    return { ok: false, reclaimed: false };
  }

  distributedQueuedTaskIds.delete(taskId);
  clearDistributedTaskPatch(taskId);
  pushLog({
    level: "warning",
    taskId,
    message: `[task ${task.name}] No Redis worker claimed this queued run within ${Math.round(
      queueInlineFallbackMs / 1000
    )}s. Reclaiming it on the dashboard process.`,
    timestamp: new Date().toISOString()
  });
  emitState();

  try {
    await startTaskRunLocal(taskId);
    return { ok: true, reclaimed: true };
  } catch (error) {
    const failedAt = new Date().toISOString();
    await setTaskRuntimeRecord(taskId, {
      status: "failed",
      progress: {
        phase: "Failed",
        percent: 100
      },
      summary: createEmptySummary((task.walletIds || []).length),
      active: false,
      queued: false,
      error: formatError(error),
      workerId: queueInlineWorkerId,
      startedAt: null,
      lastRunAt: failedAt
    });
    await updateTask(taskId, {
      status: "failed",
      progress: {
        phase: "Failed",
        percent: 100
      },
      lastRunAt: failedAt
    });
    pushLog({
      level: "error",
      taskId,
      message: `[task ${task.name}] Queue fallback failed: ${formatError(error)}`,
      timestamp: failedAt
    });
    emitState();
    return { ok: false, reclaimed: true, error: formatError(error) };
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
    autoArmPending: false,
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
  scheduleQueuedTaskFallback(taskId);
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

  let duplicate = cloneTask(task);
  try {
    duplicate = applyTaskAutoLaunchState(duplicate, parseTaskAbiEntries(duplicate.abiJson));
  } catch {
    // Keep the duplicate even if its ABI is currently invalid.
  }
  appState.tasks.unshift(duplicate);
  await persistAppState();
  await scanAndRunAutomaticTasks();
  emitState();
  sendJson(response, 200, { ok: true, task: buildTaskResponse(getTaskById(duplicate.id) || duplicate) });
}

function handleStopRun(response) {
  if (queueModeEnabled()) {
    const activeTaskIds = listActiveTaskIds();
    if (activeTaskIds.length === 0) {
      sendJson(response, 409, { error: "No task is running" });
      return;
    }

    Promise.all(
      activeTaskIds.map((taskId) => {
        const localRun = localTaskRuns.get(taskId);
        if (localRun) {
          localRun.controller.abort();
          return Promise.resolve(true);
        }

        return queueCoordinator.requestStop(taskId);
      })
    )
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

async function requestTaskStop(taskId) {
  const task = getTaskById(taskId);
  if (!task) {
    throw createHttpError("Task not found", 404);
  }

  if (queueModeEnabled()) {
    if (distributedQueuedTaskIds.has(taskId)) {
      clearQueuedTaskFallback(taskId);
      await queueCoordinator.removeQueuedTask(taskId);
      distributedQueuedTaskIds.delete(taskId);
      clearDistributedTaskPatch(taskId);
      await setTaskRuntimeRecord(taskId, {
        status: "stopped",
        progress: {
          phase: "Queue cancelled",
          percent: 0
        },
        summary: createEmptySummary((task.walletIds || []).length),
        active: false,
        queued: false,
        error: null,
        workerId: null,
        startedAt: null,
        lastRunAt: new Date().toISOString()
      });
      emitState();
      return { ok: true, taskId, cancelledQueue: true };
    }

    const localRun = localTaskRuns.get(taskId);
    if (localRun) {
      localRun.controller.abort();
      return { ok: true, taskId, stoppedInline: true };
    }

    if (!isTaskActive(taskId)) {
      throw createHttpError("Task is not running", 409);
    }

    await queueCoordinator.requestStop(taskId);
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
    return { ok: true, taskId };
  }

  const runContext = localTaskRuns.get(taskId);
  if (!runContext) {
    throw createHttpError("Task is not running", 409);
  }

  runContext.controller.abort();
  return { ok: true, taskId };
}

function validateAndPrepareTask(task, existingTask, payload) {
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

    if (!configuredRpcNodes.some((node) => /^wss?:\/\//i.test(String(node.url || "")))) {
      throw new Error(
        "Mempool execution requires at least one enabled ws:// or wss:// RPC URL for the selected chain"
      );
    }
  }

  return {
    abiEntries,
    preparedTask: applyTaskAutoLaunchState(task, abiEntries),
    autoGeneratePhaseTasks: false
  };
}

async function saveTaskPayload(payload) {
  const existingTask = payload.id ? getTaskById(payload.id) : null;
  let task = sanitizeTaskInput(payload, existingTask);
  task = await enrichTaskFromSource(task);
  const { abiEntries, preparedTask, autoGeneratePhaseTasks } = validateAndPrepareTask(
    task,
    existingTask,
    payload
  );

  if (autoGeneratePhaseTasks) {
    const generatedTasks = await buildPhaseTasksFromTask(preparedTask, abiEntries);
    if (generatedTasks.length > 0) {
      appState.tasks = [...generatedTasks, ...appState.tasks];
      await persistAppState();
      await scanAndRunAutomaticTasks();
      emitState();
      return {
        ok: true,
        task: buildTaskResponse(getTaskById(generatedTasks[0].id) || generatedTasks[0]),
        tasks: generatedTasks.map((entry) => buildTaskResponse(getTaskById(entry.id) || entry)),
        autoGeneratedPhaseTasks: true
      };
    }
  }

  if (existingTask) {
    const index = appState.tasks.findIndex((entry) => entry.id === task.id);
    appState.tasks[index] = preparedTask;
  } else {
    appState.tasks.unshift(preparedTask);
  }

  await persistAppState();
  await scanAndRunAutomaticTasks();
  emitState();
  return {
    ok: true,
    task: buildTaskResponse(getTaskById(preparedTask.id) || preparedTask)
  };
}

async function deleteTaskById(taskId) {
  const currentRunState = getRunState();
  if ((currentRunState.activeTaskIds || []).includes(taskId)) {
    throw createHttpError("Stop the running task before deleting it", 409);
  }

  if (queueModeEnabled() && distributedQueuedTaskIds.has(taskId)) {
    clearQueuedTaskFallback(taskId);
    await queueCoordinator.removeQueuedTask(taskId);
    distributedQueuedTaskIds.delete(taskId);
    clearDistributedTaskPatch(taskId);
  }

  const before = appState.tasks.length;
  appState.tasks = appState.tasks.filter((task) => task.id !== taskId);

  if (appState.tasks.length === before) {
    throw createHttpError("Task not found", 404);
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
  return { ok: true };
}

async function handleTaskStop(taskId, response) {
  try {
    const payload = await requestTaskStop(taskId);
    sendJson(response, 200, payload);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
}

async function handleTaskSave(request, response) {
  try {
    const payload = await readJsonBody(request);
    const result = await saveTaskPayload(payload);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
}

async function handleTaskDelete(taskId, response) {
  try {
    const result = await deleteTaskById(taskId);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
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
    let imported = 0;
    let skipped = 0;

    await database.withTransaction(async (tx) => {
      const storedWallets = await tx.listWallets();

      for (const privateKey of privateKeys) {
        const normalizedPrivateKey = validateResolvedPrivateKey(privateKey);
        const address = deriveAddress(normalizedPrivateKey);
        if (knownAddresses.has(address.toLowerCase())) {
          skipped += 1;
          continue;
        }

        const nextIndex = storedWallets.length + imported + 1;
        const label = payload.group ? `${payload.group} ${nextIndex}` : `Wallet ${nextIndex}`;

        await tx.insertWallet({
          id: createId("wallet"),
          label,
          address,
          addressShort: truncateMiddle(address),
          secretCiphertext: encryptSecret(normalizedPrivateKey),
          group: payload.group || "Imported",
          status: "ready",
          source: "stored",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        knownAddresses.add(address.toLowerCase());
        imported += 1;
      }
    });

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

async function handleWalletAssets(walletId, response) {
  const wallet = appState.wallets.find((entry) => entry.id === walletId);
  if (!wallet) {
    sendJson(response, 404, { error: "Wallet not found" });
    return;
  }

  try {
    const snapshot = await readWalletAssetSnapshot(wallet);
    sendJson(response, 200, {
      ok: true,
      wallet: {
        id: wallet.id,
        label: wallet.label,
        address: wallet.address,
        addressShort: wallet.addressShort,
        group: wallet.group,
        status: wallet.status,
        source: wallet.source
      },
      generatedAt: snapshot.generatedAt,
      assets: snapshot.assets,
      warnings: snapshot.warnings,
      summary:
        snapshot.summary || {
          chainCount: snapshot.assets.length,
          warningCount: snapshot.warnings.length,
          nonZeroAssetCount: snapshot.assets.filter((asset) => Number(asset.balanceFloat || 0) > 0).length,
          totalUsd: null,
          totalUsdFormatted: null,
          pricedAssetCount: 0,
          usdAvailable: false
        }
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function saveRpcNodePayload(payload = {}) {
  if (!payload.url) {
    throw new Error("RPC URL is required");
  }

  if (payload.id && String(payload.id).startsWith("rpc_env_")) {
    throw new Error("Env RPC nodes cannot be overwritten from the dashboard");
  }

  const inspection = await inspectRpcEndpoint(payload.url);
  const resolvedChainKey = inspection.chainKey;
  const resolvedName = String(payload.name || "").trim() || inspection.nameSuggestion || "Custom RPC";

  const duplicateNode = appState.rpcNodes.find(
    (node) => node.id !== payload.id && String(node.url || "").trim() === inspection.url
  );
  if (duplicateNode) {
    throw new Error(`${duplicateNode.name || "Another RPC node"} already uses this RPC URL`);
  }

  const storedNodes = appState.rpcNodes.filter((node) => node.source !== "env");
  const rpcNode = {
    id: payload.id || createId("rpc"),
    name: resolvedName,
    url: inspection.url,
    chainKey: resolvedChainKey,
    chainId: inspection.chainId,
    chainLabel: inspection.chainLabel,
    enabled: payload.enabled !== false,
    group: payload.group || "Custom",
    source: "stored",
    lastHealth: {
      status: "healthy",
      latencyMs: inspection.latencyMs,
      blockNumber: inspection.blockNumber,
      checkedAt: inspection.checkedAt || new Date().toISOString()
    }
  };

  const existingIndex = storedNodes.findIndex((node) => node.id === rpcNode.id);
  if (existingIndex === -1) {
    storedNodes.unshift(rpcNode);
  } else {
    storedNodes[existingIndex] = rpcNode;
  }

  appState.rpcNodes = mergeRpcInventories(storedNodes, buildEnvRpcNodes());
  appState.chains = getAvailableChains();
  await persistAppState();
  emitState();

  return {
    ok: true,
    rpcNode,
    inspection
  };
}

async function testRpcNodeById(rpcId) {
  const rpcNode = appState.rpcNodes.find((node) => node.id === rpcId);
  if (!rpcNode) {
    throw createHttpError("RPC node not found", 404);
  }

  const health = await testRpcNodeHealth(rpcNode);
  await persistAppState();
  emitState();
  return {
    ok: true,
    rpcNode,
    health
  };
}

async function testRpcMesh() {
  if (appState.rpcNodes.length === 0) {
    throw createHttpError("No RPC nodes configured", 400);
  }

  const results = await Promise.all(
    appState.rpcNodes.map(async (rpcNode) => ({
      id: rpcNode.id,
      name: rpcNode.name,
      chainKey: rpcNode.chainKey,
      health: await testRpcNodeHealth(rpcNode)
    }))
  );

  await persistAppState();
  emitState();
  return {
    ok: true,
    summary: {
      total: results.length,
      healthy: results.filter((entry) => entry.health.status === "healthy").length,
      error: results.filter((entry) => entry.health.status === "error").length
    },
    results
  };
}

async function repairStoredRpcNode(rpcId) {
  const rpcNode = appState.rpcNodes.find((node) => node.id === rpcId);
  if (!rpcNode) {
    throw createHttpError("RPC node not found", 404);
  }

  if (rpcNode.source === "env") {
    throw createHttpError("Env RPC nodes are managed through environment variables", 400);
  }

  const inspection = await inspectRpcEndpoint(rpcNode.url);
  const storedNodes = appState.rpcNodes.filter((node) => node.source !== "env");
  const existingIndex = storedNodes.findIndex((node) => node.id === rpcId);
  if (existingIndex === -1) {
    throw new Error("Stored RPC node could not be found for repair");
  }

  storedNodes[existingIndex] = {
    ...rpcNode,
    url: inspection.url,
    chainKey: inspection.chainKey,
    chainId: inspection.chainId,
    chainLabel: inspection.chainLabel,
    lastHealth: {
      status: "healthy",
      latencyMs: inspection.latencyMs,
      blockNumber: inspection.blockNumber,
      checkedAt: inspection.checkedAt || new Date().toISOString()
    }
  };

  appState.rpcNodes = mergeRpcInventories(storedNodes, buildEnvRpcNodes());
  appState.chains = getAvailableChains();
  await persistAppState();
  emitState();

  return {
    ok: true,
    rpcNode: storedNodes[existingIndex],
    inspection
  };
}

async function deleteRpcNodeById(rpcId) {
  const rpcNode = appState.rpcNodes.find((node) => node.id === rpcId);
  if (!rpcNode) {
    throw createHttpError("RPC node not found", 404);
  }

  if (rpcNode.source === "env") {
    throw createHttpError("Env RPC nodes are managed through environment variables", 400);
  }

  appState.rpcNodes = appState.rpcNodes.filter((node) => node.id !== rpcId);
  appState.tasks = appState.tasks.map((task) => ({
    ...task,
    rpcNodeIds: (task.rpcNodeIds || []).filter((id) => id !== rpcId)
  }));
  await persistAppState();
  await reloadAppState();
  emitState();

  return {
    ok: true,
    rpcNode
  };
}

async function handleRpcSave(request, response) {
  try {
    const payload = await readJsonBody(request);
    const result = await saveRpcNodePayload(payload);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleRpcFix(rpcId, response) {
  try {
    const result = await repairStoredRpcNode(rpcId);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
}

async function handleChainlistRpcImport(request, response) {
  try {
    const payload = await readJsonBody(request);
    const resolvedChain = await resolveChainlistRequestChain(payload);
    const chain = resolvedChain.chain;
    const importLimit = Math.min(10, Math.max(1, Number(payload.limit || 5)));
    const preview = await collectChainlistRpcCandidates(chain, {
      limit: importLimit,
      probeBudget: Math.max(importLimit * 4, importLimit),
      transportFilter: payload.transportFilter,
      forceRefresh: payload.forceRefresh,
      chainlistCatalog: resolvedChain.chainlistCatalog,
      chainlistEntry: resolvedChain.chainlistEntry
    });
    const transportLabel = preview.transportFilter === "ws" ? "websocket" : "normal";
    if (preview.transportUnavailable) {
      throw new Error(`Chainlist does not currently publish ${transportLabel} RPC URLs for ${chain.label}.`);
    }
    if (preview.allConfigured) {
      throw new Error(`All published Chainlist ${transportLabel} RPCs for ${chain.label} are already configured.`);
    }
    const importableNodes = preview.candidates.filter((node) => node.lastHealth?.status === "healthy");

    if (importableNodes.length === 0) {
      throw new Error(`No healthy Chainlist ${transportLabel} RPCs were ready for ${chain.label}.`);
    }

    const storedNodes = appState.rpcNodes.filter((node) => node.source !== "env");
    const nodesToPersist = [];

    importableNodes.forEach((node) => {
      const name = buildUniqueRpcNodeName(
        buildRpcNameSuggestion(node.url, chain, chain.chainId),
        [...storedNodes, ...nodesToPersist]
      );
      nodesToPersist.push({
        id: createId("rpc"),
        name,
        url: node.url,
        chainKey: chain.key,
        chainId: chain.chainId,
        chainLabel: chain.label,
        enabled: true,
        group: "Chainlist",
        source: "stored",
        lastHealth: node.lastHealth
      });
    });

    appState.rpcNodes = mergeRpcInventories([...nodesToPersist, ...storedNodes], buildEnvRpcNodes());
    appState.chains = getAvailableChains();
    await persistAppState();
    emitState();

    sendJson(response, 200, {
      ok: true,
      imported: nodesToPersist.length,
      chain: {
        key: chain.key,
        label: chain.label,
        chainId: chain.chainId
      },
      skipped: preview.probedCount - nodesToPersist.length,
      rpcNodes: nodesToPersist
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleChainlistRpcCandidates(request, response) {
  try {
    const payload = await readJsonBody(request);
    const resolvedChain = await resolveChainlistRequestChain(payload);
    const chain = resolvedChain.chain;
    const preview = await collectChainlistRpcCandidates(chain, {
      limit: payload.limit,
      probeBudget: payload.probeBudget,
      transportFilter: payload.transportFilter,
      forceRefresh: payload.forceRefresh,
      chainlistCatalog: resolvedChain.chainlistCatalog,
      chainlistEntry: resolvedChain.chainlistEntry
    });

    sendJson(response, 200, {
      ok: true,
      chain: {
        key: preview.chain.key,
        label: preview.chain.label,
        chainId: preview.chain.chainId
      },
      resolution: resolvedChain.resolution,
      published: preview.publishedCount,
      publishedSocketCount: preview.publishedSocketCount,
      skippedExisting: preview.skippedExistingCount,
      skippedProbeBudget: preview.skippedProbeBudgetCount,
      probed: preview.probedCount,
      probedSocketCount: preview.probedSocketCount,
      healthy: preview.healthyCount,
      healthySocketCount: preview.healthySocketCount,
      allConfigured: preview.allConfigured,
      transportFilter: preview.transportFilter,
      transportUnavailable: preview.transportUnavailable,
      sourceLabel: "Chainlist",
      candidates: preview.candidates
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function collectAlchemyRpcCandidates(apiKey, options = {}) {
  const { chain = null, timeoutMs = 8000 } = options;
  if (!chain?.chainId) {
    throw new Error("Choose a chain before importing Alchemy RPCs.");
  }

  const importEntry = findAlchemyRpcImportEntry(chain);
  if (!importEntry) {
    throw new Error(`Alchemy RPC import is not configured for ${chain.label} yet.`);
  }

  const transportFilter = normalizeRpcTransportFilter(options.transportFilter);
  const transports =
    transportFilter === "ws" ? ["ws"] : transportFilter === "all" ? ["http", "ws"] : ["http"];
  const existingUrls = new Set(appState.rpcNodes.map((node) => String(node.url || "").trim()));
  const candidates = [];
  let skippedExistingCount = 0;

  transports.forEach((transport) => {
    const url = buildAlchemyRpcUrl(importEntry.endpointKey, apiKey, transport);
    if (existingUrls.has(url)) {
      skippedExistingCount += 1;
      return;
    }

    candidates.push({
      id: createId("rpc_probe"),
      name: transport === "ws" ? `Alchemy ${chain.label} WS` : `Alchemy ${chain.label}`,
      url,
      chainKey: chain.key,
      chainId: chain.chainId,
      chainLabel: chain.label,
      enabled: true,
      group: "Alchemy",
      source: "preview",
      lastHealth: null
    });
  });

  if (candidates.length === 0) {
    return {
      chain,
      importEntry,
      transportFilter,
      totalCount: 0,
      skippedExistingCount,
      allConfigured: skippedExistingCount > 0,
      healthyCount: 0,
      healthySocketCount: 0,
      candidates: []
    };
  }

  await Promise.all(
    candidates.map(async (candidate) => {
      await testRpcNodeHealth(candidate, timeoutMs);
      return candidate;
    })
  );

  const healthyCandidates = rankRpcNodesByLatency(
    candidates.filter((candidate) => candidate.lastHealth?.status === "healthy")
  );

  return {
    chain,
    importEntry,
    transportFilter,
    totalCount: candidates.length,
    skippedExistingCount,
    allConfigured: false,
    healthyCount: healthyCandidates.length,
    healthySocketCount: healthyCandidates.filter((candidate) => isSocketRpcUrl(candidate.url)).length,
    candidates: healthyCandidates
  };
}

async function handleAlchemyRpcImport(request, response) {
  try {
    const payload = await readJsonBody(request);
    const resolvedChain = await resolveChainlistRequestChain(payload);
    const chain = resolvedChain.chain;
    const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
    const apiKey = String(resolvedSecrets.alchemyApiKey || "").trim();

    if (!apiKey) {
      throw new Error("Save an Alchemy API key in Settings or ALCHEMY_API_KEY in .env first.");
    }

    const preview = await collectAlchemyRpcCandidates(apiKey, {
      chain,
      transportFilter: payload.transportFilter
    });
    const transportLabel = preview.transportFilter === "ws" ? "websocket" : "normal";

    if (preview.allConfigured) {
      throw new Error(`Alchemy ${transportLabel} RPCs for ${chain.label} are already configured.`);
    }

    if (preview.candidates.length === 0) {
      throw new Error(`No healthy Alchemy ${transportLabel} RPCs were available for ${chain.label}.`);
    }

    const storedNodes = appState.rpcNodes.filter((node) => node.source !== "env");
    const nodesToPersist = [];

    preview.candidates.forEach((candidate) => {
      const desiredName = candidate.name || `Alchemy ${candidate.chainLabel}`;
      const name = buildUniqueRpcNodeName(desiredName, [...storedNodes, ...nodesToPersist]);
      nodesToPersist.push({
        id: createId("rpc"),
        name,
        url: candidate.url,
        chainKey: candidate.chainKey,
        chainId: candidate.chainId,
        chainLabel: candidate.chainLabel,
        enabled: true,
        group: "Alchemy",
        source: "stored",
        lastHealth: candidate.lastHealth
      });
    });

    appState.rpcNodes = mergeRpcInventories([...nodesToPersist, ...storedNodes], buildEnvRpcNodes());
    appState.chains = getAvailableChains();
    await persistAppState();
    emitState();

    sendJson(response, 200, {
      ok: true,
      imported: nodesToPersist.length,
      chain: {
        key: chain.key,
        label: chain.label,
        chainId: chain.chainId
      },
      transportFilter: preview.transportFilter,
      skippedExisting: preview.skippedExistingCount,
      healthySocketCount: preview.healthySocketCount,
      rpcNodes: nodesToPersist
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleAlchemyRpcCandidates(request, response) {
  try {
    const payload = await readJsonBody(request);
    const resolvedChain = await resolveChainlistRequestChain(payload);
    const chain = resolvedChain.chain;
    const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
    const apiKey = String(resolvedSecrets.alchemyApiKey || "").trim();

    if (!apiKey) {
      throw new Error("Save an Alchemy API key in Settings or ALCHEMY_API_KEY in .env first.");
    }

    const preview = await collectAlchemyRpcCandidates(apiKey, {
      chain,
      transportFilter: payload.transportFilter
    });

    sendJson(response, 200, {
      ok: true,
      chain: {
        key: chain.key,
        label: chain.label,
        chainId: chain.chainId
      },
      resolution: resolvedChain.resolution,
      published: preview.totalCount,
      publishedSocketCount:
        preview.transportFilter === "ws" ? preview.totalCount : preview.healthySocketCount,
      skippedExisting: preview.skippedExistingCount,
      skippedProbeBudget: 0,
      probed: preview.totalCount,
      probedSocketCount:
        preview.transportFilter === "ws" ? preview.totalCount : preview.healthySocketCount,
      healthy: preview.healthyCount,
      healthySocketCount: preview.healthySocketCount,
      allConfigured: preview.allConfigured,
      transportFilter: preview.transportFilter,
      transportUnavailable: false,
      sourceLabel: "Alchemy",
      candidates: preview.candidates
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function collectDrpcRpcCandidates(apiKey, options = {}) {
  const { chain = null, timeoutMs = 8000 } = options;
  if (!chain?.chainId) {
    throw new Error("Choose a chain before importing dRPC endpoints.");
  }

  const importEntry = findDrpcRpcImportEntry(chain);
  if (!importEntry) {
    throw new Error(`dRPC import is not configured for ${chain.label} yet.`);
  }

  const transportFilter = normalizeRpcTransportFilter(options.transportFilter);
  const transports =
    transportFilter === "ws" ? ["ws"] : transportFilter === "all" ? ["http", "ws"] : ["http"];
  const existingUrls = new Set(appState.rpcNodes.map((node) => String(node.url || "").trim()));
  const candidates = [];
  let skippedExistingCount = 0;

  transports.forEach((transport) => {
    const url = buildDrpcRpcUrl(importEntry.networkKey, apiKey, transport);
    if (existingUrls.has(url)) {
      skippedExistingCount += 1;
      return;
    }

    candidates.push({
      id: createId("rpc_probe"),
      name: transport === "ws" ? `dRPC ${chain.label} WS` : `dRPC ${chain.label}`,
      url,
      chainKey: chain.key,
      chainId: chain.chainId,
      chainLabel: chain.label,
      enabled: true,
      group: "dRPC",
      source: "preview",
      lastHealth: null
    });
  });

  if (candidates.length === 0) {
    return {
      chain,
      importEntry,
      transportFilter,
      totalCount: 0,
      skippedExistingCount,
      allConfigured: skippedExistingCount > 0,
      healthyCount: 0,
      healthySocketCount: 0,
      candidates: []
    };
  }

  await Promise.all(
    candidates.map(async (candidate) => {
      await testRpcNodeHealth(candidate, timeoutMs);
      return candidate;
    })
  );

  const healthyCandidates = rankRpcNodesByLatency(
    candidates.filter((candidate) => candidate.lastHealth?.status === "healthy")
  );

  return {
    chain,
    importEntry,
    transportFilter,
    totalCount: candidates.length,
    skippedExistingCount,
    allConfigured: false,
    healthyCount: healthyCandidates.length,
    healthySocketCount: healthyCandidates.filter((candidate) => isSocketRpcUrl(candidate.url)).length,
    candidates: healthyCandidates
  };
}

async function handleDrpcRpcCandidates(request, response) {
  try {
    const payload = await readJsonBody(request);
    const resolvedChain = await resolveChainlistRequestChain(payload);
    const chain = resolvedChain.chain;
    const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
    const apiKey = String(resolvedSecrets.drpcApiKey || "").trim();

    if (!apiKey) {
      throw new Error("Save a dRPC API key in Settings or DRPC_API_KEY in .env first.");
    }

    const preview = await collectDrpcRpcCandidates(apiKey, {
      chain,
      transportFilter: payload.transportFilter
    });

    sendJson(response, 200, {
      ok: true,
      chain: {
        key: chain.key,
        label: chain.label,
        chainId: chain.chainId
      },
      resolution: resolvedChain.resolution,
      published: preview.totalCount,
      publishedSocketCount:
        preview.transportFilter === "ws" ? preview.totalCount : preview.healthySocketCount,
      skippedExisting: preview.skippedExistingCount,
      skippedProbeBudget: 0,
      probed: preview.totalCount,
      probedSocketCount:
        preview.transportFilter === "ws" ? preview.totalCount : preview.healthySocketCount,
      healthy: preview.healthyCount,
      healthySocketCount: preview.healthySocketCount,
      allConfigured: preview.allConfigured,
      transportFilter: preview.transportFilter,
      transportUnavailable: false,
      sourceLabel: "dRPC",
      candidates: preview.candidates
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function testRpcNodeHealth(rpcNode, timeoutMs = 10000) {
  const started = Date.now();
  let provider = null;
  let timeoutId = null;

  try {
    if (isSocketRpcUrl(rpcNode.url)) {
      const inspection = await probeSocketRpcEndpoint(rpcNode.url, timeoutMs);
      rpcNode.lastHealth = {
        status: "healthy",
        latencyMs: inspection.latencyMs,
        blockNumber: inspection.blockNumber,
        checkedAt: inspection.checkedAt
      };
      return rpcNode.lastHealth;
    }

    provider = createProviderForRpcUrl(rpcNode.url);
    const blockNumber = await Promise.race([
      provider.getBlockNumber(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("RPC health probe timed out")), timeoutMs);
      })
    ]);
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
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    await destroyProvider(provider);
  }

  return rpcNode.lastHealth;
}

async function handleRpcInspect(request, response) {
  try {
    const payload = await readJsonBody(request);
    const inspection = await inspectRpcEndpoint(payload.url);
    sendJson(response, 200, { ok: true, ...inspection });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleRpcAiAdvice(request, response) {
  try {
    const payload = await readJsonBody(request);
    const result = await requestRpcAdvisorBrief({
      focusChainKey: payload.chainKey,
      operatorPrompt: payload.prompt
    });

    sendJson(response, 200, {
      ok: true,
      ...result
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleAssistantChat(request, response) {
  try {
    const user = await getAuthenticatedUser(request);
    const payload = await readJsonBody(request);
    const conversationKey = assistantConversationKey(user);

    if (payload.reset) {
      assistantConversations.delete(conversationKey);
      if (!String(payload.message || "").trim()) {
        sendJson(response, 200, {
          ok: true,
          reset: true,
          changedState: false,
          reply: "Conversation reset. I’m ready for a new task."
        });
        return;
      }
    }

    const message = String(payload.message || "").trim();
    if (!message) {
      throw new Error("Message is required");
    }

    const conversation = assistantConversations.get(conversationKey) || null;
    const result = await requestOperatorAssistantReply({
      message,
      previousResponseId: conversation?.previousResponseId || ""
    });

    assistantConversations.set(conversationKey, {
      previousResponseId: result.responseId || "",
      updatedAt: new Date().toISOString()
    });

    sendJson(response, 200, {
      ok: true,
      reply: result.reply,
      actions: result.actions || [],
      changedState: Boolean(result.changedState),
      navigateTo: result.navigateTo || "",
      focusTaskId: result.focusTaskId || "",
      model: operatorAssistantModel
    });
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
}

async function handleRpcTest(rpcId, response) {
  try {
    const result = await testRpcNodeById(rpcId);
    sendJson(response, 200, { ok: true, health: result.health, rpcNode: result.rpcNode });
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
}

async function handleRpcPoolTest(response) {
  try {
    const result = await testRpcMesh();
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
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

    const chain = findAvailableChainByKey(chainKey);
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
      requestedFunction: payload.mintFunction,
      walletIds: Array.isArray(payload.walletIds) ? payload.walletIds : [],
      rpcNodeIds: Array.isArray(payload.rpcNodeIds) ? payload.rpcNodeIds : [],
      quantityPerWallet: Math.max(1, Number(payload.quantityPerWallet || 1)),
      claimTaskSettings: {
        claimIntegrationEnabled: Boolean(payload.claimIntegrationEnabled),
        claimProjectKey: String(payload.claimProjectKey || "").trim(),
        walletClaimsJson: String(payload.walletClaimsJson || "").trim(),
        claimFetchEnabled: Boolean(payload.claimFetchEnabled),
        claimFetchUrl: String(payload.claimFetchUrl || "").trim(),
        claimFetchMethod: String(payload.claimFetchMethod || "GET").trim().toUpperCase(),
        claimFetchHeadersJson: String(payload.claimFetchHeadersJson || "").trim(),
        claimFetchCookiesJson: String(payload.claimFetchCookiesJson || "").trim(),
        claimFetchBodyJson: String(payload.claimFetchBodyJson || "").trim(),
        claimResponseMappingJson: String(payload.claimResponseMappingJson || "").trim(),
        claimResponseRoot: String(payload.claimResponseRoot || "").trim()
      }
    });

    sendJson(response, 200, {
      ok: true,
      autofill
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleSourceDiscovery(request, response) {
  try {
    const payload = await readJsonBody(request);
    const sourceType = String(payload.sourceType || "").trim().toLowerCase();
    const sourceTarget = String(payload.sourceTarget || "").trim();
    const sourceStage = String(payload.sourceStage || "auto").trim();

    if (!sourceType) {
      throw new Error("Source type is required for auto-discovery.");
    }

    if (!sourceTarget) {
      throw new Error("Source target is required for auto-discovery.");
    }

    let discovery = null;
    if (sourceType === "opensea") {
      discovery = await discoverOpenSeaSource({
        sourceTarget,
        sourceStage,
        preferredChainKey: String(payload.chainKey || "").trim(),
        walletIds: Array.isArray(payload.walletIds) ? payload.walletIds : [],
        rpcNodeIds: Array.isArray(payload.rpcNodeIds) ? payload.rpcNodeIds : [],
        quantityPerWallet: Math.max(1, Number(payload.quantityPerWallet || 1)),
        requestedFunction: String(payload.mintFunction || "").trim()
      });
    } else {
      throw new Error(`${sourceType} auto-discovery is not implemented yet.`);
    }

    sendJson(response, 200, {
      ok: true,
      discovery,
      abi: discovery.abi || [],
      autofill: discovery.autofill || null
    });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleOpenSeaMintRadar(url, response) {
  try {
    const status = String(url.searchParams.get("status") || "all").trim().toLowerCase();
    const chainKey = String(url.searchParams.get("chainKey") || "all").trim().toLowerCase();
    const limit = Number(url.searchParams.get("limit") || openSeaMintRadarMaxItems);
    const forceRefresh = ["1", "true", "yes"].includes(
      String(url.searchParams.get("refresh") || "").trim().toLowerCase()
    );
    const snapshot = await getOpenSeaMintRadarSnapshot({
      status: ["live", "upcoming", "all"].includes(status) ? status : "all",
      chainKey: chainKey || "all",
      limit,
      forceRefresh
    });

    sendJson(response, 200, {
      ok: true,
      source: "opensea_drops",
      ...snapshot
    });
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
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

async function verifyOpenAiApiKey(apiKey) {
  if (/^https?:\/\//i.test(apiKey) || /authorization:/i.test(apiKey) || /^curl\b/i.test(apiKey)) {
    throw new Error("Paste the raw OpenAI API key only, not a link, command, or header.");
  }

  if (/\s/.test(apiKey)) {
    throw new Error("OpenAI API key must be a single token with no spaces.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error?.message || payload?.error?.type || payload?.error || `OpenAI request failed with status ${response.status}`
      );
    }

    const models = Array.isArray(payload?.data) ? payload.data : [];
    return {
      modelCount: models.length,
      sampleModel: models[0]?.id || null
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("OpenAI key test timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyAlchemyApiKey(apiKey) {
  if (/^https?:\/\//i.test(apiKey) || /alchemy/i.test(apiKey) || /^curl\b/i.test(apiKey)) {
    throw new Error("Paste the raw Alchemy API key only, not a link, command, or full RPC URL.");
  }

  if (/\s/.test(apiKey)) {
    throw new Error("Alchemy API key must be a single token with no spaces.");
  }

  const result = await fetchAlchemyBlockNumber({ apiKey });

  return {
    network: "Ethereum Mainnet",
    blockNumber: result.blockNumber
  };
}

async function verifyDrpcApiKey(apiKey) {
  if (/^https?:\/\//i.test(apiKey) || /drpc/i.test(apiKey) || /^curl\b/i.test(apiKey)) {
    throw new Error("Paste the raw dRPC API key only, not a link, command, or full RPC URL.");
  }

  if (/\s/.test(apiKey)) {
    throw new Error("dRPC API key must be a single token with no spaces.");
  }

  const result = await fetchDrpcBlockNumber({ apiKey });

  return {
    network: "Ethereum Mainnet",
    blockNumber: result.blockNumber
  };
}

async function verifyOpenSeaApiKey(apiKey) {
  if (/^https?:\/\//i.test(apiKey) || /x-api-key/i.test(apiKey) || /^curl\b/i.test(apiKey)) {
    throw new Error("Paste the raw OpenSea API key only, not a link, command, or header.");
  }

  if (/\s/.test(apiKey)) {
    throw new Error("OpenSea API key must be a single token with no spaces.");
  }

  const payload = await fetchOpenSeaCollectionBySlug({
    slug: OPENSEA_KEY_TEST_COLLECTION_SLUG,
    apiKey
  });

  return {
    collection: payload?.collection || payload?.name || OPENSEA_KEY_TEST_COLLECTION_SLUG,
    hasFees: Boolean(payload?.fees),
    slug: payload?.collection || OPENSEA_KEY_TEST_COLLECTION_SLUG
  };
}

function integrationVerifier(secretName) {
  switch (secretName) {
    case "explorerApiKey":
      return verifyExplorerApiKey;
    case "openaiApiKey":
      return verifyOpenAiApiKey;
    case "alchemyApiKey":
      return verifyAlchemyApiKey;
    case "drpcApiKey":
      return verifyDrpcApiKey;
    case "openseaApiKey":
      return verifyOpenSeaApiKey;
    default:
      return null;
  }
}

async function refreshIntegrationHealthState(options = {}) {
  const { secretNames = Object.keys(secretStorageKeys) } = options;
  const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);

  const nextEntries = await Promise.all(
    secretNames.map(async (secretName) => {
      const apiKey = String(resolvedSecrets[secretName] || "").trim();
      if (!apiKey) {
        return [
          secretName,
          createIntegrationHealthEntry("missing", {
            checkedAt: new Date().toISOString()
          })
        ];
      }

      const verify = integrationVerifier(secretName);
      if (!verify) {
        return [
          secretName,
          createIntegrationHealthEntry("unknown", {
            checkedAt: new Date().toISOString()
          })
        ];
      }

      try {
        await verify(apiKey);
        return [
          secretName,
          createIntegrationHealthEntry("healthy", {
            checkedAt: new Date().toISOString()
          })
        ];
      } catch (error) {
        return [
          secretName,
          createIntegrationHealthEntry("error", {
            checkedAt: new Date().toISOString(),
            error: formatError(error)
          })
        ];
      }
    })
  );

  const nextState = {
    ...integrationHealthState
  };
  nextEntries.forEach(([secretName, entry]) => {
    nextState[secretName] = entry;
  });
  integrationHealthState = nextState;
  return integrationHealthState;
}

function resolvedKeySource(inputKey, savedKey) {
  return inputKey ? "input" : savedKey ? "saved" : "env";
}

function updateIntegrationHealthFromKeyTest(secretName, inputKey, apiKey, error = null) {
  if (inputKey) {
    return;
  }

  if (!apiKey) {
    setIntegrationHealth(secretName, "missing");
    return;
  }

  if (error) {
    setIntegrationHealth(secretName, "error", {
      error: formatError(error)
    });
    return;
  }

  setIntegrationHealth(secretName, "healthy");
}

async function handleExplorerKeyTest(request, response) {
  let inputKey = "";
  let apiKey = "";
  try {
    const payload = await readJsonBody(request);
    inputKey = String(payload.explorerApiKey || "").trim();
    const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
    const savedKey = String(integrationSecrets.explorerApiKey || "").trim();
    apiKey = inputKey || resolvedSecrets.explorerApiKey;

    if (!apiKey) {
      throw new Error("Add an Etherscan V2 API key first.");
    }

    const result = await verifyExplorerApiKey(apiKey);
    updateIntegrationHealthFromKeyTest("explorerApiKey", inputKey, apiKey);

    sendJson(response, 200, {
      ok: true,
      source: resolvedKeySource(inputKey, savedKey),
      ...result,
      settings: buildPublicSettings()
    });
  } catch (error) {
    updateIntegrationHealthFromKeyTest("explorerApiKey", inputKey, apiKey, error);
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleOpenAiKeyTest(request, response) {
  let inputKey = "";
  let apiKey = "";
  try {
    const payload = await readJsonBody(request);
    inputKey = String(payload.openaiApiKey || "").trim();
    const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
    const savedKey = String(integrationSecrets.openaiApiKey || "").trim();
    apiKey = inputKey || resolvedSecrets.openaiApiKey;

    if (!apiKey) {
      throw new Error("Add an OpenAI API key first.");
    }

    const result = await verifyOpenAiApiKey(apiKey);
    updateIntegrationHealthFromKeyTest("openaiApiKey", inputKey, apiKey);

    sendJson(response, 200, {
      ok: true,
      source: resolvedKeySource(inputKey, savedKey),
      ...result,
      settings: buildPublicSettings()
    });
  } catch (error) {
    updateIntegrationHealthFromKeyTest("openaiApiKey", inputKey, apiKey, error);
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleAlchemyKeyTest(request, response) {
  let inputKey = "";
  let apiKey = "";
  try {
    const payload = await readJsonBody(request);
    inputKey = String(payload.alchemyApiKey || "").trim();
    const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
    const savedKey = String(integrationSecrets.alchemyApiKey || "").trim();
    apiKey = inputKey || resolvedSecrets.alchemyApiKey;

    if (!apiKey) {
      throw new Error("Add an Alchemy API key first.");
    }

    const result = await verifyAlchemyApiKey(apiKey);
    updateIntegrationHealthFromKeyTest("alchemyApiKey", inputKey, apiKey);

    sendJson(response, 200, {
      ok: true,
      source: resolvedKeySource(inputKey, savedKey),
      ...result,
      settings: buildPublicSettings()
    });
  } catch (error) {
    updateIntegrationHealthFromKeyTest("alchemyApiKey", inputKey, apiKey, error);
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleDrpcKeyTest(request, response) {
  let inputKey = "";
  let apiKey = "";
  try {
    const payload = await readJsonBody(request);
    inputKey = String(payload.drpcApiKey || "").trim();
    const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
    const savedKey = String(integrationSecrets.drpcApiKey || "").trim();
    apiKey = inputKey || resolvedSecrets.drpcApiKey;

    if (!apiKey) {
      throw new Error("Add a dRPC API key first.");
    }

    const result = await verifyDrpcApiKey(apiKey);
    updateIntegrationHealthFromKeyTest("drpcApiKey", inputKey, apiKey);

    sendJson(response, 200, {
      ok: true,
      source: resolvedKeySource(inputKey, savedKey),
      ...result,
      settings: buildPublicSettings()
    });
  } catch (error) {
    updateIntegrationHealthFromKeyTest("drpcApiKey", inputKey, apiKey, error);
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleOpenSeaKeyTest(request, response) {
  let inputKey = "";
  let apiKey = "";
  try {
    const payload = await readJsonBody(request);
    inputKey = String(payload.openseaApiKey || "").trim();
    const resolvedSecrets = resolveIntegrationSecrets(integrationSecrets);
    const savedKey = String(integrationSecrets.openseaApiKey || "").trim();
    apiKey = inputKey || resolvedSecrets.openseaApiKey;

    if (!apiKey) {
      throw new Error("Add an OpenSea API key first.");
    }

    const result = await verifyOpenSeaApiKey(apiKey);
    updateIntegrationHealthFromKeyTest("openseaApiKey", inputKey, apiKey);

    sendJson(response, 200, {
      ok: true,
      source: resolvedKeySource(inputKey, savedKey),
      ...result,
      settings: buildPublicSettings()
    });
  } catch (error) {
    updateIntegrationHealthFromKeyTest("openseaApiKey", inputKey, apiKey, error);
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function deleteSavedApiKey(secretName) {
  const definition = assistantApiKeyDefinitions[secretName];
  if (!definition) {
    throw createHttpError(`API key "${secretName}" is unavailable`, 400);
  }

  const settingsBefore = buildPublicSettings();
  const sourceProperty = `${secretName}Source`;
  const configuredProperty = `${secretName}Configured`;
  const sourceBefore = String(settingsBefore[sourceProperty] || "").trim();

  if (!sourceBefore) {
    throw createHttpError(`${definition.label} is not configured`, 404);
  }

  if (sourceBefore !== "saved") {
    throw createHttpError(`${definition.label} is managed through environment variables`, 400);
  }

  await database.deleteSecret(secretStorageKeys[secretName]);
  delete integrationSecrets[secretName];
  setIntegrationHealth(secretName, "missing");
  emitState();

  const settingsAfter = buildPublicSettings();
  return {
    ok: true,
    secretName,
    label: definition.label,
    sourceBefore,
    sourceAfter: String(settingsAfter[sourceProperty] || "").trim(),
    configuredAfter: Boolean(settingsAfter[configuredProperty])
  };
}

async function handleExplorerKeyDelete(response) {
  try {
    const result = await deleteSavedApiKey("explorerApiKey");
    sendJson(response, 200, { ...result, settings: buildPublicSettings() });
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
}

async function handleOpenAiKeyDelete(response) {
  try {
    const result = await deleteSavedApiKey("openaiApiKey");
    sendJson(response, 200, { ...result, settings: buildPublicSettings() });
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
}

async function handleAlchemyKeyDelete(response) {
  try {
    const result = await deleteSavedApiKey("alchemyApiKey");
    sendJson(response, 200, { ...result, settings: buildPublicSettings() });
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
}

async function handleDrpcKeyDelete(response) {
  try {
    const result = await deleteSavedApiKey("drpcApiKey");
    sendJson(response, 200, { ...result, settings: buildPublicSettings() });
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
}

async function handleOpenSeaKeyDelete(response) {
  try {
    const result = await deleteSavedApiKey("openseaApiKey");
    sendJson(response, 200, { ...result, settings: buildPublicSettings() });
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
}

async function handleSettingsSave(request, response) {
  try {
    const payload = await readJsonBody(request);
    const settingsOverrides = {};
    if (Object.prototype.hasOwnProperty.call(payload, "profileName")) {
      settingsOverrides.profileName = payload.profileName;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "theme")) {
      settingsOverrides.theme = payload.theme;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "resultsPath")) {
      settingsOverrides.resultsPath = payload.resultsPath;
    }
    const nextSettings = normalizeDashboardSettings({
      ...appState.settings,
      ...settingsOverrides
    });
    const secretInputs = {
      explorerApiKey: String(payload.explorerApiKey || "").trim(),
      openaiApiKey: String(payload.openaiApiKey || "").trim(),
      alchemyApiKey: String(payload.alchemyApiKey || "").trim(),
      drpcApiKey: String(payload.drpcApiKey || "").trim(),
      openseaApiKey: String(payload.openseaApiKey || "").trim()
    };

    if (secretInputs.explorerApiKey) {
      await verifyExplorerApiKey(secretInputs.explorerApiKey);
    }
    if (secretInputs.openaiApiKey) {
      await verifyOpenAiApiKey(secretInputs.openaiApiKey);
    }
    if (secretInputs.alchemyApiKey) {
      await verifyAlchemyApiKey(secretInputs.alchemyApiKey);
    }
    if (secretInputs.drpcApiKey) {
      await verifyDrpcApiKey(secretInputs.drpcApiKey);
    }
    if (secretInputs.openseaApiKey) {
      await verifyOpenSeaApiKey(secretInputs.openseaApiKey);
    }

    appState.settings = nextSettings;

    await persistAppState();

    for (const [secretName, value] of Object.entries(secretInputs)) {
      if (!value) {
        continue;
      }

      await database.upsertSecret(secretStorageKeys[secretName], encryptSecret(value));
      integrationSecrets[secretName] = value;
      setIntegrationHealth(secretName, "healthy");
    }

    emitState();
    sendJson(response, 200, { ok: true, settings: buildPublicSettings() });
  } catch (error) {
    sendJson(response, 400, { error: formatError(error) });
  }
}

async function handleRpcDelete(rpcId, response) {
  try {
    const result = await deleteRpcNodeById(rpcId);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: formatError(error) });
  }
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
    ensureLoginAllowed(request);

    const payload = await readJsonBody(request);
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");

    if (!username || !password) {
      throw new Error("Username and password are required");
    }

    const user = await database.getUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      const attemptBucket = recordFailedLoginAttempt(request);
      if (attemptBucket.blockedUntil && attemptBucket.blockedUntil > Date.now()) {
        const rateLimitError = buildLoginRateLimitError(attemptBucket.blockedUntil);
        sendJson(
          response,
          rateLimitError.statusCode || 429,
          { error: rateLimitError.message },
          { "Retry-After": String(rateLimitError.retryAfterSeconds || 1) }
        );
        return;
      }

      sendJson(response, 401, { error: "Invalid username or password" });
      return;
    }

    clearLoginAttempts(request);

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
    const statusCode = error.statusCode || 400;
    const headers = error.retryAfterSeconds
      ? { "Retry-After": String(error.retryAfterSeconds) }
      : undefined;
    sendJson(response, statusCode, { error: formatError(error) }, headers);
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
    applySecurityHeaders(response);

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

    if (request.method === "GET" && url.pathname === "/api/mint-radar/opensea") {
      await handleOpenSeaMintRadar(url, response);
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
      await handleTaskStop(route[2], response);
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

    if (request.method === "POST" && url.pathname === "/api/control/test-openai-key") {
      await handleOpenAiKeyTest(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/control/test-alchemy-key") {
      await handleAlchemyKeyTest(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/control/test-drpc-key") {
      await handleDrpcKeyTest(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/control/test-opensea-key") {
      await handleOpenSeaKeyTest(request, response);
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

    if (request.method === "GET" && route[0] === "api" && route[1] === "wallets" && route[2] && route[3] === "assets") {
      await handleWalletAssets(route[2], response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rpc-nodes/inspect") {
      await handleRpcInspect(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rpc-nodes/ai-advice") {
      await handleRpcAiAdvice(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/assistant/chat") {
      await handleAssistantChat(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rpc-nodes/chainlist-candidates") {
      await handleChainlistRpcCandidates(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rpc-nodes/alchemy-candidates") {
      await handleAlchemyRpcCandidates(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rpc-nodes/drpc-candidates") {
      await handleDrpcRpcCandidates(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rpc-nodes/import-chainlist") {
      await handleChainlistRpcImport(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rpc-nodes/import-alchemy") {
      await handleAlchemyRpcImport(request, response);
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

    if (
      request.method === "POST" &&
      route[0] === "api" &&
      route[1] === "rpc-nodes" &&
      route[3] === "fix"
    ) {
      await handleRpcFix(route[2], response);
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

    if (request.method === "DELETE" && url.pathname === "/api/settings/openai-key") {
      await handleOpenAiKeyDelete(response);
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/settings/alchemy-key") {
      await handleAlchemyKeyDelete(response);
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/settings/drpc-key") {
      await handleDrpcKeyDelete(response);
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/settings/opensea-key") {
      await handleOpenSeaKeyDelete(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/contracts/autofill") {
      await handleContractAutofill(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/sources/discover") {
      await handleSourceDiscovery(request, response);
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
      const address = server.address();
      const boundPort =
        address && typeof address === "object" && "port" in address ? address.port : port;
      console.log(`Mint dashboard running at http://${host}:${boundPort}`);
      resolve(server);
    });
  });
}

async function cleanupServerResources() {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    if (scheduledTaskLoop) {
      clearInterval(scheduledTaskLoop);
      scheduledTaskLoop = null;
    }
    scheduledTaskScanInFlight = false;

    const coordinatorToClose = queueCoordinator;
    const databaseToClose = database;

    queueCoordinator = null;
    database = null;
    initialized = false;

    distributedRunState = createIdleRunState(getQueueConfig());
    distributedQueuedTaskIds.clear();
    distributedTaskPatches.clear();
    clearAllQueuedTaskFallbacks();

    const shutdownErrors = [];

    if (coordinatorToClose?.close) {
      try {
        await coordinatorToClose.close();
      } catch (error) {
        shutdownErrors.push(error);
      }
    }

    if (databaseToClose?.close) {
      try {
        await databaseToClose.close();
      } catch (error) {
        shutdownErrors.push(error);
      }
    }

    if (shutdownErrors.length > 0) {
      throw shutdownErrors[0];
    }
  })().finally(() => {
    shutdownPromise = null;
  });

  return shutdownPromise;
}

async function stopServer() {
  if (server.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await cleanupServerResources();
}

server.on("close", () => {
  void cleanupServerResources().catch(reportBackgroundError);
});

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Dashboard startup failed:");
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  extractOpenSeaCollectionSlug,
  parseOpenSeaMintRadarEntries,
  resolveHost,
  resolvePort,
  startServer,
  stopServer
};
