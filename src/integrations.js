const { ethers } = require("ethers");

const EXPLORER_BASE_URL = "https://api.etherscan.io/v2/api";

const secretEnvNames = {
  explorerApiKey: "ETHERSCAN_API_KEY",
  discordWebhookUrl: "DISCORD_WEBHOOK_URL"
};

const secretStorageKeys = {
  explorerApiKey: "explorer_api_key",
  discordWebhookUrl: "discord_webhook_url"
};

function createDefaultDashboardSettings() {
  return {
    profileName: "local",
    theme: "quantum-operator",
    resultsPath: "./dist/mint-results.json",
    discordEnabled: false,
    alertOnRunStart: true,
    alertOnRunSuccess: true,
    alertOnRunFailure: true,
    alertOnRunStop: true
  };
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return fallback;
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
    resultsPath: trimValue(source.resultsPath, fallback.resultsPath),
    discordEnabled: normalizeBoolean(source.discordEnabled, fallback.discordEnabled),
    alertOnRunStart: normalizeBoolean(source.alertOnRunStart, fallback.alertOnRunStart),
    alertOnRunSuccess: normalizeBoolean(source.alertOnRunSuccess, fallback.alertOnRunSuccess),
    alertOnRunFailure: normalizeBoolean(source.alertOnRunFailure, fallback.alertOnRunFailure),
    alertOnRunStop: normalizeBoolean(source.alertOnRunStop, fallback.alertOnRunStop)
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

  return {
    ...normalized,
    explorerApiKeyConfigured: Boolean(resolved.explorerApiKey),
    discordWebhookUrlConfigured: Boolean(resolved.discordWebhookUrl),
    discordConfigured: Boolean(resolved.discordWebhookUrl)
  };
}

function shouldSendEvent(settings, eventType) {
  if (eventType === "test") {
    return true;
  }

  return {
    run_start: settings.alertOnRunStart,
    run_success: settings.alertOnRunSuccess,
    run_failure: settings.alertOnRunFailure,
    run_stopped: settings.alertOnRunStop
  }[eventType] !== false;
}

function buildAlertTitle(eventType) {
  return {
    test: "Test Alert",
    run_start: "Run Started",
    run_success: "Run Completed",
    run_failure: "Run Failed",
    run_stopped: "Run Stopped"
  }[eventType] || "Alert";
}

function buildAlertMessage({ eventType, task, chainLabel, summary, error }) {
  const walletCount =
    typeof task?.walletCount === "number"
      ? task.walletCount
      : Array.isArray(task?.walletIds)
        ? task.walletIds.length
        : null;

  const lines = [`Mint Bot Alert: ${buildAlertTitle(eventType)}`];

  if (task?.name) {
    lines.push(`Task: ${task.name}`);
  }

  if (chainLabel) {
    lines.push(`Chain: ${chainLabel}`);
  }

  if (task?.contractAddress) {
    lines.push(`Contract: ${task.contractAddress}`);
  }

  if (walletCount !== null) {
    lines.push(`Wallets: ${walletCount}`);
  }

  if (summary) {
    lines.push(
      `Summary: ${summary.success || 0} success / ${summary.failed || 0} failed / ${summary.stopped || 0} stopped`
    );
    if (Array.isArray(summary.hashes) && summary.hashes.length > 0) {
      const preview = summary.hashes.slice(0, 3).join(", ");
      const suffix = summary.hashes.length > 3 ? ` (+${summary.hashes.length - 3} more)` : "";
      lines.push(`Hashes: ${preview}${suffix}`);
    }
  }

  if (error) {
    lines.push(`Error: ${error}`);
  }

  lines.push(`At: ${new Date().toISOString()}`);
  return lines.join("\n");
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

async function sendDiscordAlert({ webhookUrl, message }) {
  const target = new URL(webhookUrl);
  target.searchParams.set("wait", "true");

  await fetchJson(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: message
    })
  });
}

async function sendConfiguredAlert({ settings, storedSecrets = {}, eventType, task, chainLabel, summary, error }) {
  const normalizedSettings = normalizeDashboardSettings(settings);
  if (!shouldSendEvent(normalizedSettings, eventType)) {
    return {
      attempted: 0,
      sent: 0,
      channels: [],
      skipped: true,
      reason: "event_disabled",
      errors: []
    };
  }

  const resolvedSecrets = resolveIntegrationSecrets(storedSecrets);
  const message = buildAlertMessage({
    eventType,
    task,
    chainLabel,
    summary,
    error
  });

  const deliveries = [];

  if (normalizedSettings.discordEnabled && resolvedSecrets.discordWebhookUrl) {
    deliveries.push({
      channel: "discord",
      send: () =>
        sendDiscordAlert({
          webhookUrl: resolvedSecrets.discordWebhookUrl,
          message
        })
    });
  }

  if (!deliveries.length) {
    return {
      attempted: 0,
      sent: 0,
      channels: [],
      skipped: true,
      reason: "no_configured_channels",
      errors: []
    };
  }

  const settled = await Promise.allSettled(deliveries.map((delivery) => delivery.send()));
  const channels = [];
  const errors = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      channels.push(deliveries[index].channel);
      return;
    }

    errors.push({
      channel: deliveries[index].channel,
      message: formatError(result.reason)
    });
  });

  if (!channels.length) {
    throw new Error(errors.map((entry) => `${entry.channel}: ${entry.message}`).join("; "));
  }

  return {
    attempted: deliveries.length,
    sent: channels.length,
    channels,
    skipped: false,
    errors
  };
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
  secretStorageKeys,
  sendConfiguredAlert
};
