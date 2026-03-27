const defaultMintSourceType = "generic_contract";
const defaultMintSourceStage = "auto";

const mintSourceCatalog = Object.freeze({
  generic_contract: {
    type: "generic_contract",
    label: "Generic Contract",
    shortLabel: "Generic",
    description: "Direct contract minting with local ABI, RPC routing, and optional claim fetch.",
    capabilities: {
      backendPayload: false,
      eligibilityChecks: "contract_or_claim",
      scheduleSync: false,
      sessionAuth: false
    },
    configExample: {
      target: "",
      stage: "auto"
    }
  },
  opensea: {
    type: "opensea",
    label: "OpenSea",
    shortLabel: "OpenSea",
    description: "Marketplace adapter foundation for OpenSea drops, stage discovery, and future source-auth hooks.",
    capabilities: {
      backendPayload: true,
      eligibilityChecks: "source_backend_or_contract",
      scheduleSync: true,
      sessionAuth: true
    },
    configExample: {
      target: "https://opensea.io/collection/example-drop",
      stage: "allowlist",
      authMode: "session_cookie",
      chainKey: "base"
    }
  },
  magiceden: {
    type: "magiceden",
    label: "Magic Eden",
    shortLabel: "Magic Eden",
    description: "Marketplace adapter foundation for Magic Eden launch pages and source-specific mint preparation.",
    capabilities: {
      backendPayload: true,
      eligibilityChecks: "source_backend_or_contract",
      scheduleSync: true,
      sessionAuth: true
    },
    configExample: {
      target: "https://magiceden.io/launchpad/example-drop",
      stage: "allowlist",
      chainKey: "ethereum"
    }
  },
  custom_launchpad: {
    type: "custom_launchpad",
    label: "Custom Launchpad",
    shortLabel: "Launchpad",
    description: "Use this for third-party mint sites that need custom HTTP preparation, proofs, or signed payload fetches.",
    capabilities: {
      backendPayload: true,
      eligibilityChecks: "custom_backend",
      scheduleSync: true,
      sessionAuth: true
    },
    configExample: {
      target: "https://mint.project.xyz/drop/example",
      stage: "allowlist",
      eligibilityUrl: "https://mint.project.xyz/api/eligibility/{{wallet}}"
    }
  }
});

function normalizeMintSourceType(value) {
  const normalized = String(value || defaultMintSourceType)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (mintSourceCatalog[normalized]) {
    return normalized;
  }

  return defaultMintSourceType;
}

function normalizeMintSourceStage(value) {
  const normalized = String(value || defaultMintSourceStage)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  const supportedStages = new Set(["auto", "public", "allowlist", "gtd", "custom"]);
  return supportedStages.has(normalized) ? normalized : defaultMintSourceStage;
}

function getMintSourceDefinition(type) {
  return mintSourceCatalog[normalizeMintSourceType(type)] || mintSourceCatalog[defaultMintSourceType];
}

function listMintSourceDefinitions() {
  return Object.values(mintSourceCatalog).map((definition) => ({
    ...definition,
    configExample: cloneMintSourceValue(definition.configExample)
  }));
}

function cloneMintSourceValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneMintSourceValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneMintSourceValue(entry)])
    );
  }

  return value;
}

function sanitizeMintSourceConfig(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => {
        const normalizedKey = String(key || "").trim();
        if (!normalizedKey) {
          return null;
        }

        if (typeof entry === "string") {
          const trimmed = entry.trim();
          return trimmed ? [normalizedKey, trimmed] : null;
        }

        if (Array.isArray(entry)) {
          return [normalizedKey, entry.map((item) => cloneMintSourceValue(item))];
        }

        if (entry && typeof entry === "object") {
          return [normalizedKey, sanitizeMintSourceConfig(entry)];
        }

        if (entry === undefined) {
          return null;
        }

        return [normalizedKey, entry];
      })
      .filter(Boolean)
  );
}

