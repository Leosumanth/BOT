function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }

  return value;
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function hasContent(value) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim() !== "";
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return true;
}

function normalizeAddressKey(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || "").trim()) ? String(value).trim().toLowerCase() : null;
}

function normalizeObjectKey(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function getValueAtPath(source, path) {
  if (source === undefined || source === null || isBlank(path)) {
    return source;
  }

  const segments = String(path)
    .trim()
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  let current = source;
  for (const segment of segments) {
    if (current === undefined || current === null) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function stringifyTemplateValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  return JSON.stringify(value);
}

function resolvePlaceholderValue(expression, context) {
  const normalized = String(expression || "").trim();
  if (!normalized) {
    return undefined;
  }

  const aliasMap = {
    wallet: "walletAddress",
    address: "walletAddress",
    walletchecksum: "walletChecksum",
    index: "walletIndex",
    contract: "contractAddress",
    quantity: "quantity",
    project: "projectKey"
  };

  const directKey = aliasMap[normalizeObjectKey(normalized)] || normalized;
  return getValueAtPath(context, directKey);
}

function applyTemplatePlaceholders(value, context) {
  if (Array.isArray(value)) {
    return value.map((entry) => applyTemplatePlaceholders(entry, context));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, applyTemplatePlaceholders(entry, context)])
    );
  }

  if (typeof value !== "string") {
    return value;
  }

  const exactMatch = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (exactMatch) {
    return cloneValue(resolvePlaceholderValue(exactMatch[1], context));
  }

  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) =>
    stringifyTemplateValue(resolvePlaceholderValue(expression, context))
  );
}

function isClaimRecordMatch(record, context = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return false;
  }

  const walletAddress = normalizeAddressKey(context.walletAddress);
  const walletId = String(context.walletId || "").trim();
  const walletIndex = Number.isInteger(context.walletIndex) ? context.walletIndex : null;
  const recordAddress = normalizeAddressKey(record.walletAddress || record.address || record.wallet);
  const recordWalletId = String(record.walletId || record.id || "").trim();
  const recordWalletIndex =
    record.walletIndex !== undefined && record.walletIndex !== null ? Number(record.walletIndex) : null;

  if (walletAddress && recordAddress && walletAddress === recordAddress) {
    return true;
  }

  if (walletId && recordWalletId && walletId === recordWalletId) {
    return true;
  }

  if (walletIndex !== null && Number.isFinite(recordWalletIndex) && walletIndex === recordWalletIndex) {
    return true;
  }

  return false;
}

function resolveWalletClaimRecord(walletClaims, context = {}) {
  if (!walletClaims) {
    return null;
  }

  if (Array.isArray(walletClaims)) {
    const matched = walletClaims.find((entry) => isClaimRecordMatch(entry, context));
    return matched ? cloneValue(matched) : null;
  }

  if (typeof walletClaims !== "object") {
    return null;
  }

  if (isClaimRecordMatch(walletClaims, context)) {
    return cloneValue(walletClaims);
  }

  const addressKeys = [
    normalizeAddressKey(context.walletAddress),
    String(context.walletAddress || "").trim()
  ].filter(Boolean);
  for (const key of addressKeys) {
    if (walletClaims[key] && typeof walletClaims[key] === "object") {
      return cloneValue(walletClaims[key]);
    }
  }

  const normalizedAddress = normalizeAddressKey(context.walletAddress);
  if (normalizedAddress) {
    for (const [key, value] of Object.entries(walletClaims)) {
      if (normalizeAddressKey(key) === normalizedAddress && value && typeof value === "object") {
        return cloneValue(value);
      }
    }
  }

  const idKeys = [String(context.walletId || "").trim(), String(context.walletIndex ?? "").trim()].filter(Boolean);
  for (const key of idKeys) {
    if (walletClaims[key] && typeof walletClaims[key] === "object") {
      return cloneValue(walletClaims[key]);
    }
  }

  for (const fallbackKey of ["default", "*"]) {
    if (walletClaims[fallbackKey] && typeof walletClaims[fallbackKey] === "object") {
      return cloneValue(walletClaims[fallbackKey]);
    }
  }

  const nestedCollections = [walletClaims.wallets, walletClaims.entries, walletClaims.claims];
  for (const collection of nestedCollections) {
    const matched = resolveWalletClaimRecord(collection, context);
    if (matched) {
      return matched;
    }
  }

  return null;
}

function extractMappedClaimRecord(payload, mapping = {}, root = "") {
  const source = isBlank(root) ? payload : getValueAtPath(payload, root);
  if (source === undefined || source === null) {
    return null;
  }

  const mappingEntries =
    mapping && typeof mapping === "object" && !Array.isArray(mapping) ? Object.entries(mapping) : [];

  if (mappingEntries.length === 0) {
    return source && typeof source === "object" ? cloneValue(source) : { value: cloneValue(source) };
  }

  const record = {};
  for (const [targetKey, descriptor] of mappingEntries) {
    let resolvedValue;

    if (typeof descriptor === "string") {
      resolvedValue = getValueAtPath(source, descriptor);
    } else if (descriptor && typeof descriptor === "object" && !Array.isArray(descriptor)) {
      if (Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        resolvedValue = descriptor.value;
      } else {
        resolvedValue = getValueAtPath(source, descriptor.path);
        if (resolvedValue === undefined && Object.prototype.hasOwnProperty.call(descriptor, "fallback")) {
          resolvedValue = descriptor.fallback;
        }
      }
    }

    if (resolvedValue !== undefined) {
      record[targetKey] = cloneValue(resolvedValue);
    }
  }

  return Object.keys(record).length > 0 ? record : null;
}

function mergeClaimRecords(...records) {
  let merged = null;

  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      continue;
    }

    if (!merged) {
      merged = {};
    }

    for (const [key, value] of Object.entries(record)) {
      if (
        merged[key] &&
        typeof merged[key] === "object" &&
        !Array.isArray(merged[key]) &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        merged[key] = mergeClaimRecords(merged[key], value);
      } else {
        merged[key] = cloneValue(value);
      }
    }
  }

  return merged;
}

function buildCookieHeader(cookies) {
  if (!cookies) {
    return "";
  }

  if (typeof cookies === "string") {
    return cookies.trim();
  }

  if (Array.isArray(cookies)) {
    return cookies
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .join("; ");
  }

  if (typeof cookies === "object") {
    return Object.entries(cookies)
      .filter(([, value]) => !isBlank(value))
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  return String(cookies).trim();
}

function hasClaimAutomation(source = {}) {
  const enabled =
    source.claimIntegrationEnabled ??
    source.CLAIM_INTEGRATION_ENABLED ??
    source.claimFetchEnabled ??
    source.CLAIM_FETCH_ENABLED ??
    false;

  if (!enabled) {
    return false;
  }

  return Boolean(
    hasContent(source.walletClaims) ||
      hasContent(source.WALLET_CLAIMS_JSON) ||
      hasContent(source.walletClaimsJson) ||
      ((source.claimFetchEnabled ?? source.CLAIM_FETCH_ENABLED ?? false) &&
        !isBlank(source.claimFetchUrl ?? source.CLAIM_FETCH_URL))
  );
}

module.exports = {
  applyTemplatePlaceholders,
  buildCookieHeader,
  cloneValue,
  extractMappedClaimRecord,
  getValueAtPath,
  hasClaimAutomation,
  mergeClaimRecords,
  normalizeObjectKey,
  resolveWalletClaimRecord
};
