function trimValue(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
}

function normalizeStage(value) {
  const normalized = trimValue(value, "auto")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const supportedStages = new Set(["auto", "public", "allowlist", "gtd", "custom"]);
  return supportedStages.has(normalized) ? normalized : "auto";
}

function normalizeHost(hostname = "") {
  return trimValue(hostname)
    .toLowerCase()
    .replace(/^www\./i, "");
}

function safeParseUrl(value = "") {
  const candidate = trimValue(value);
  if (!/^https?:\/\//i.test(candidate)) {
    return null;
  }

  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function stripQueryAndHash(url) {
  if (!url) {
    return "";
  }

  const clone = new URL(url.toString());
  clone.search = "";
  clone.hash = "";
  return clone.toString();
}

function pathSegments(url) {
  return String(url?.pathname || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function humanizeSlug(slug = "") {
  const normalized = trimValue(slug);
  if (!normalized) {
    return "";
  }

  return normalized
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => {
      if (/^\d+$/.test(segment)) {
        return segment;
      }

      if (segment.length <= 3) {
        return segment.toUpperCase();
      }

      return segment[0].toUpperCase() + segment.slice(1);
    })
    .join(" ");
}

function normalizeIdentifier(value = "") {
  return trimValue(value)
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[\s]+/g, "-");
}

function buildDiscoveryPlan(sourceType) {
  switch (sourceType) {
    case "opensea":
    case "magiceden":
      return {
        key: "official_api_then_on_chain_then_source_backend",
        steps: ["official_api", "on_chain", "source_backend"],
        summary:
          "Start with official or public source metadata, trust on-chain state where possible, and use the source backend only when eligibility, proofs, or signed payloads are required."
      };
    case "custom_launchpad":
      return {
        key: "source_page_then_on_chain_then_source_backend",
        steps: ["source_page", "on_chain", "source_backend"],
        summary:
          "Parse the launch page or configured project API first, use on-chain reads for truth when possible, and call the project backend only when the mint depends on proofs or signatures."
      };
    case "generic_contract":
    default:
      return {
        key: "on_chain_then_optional_claim_backend",
        steps: ["on_chain", "claim_backend_optional"],
        summary:
          "Use direct contract reads and local ABI encoding first. Only use a claim or backend adapter when the task configuration explicitly requires off-chain proofs or payloads."
      };
  }
}

function buildSummary(label, displayTarget = "", stage = "auto") {
  const parts = [label];
  if (displayTarget) {
    parts.push(displayTarget);
  }
  if (stage && stage !== "auto") {
    parts.push(stage);
  }
  return parts.join(" / ");
}

function buildBaseContext(sourceType, sourceLabel, input = {}) {
  const sourceTarget = trimValue(input.sourceTarget || input.sourceConfig?.target || "");
  const sourceStage = normalizeStage(input.sourceStage || input.sourceConfig?.stage || "auto");

  return {
    sourceType,
    sourceLabel,
    sourceTarget,
    sourceStage,
    hasTarget: Boolean(sourceTarget),
    valid: true,
    error: "",
    warnings: [],
    targetKind: "",
    targetHost: "",
    normalizedTarget: "",
    canonicalUrl: "",
    displayTarget: "",
    pageType: "",
    projectSlug: "",
    projectLabel: "",
    chainHint: trimValue(input.sourceConfig?.chainKey || ""),
    discoveryPlan: buildDiscoveryPlan(sourceType),
    summary: buildSummary(sourceLabel, "", sourceStage)
  };
}

function resolveGenericContractSource(input = {}) {
  const context = buildBaseContext("generic_contract", "Generic Contract", input);
  if (context.hasTarget) {
    const parsedUrl = safeParseUrl(context.sourceTarget);
    context.targetKind = parsedUrl ? "reference_url" : "identifier";
    context.targetHost = normalizeHost(parsedUrl?.hostname || "");
    context.normalizedTarget = parsedUrl ? stripQueryAndHash(parsedUrl) : context.sourceTarget;
    context.displayTarget = parsedUrl
      ? `${context.targetHost}${parsedUrl.pathname}`.replace(/\/$/, "")
      : context.sourceTarget;
  }
  context.summary = buildSummary(context.sourceLabel, context.displayTarget, context.sourceStage);
  return context;
}

function resolveOpenSeaSource(input = {}) {
  const context = buildBaseContext("opensea", "OpenSea", input);
  if (!context.hasTarget) {
    context.warnings.push("OpenSea tasks should include the current collection or drop URL.");
    return context;
  }

  const parsedUrl = safeParseUrl(context.sourceTarget);
  if (!parsedUrl) {
    const slug = normalizeIdentifier(context.sourceTarget);
    if (!slug || slug.includes("/")) {
      context.valid = false;
      context.error = "OpenSea source target must be a collection URL or collection slug.";
      return context;
    }

    context.targetKind = "collection";
    context.projectSlug = slug;
    context.projectLabel = humanizeSlug(slug);
    context.normalizedTarget = slug;
    context.canonicalUrl = `https://opensea.io/collection/${slug}`;
    context.displayTarget = slug;
    context.summary = buildSummary(context.sourceLabel, context.displayTarget, context.sourceStage);
    return context;
  }

  const host = normalizeHost(parsedUrl.hostname);
  if (!host.endsWith("opensea.io")) {
    context.valid = false;
    context.error = "OpenSea source target must point to an opensea.io URL.";
    return context;
  }

  const segments = pathSegments(parsedUrl);
  context.targetHost = host;
  context.normalizedTarget = stripQueryAndHash(parsedUrl);

  if (segments[0] === "collection" && segments[1]) {
    context.targetKind = "collection";
    context.projectSlug = normalizeIdentifier(segments[1]);
    context.projectLabel = humanizeSlug(context.projectSlug);
    context.pageType = segments[2] || "collection";
    context.canonicalUrl = `https://opensea.io/collection/${context.projectSlug}`;
    context.displayTarget = context.projectSlug;
  } else if (segments[0] === "assets" && segments[1] && segments[2]) {
    context.targetKind = "asset";
    context.pageType = "asset";
    context.projectSlug = normalizeIdentifier(segments[2]);
    context.projectLabel = humanizeSlug(context.projectSlug);
    context.canonicalUrl = stripQueryAndHash(parsedUrl);
    context.displayTarget = `${segments[0]}/${segments[1]}/${segments[2]}`;
  } else {
    const fallbackSlug = normalizeIdentifier(
      [...segments].reverse().find((segment) => !["overview", "mint"].includes(segment.toLowerCase())) || ""
    );
    context.targetKind = "url";
    context.pageType = segments[0] || "page";
    context.projectSlug = fallbackSlug;
    context.projectLabel = humanizeSlug(fallbackSlug);
    context.canonicalUrl = stripQueryAndHash(parsedUrl);
    context.displayTarget = fallbackSlug || `${host}${parsedUrl.pathname}`.replace(/\/$/, "");
  }

  context.summary = buildSummary(context.sourceLabel, context.displayTarget, context.sourceStage);
  return context;
}

function resolveMagicEdenSource(input = {}) {
  const context = buildBaseContext("magiceden", "Magic Eden", input);
  if (!context.hasTarget) {
    context.warnings.push("Magic Eden tasks should include the current launchpad or collection URL.");
    return context;
  }

  const parsedUrl = safeParseUrl(context.sourceTarget);
  if (!parsedUrl) {
    const slug = normalizeIdentifier(context.sourceTarget);
    if (!slug || slug.includes("/")) {
      context.valid = false;
      context.error = "Magic Eden source target must be a launchpad URL or slug.";
      return context;
    }

    context.targetKind = "launchpad";
    context.projectSlug = slug;
    context.projectLabel = humanizeSlug(slug);
    context.normalizedTarget = slug;
    context.canonicalUrl = `https://magiceden.us/launchpad/${slug}`;
    context.displayTarget = slug;
    context.summary = buildSummary(context.sourceLabel, context.displayTarget, context.sourceStage);
    return context;
  }

  const host = normalizeHost(parsedUrl.hostname);
  if (!host.endsWith("magiceden.io") && !host.endsWith("magiceden.us")) {
    context.valid = false;
    context.error = "Magic Eden source target must point to a magiceden.io or magiceden.us URL.";
    return context;
  }

  const segments = pathSegments(parsedUrl);
  context.targetHost = host;
  context.normalizedTarget = stripQueryAndHash(parsedUrl);

  if (segments[0] === "launchpad" && segments[1]) {
    context.targetKind = "launchpad";
    context.pageType = "launchpad";
    context.projectSlug = normalizeIdentifier(segments[1]);
  } else if (segments[0] === "mint-terminal" && segments[1]) {
    context.targetKind = "mint_terminal";
    context.pageType = "mint_terminal";
    context.projectSlug = normalizeIdentifier(segments[1]);
  } else if (segments[0] === "collections" && segments[1]) {
    context.targetKind = "collection";
    context.pageType = "collection";
    context.projectSlug = normalizeIdentifier(segments[1]);
  } else {
    context.targetKind = "url";
    context.pageType = segments[0] || "page";
    context.projectSlug = normalizeIdentifier(segments[segments.length - 1] || "");
  }

  context.projectLabel = humanizeSlug(context.projectSlug);
  context.canonicalUrl = stripQueryAndHash(parsedUrl);
  context.displayTarget =
    context.projectSlug || `${host}${parsedUrl.pathname}`.replace(/\/$/, "");
  context.summary = buildSummary(context.sourceLabel, context.displayTarget, context.sourceStage);
  return context;
}

function resolveCustomLaunchpadSource(input = {}) {
  const context = buildBaseContext("custom_launchpad", "Custom Launchpad", input);
  if (!context.hasTarget) {
    context.warnings.push("Custom launchpad tasks work best with a mint page URL or stable launch identifier.");
    return context;
  }

  const parsedUrl = safeParseUrl(context.sourceTarget);
  if (parsedUrl) {
    const host = normalizeHost(parsedUrl.hostname);
    const segments = pathSegments(parsedUrl);
    const fallbackSlug = normalizeIdentifier(segments[segments.length - 1] || host);
    context.targetKind = "url";
    context.targetHost = host;
    context.normalizedTarget = stripQueryAndHash(parsedUrl);
    context.canonicalUrl = context.normalizedTarget;
    context.projectSlug = fallbackSlug;
    context.projectLabel = humanizeSlug(fallbackSlug);
    context.displayTarget = `${host}${parsedUrl.pathname}`.replace(/\/$/, "");
    context.summary = buildSummary(context.sourceLabel, context.displayTarget, context.sourceStage);
    return context;
  }

  if (/\s/.test(context.sourceTarget)) {
    context.valid = false;
    context.error = "Custom launchpad source target must be a URL or identifier without spaces.";
    return context;
  }

  context.targetKind = "identifier";
  context.normalizedTarget = context.sourceTarget;
  context.projectSlug = normalizeIdentifier(context.sourceTarget);
  context.projectLabel = humanizeSlug(context.projectSlug);
  context.displayTarget = context.sourceTarget;
  context.summary = buildSummary(context.sourceLabel, context.displayTarget, context.sourceStage);
  return context;
}

function resolveMintSourceAdapter(sourceType, input = {}) {
  const normalizedType = trimValue(sourceType, "generic_contract")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  switch (normalizedType) {
    case "opensea":
      return resolveOpenSeaSource(input);
    case "magiceden":
      return resolveMagicEdenSource(input);
    case "custom_launchpad":
      return resolveCustomLaunchpadSource(input);
    case "generic_contract":
    default:
      return resolveGenericContractSource(input);
  }
}

module.exports = {
  buildDiscoveryPlan,
  humanizeSlug,
  resolveMintSourceAdapter
};