function parseMintSourceConfig(rawValue, options = {}) {
  const { allowEmpty = true, fieldName = "SOURCE_CONFIG_JSON" } = options;

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return {};
  }

  if (typeof rawValue === "object") {
    if (Array.isArray(rawValue)) {
      throw new Error(`${fieldName} must be a JSON object`);
    }

    return sanitizeMintSourceConfig(rawValue);
  }

  try {
    const parsed = JSON.parse(String(rawValue));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${fieldName} must be a JSON object`);
    }

    return sanitizeMintSourceConfig(parsed);
  } catch (error) {
    if (allowEmpty && String(rawValue).trim() === "") {
      return {};
    }

    throw new Error(`Unable to parse ${fieldName}: ${error.message}`);
  }
}

function serializeMintSourceConfig(config = {}) {
  const sanitized = sanitizeMintSourceConfig(config);
  return Object.keys(sanitized).length > 0 ? JSON.stringify(sanitized, null, 2) : "";
}

function mergeMintSourceConfig(baseConfig = {}, patchConfig = {}) {
  return sanitizeMintSourceConfig({
    ...sanitizeMintSourceConfig(baseConfig),
    ...sanitizeMintSourceConfig(patchConfig)
  });
}

function buildMintSourceSummary(sourceType, options = {}) {
  const definition = getMintSourceDefinition(sourceType);
  const target = String(options.target || "").trim();
  const stage = normalizeMintSourceStage(options.stage);

  if (target && stage !== "auto") {
    return `${definition.label} / ${target} / ${stage}`;
  }

  if (target) {
    return `${definition.label} / ${target}`;
  }

  if (stage !== "auto") {
    return `${definition.label} / ${stage}`;
  }

  return definition.label;
}

function normalizeMintSourceSelection(input = {}) {
  const sourceType = normalizeMintSourceType(input.sourceType);
  const sourceTarget = String(input.sourceTarget || "").trim();
  const sourceStage = normalizeMintSourceStage(input.sourceStage);
  const sourceConfig = sanitizeMintSourceConfig(
    mergeMintSourceConfig(parseMintSourceConfig(input.sourceConfig, { fieldName: "SOURCE_CONFIG_JSON" }), {
      target: sourceTarget || undefined,
      stage: sourceStage !== defaultMintSourceStage ? sourceStage : undefined
    })
  );

  return {
    sourceType,
    sourceTarget,
    sourceStage,
    sourceLabel: getMintSourceDefinition(sourceType).label,
    sourceConfig,
    sourceConfigJson: serializeMintSourceConfig(sourceConfig)
  };
}

function validateMintSourceSelection(sourceType, selection = {}) {
  const normalizedType = normalizeMintSourceType(sourceType);
  const definition = getMintSourceDefinition(normalizedType);
  const sourceTarget = String(selection.sourceTarget || "").trim();

  if (normalizedType === "generic_contract") {
    return;
  }

  if (!sourceTarget && !selection.sourceConfig?.target) {
    return;
  }

  if (/^https?:\/\//i.test(sourceTarget)) {
    return;
  }

  if (sourceTarget.includes(" ")) {
    throw new Error(`${definition.label} source target must be a URL, slug, or identifier without spaces`);
  }
}

async function prepareMintSourceConfig(config, hooks = {}) {
  const sourceSelection = normalizeMintSourceSelection({
    sourceType: config.sourceType,
    sourceTarget: config.sourceTarget,
    sourceStage: config.sourceStage,
    sourceConfig: config.sourceConfig
  });
  const definition = getMintSourceDefinition(sourceSelection.sourceType);
  const logger = hooks.logger;
  const summary = buildMintSourceSummary(sourceSelection.sourceType, sourceSelection);

  logger?.info(`Mint source: ${summary}`);
  if (sourceSelection.sourceType !== defaultMintSourceType) {
    logger?.info(
      `${definition.label} adapter foundation is active. Source-specific auth, eligibility, and payload preparation can extend this task without changing the core mint runner.`
    );
  }

  return {
    ...config,
    ...sourceSelection,
    sourceCapabilities: cloneMintSourceValue(definition.capabilities),
    sourceDescription: definition.description
  };
}

module.exports = {
  buildMintSourceSummary,
  defaultMintSourceStage,
  defaultMintSourceType,
  getMintSourceDefinition,
  listMintSourceDefinitions,
  mergeMintSourceConfig,
  normalizeMintSourceSelection,
  normalizeMintSourceStage,
  normalizeMintSourceType,
  parseMintSourceConfig,
  prepareMintSourceConfig,
  serializeMintSourceConfig,
  validateMintSourceSelection
};
