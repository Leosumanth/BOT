const ZERO_BYTES_32 = `0x${"00".repeat(32)}`;

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

const commonPriceReadFunctionNames = [
  "publicSalePrice",
  "mintPrice",
  "publicMintPrice",
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

function normalizeAbiName(value) {
  return String(value || "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function abiFunctionEntries(abiEntries) {
  return (abiEntries || [])
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

function payableAbiFunctionEntries(abiEntries) {
  return writableAbiFunctionEntries(abiEntries).filter(
    (entry) => String(entry.stateMutability || "").toLowerCase() === "payable"
  );
}

function abiFunctionNameMap(abiEntries) {
  return abiFunctionEntries(abiEntries).reduce((map, entry) => {
    const lowerName = entry.name.toLowerCase();
    if (!map.has(lowerName)) {
      map.set(lowerName, entry.name);
    }
    return map;
  }, new Map());
}

function findAbiFunctionEntry(abiEntries, requestedName = "") {
  const nameMap = abiFunctionNameMap(abiEntries);
  const actualName = nameMap.get(String(requestedName || "").trim().toLowerCase());
  if (!actualName) {
    return null;
  }

  return abiFunctionEntries(abiEntries).find((entry) => entry.name === actualName) || null;
}

function isIntegerAbiType(type) {
  return /^u?int(\d+)?$/i.test(String(type || ""));
}

function isAddressAbiType(type) {
  return /^address$/i.test(String(type || ""));
}

function isBoolAbiType(type) {
  return /^bool$/i.test(String(type || ""));
}

function isStringAbiType(type) {
  return /^string$/i.test(String(type || ""));
}

function isBytesAbiType(type) {
  return /^bytes(\d+)?$/i.test(String(type || ""));
}

function getArrayTypeInfo(type) {
  const normalized = String(type || "").trim();
  const match = normalized.match(/^(.*)\[(\d*)\]$/);
  if (!match) {
    return null;
  }

  return {
    baseType: match[1],
    length: match[2] === "" ? null : Number(match[2])
  };
}

function formatFunctionSignature(entry) {
  const inputTypes = Array.isArray(entry?.inputs) ? entry.inputs.map((input) => input.type).join(",") : "";
  return `${entry?.name || "unknown"}(${inputTypes})`;
}

function inputLabel(input) {
  return String(input?.name || "").trim().toLowerCase();
}

function looksLikeQuantityInput(input, inputIndex, totalInputs) {
  const name = inputLabel(input);
  const type = String(input?.type || "");

  if (!isIntegerAbiType(type)) {
    return false;
  }

  if (
    /quantity|qty|amount|count|num|number|tokens|mintamount|purchaseamount|buyamount|claimamount/.test(
      name
    )
  ) {
    return true;
  }

  return totalInputs === 1 && inputIndex === 0;
}

function looksLikeRecipientInput(input) {
  const name = inputLabel(input);
  return /wallet|account|recipient|receiver|user|buyer|owner|to|addr|address/.test(name);
}

function looksLikeProofInput(input) {
  return /proof|merkle|whitelist|allowlist|allow|wl/.test(inputLabel(input));
}

function looksLikeSignatureInput(input) {
  return /sig|signature|voucher|auth|signed|permit/.test(inputLabel(input));
}

function looksLikeTokenIdInput(input) {
  return /tokenid|id$|edition|index/.test(inputLabel(input));
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }

  return value;
}

function zeroBytes(length) {
  return `0x${"00".repeat(length)}`;
}

function defaultValueForAbiInput(input, inputIndex, totalInputs, options = {}) {
  const type = String(input?.type || "").trim();
  const walletAddress = options.walletAddress || "{{wallet}}";
  const quantity = options.quantity ?? 1;

  if (!type) {
    return {
      supported: false,
      reason: "missing ABI type"
    };
  }

  if (/^tuple/i.test(type)) {
    if (/\[(\d*)\]$/.test(type)) {
      return {
        supported: true,
        value: []
      };
    }

    if (!Array.isArray(input.components)) {
      return {
        supported: false,
        reason: `tuple input "${input?.name || "unnamed"}" is missing components`
      };
    }

    const values = [];
    for (const [componentIndex, component] of input.components.entries()) {
      const resolved = defaultValueForAbiInput(component, componentIndex, input.components.length, options);
      if (!resolved.supported) {
        return resolved;
      }
      values.push(resolved.value);
    }

    return {
      supported: true,
      value: values
    };
  }

  const arrayInfo = getArrayTypeInfo(type);
  if (arrayInfo) {
    if (arrayInfo.length === null) {
      return {
        supported: true,
        value: []
      };
    }

    const elementResolution = defaultValueForAbiInput(
      {
        ...input,
        type: arrayInfo.baseType
      },
      inputIndex,
      totalInputs,
      options
    );

    if (!elementResolution.supported) {
      return elementResolution;
    }

    return {
      supported: true,
      value: Array.from({ length: arrayInfo.length }, () => cloneValue(elementResolution.value))
    };
  }

  if (isAddressAbiType(type)) {
    return {
      supported: true,
      value: walletAddress
    };
  }

  if (isBoolAbiType(type)) {
    return {
      supported: true,
      value: false
    };
  }

  if (isStringAbiType(type)) {
    return {
      supported: true,
      value: ""
    };
  }

  if (/^bytes$/i.test(type)) {
    return {
      supported: true,
      value: "0x"
    };
  }

  const fixedBytesMatch = type.match(/^bytes(\d+)$/i);
  if (fixedBytesMatch) {
    return {
      supported: true,
      value: zeroBytes(Number(fixedBytesMatch[1]))
    };
  }

  if (isIntegerAbiType(type)) {
    return {
      supported: true,
      value: looksLikeQuantityInput(input, inputIndex, totalInputs) ? quantity : 0
    };
  }

  return {
    supported: false,
    reason: `unsupported ABI type ${type}`
  };
}

function resolveFunctionArgsFromEntry(entry, options = {}) {
  const inputs = Array.isArray(entry?.inputs) ? entry.inputs : [];
  const args = [];

  for (const [inputIndex, input] of inputs.entries()) {
    const resolved = defaultValueForAbiInput(input, inputIndex, inputs.length, options);
    if (!resolved.supported) {
      return {
        supported: false,
        reason: resolved.reason,
        args: null
      };
    }

    args.push(resolved.value);
  }

  return {
    supported: true,
    reason: null,
    args
  };
}

function estimateInputComplexity(entry) {
  return (entry?.inputs || []).reduce((score, input, inputIndex) => {
    const type = String(input?.type || "");
    const arrayInfo = getArrayTypeInfo(type);

    if (/^tuple/i.test(type)) {
      return score + 6;
    }

    if (arrayInfo) {
      return score + 3;
    }

    if (looksLikeProofInput(input) || looksLikeSignatureInput(input)) {
      return score + 3;
    }

    if (looksLikeTokenIdInput(input)) {
      return score + 2;
    }

    if (isAddressAbiType(type) || looksLikeQuantityInput(input, inputIndex, entry.inputs.length)) {
      return score + 1;
    }

    return score + 2;
  }, 0);
}

function mintFunctionCandidateScore(entry) {
  const normalizedName = normalizeAbiName(entry?.name);
  if (!normalizedName) {
    return -1;
  }

  if (
    /^(set|get|is|has|supports|owner|admin|pause|unpause|toggle|update|edit|configure|config|withdraw|airdrop|reserve)/.test(
      normalizedName
    )
  ) {
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

  if (/public|sale|open|live/.test(normalizedName)) {
    score += 160;
  }

  if (/allowlist|whitelist|presale|presell|private/.test(normalizedName)) {
    score -= 120;
  }

  if (/owner|admin|team|dev|gift|promo|partner|reserve|airdrop/.test(normalizedName)) {
    score -= 300;
  }

  if (
    /price|cost|fee|state|status|active|paused|open|live|start|end|time|date|phase|supply|limit|max|remaining|nonce|proof|signature|signer|root|baseuri|tokenuri|balanceof|ownerof/.test(
      normalizedName
    )
  ) {
    score -= 200;
  }

  const payable = String(entry.stateMutability || "").toLowerCase() === "payable";
  if (payable) {
    score += 150;
  }

  const inputs = Array.isArray(entry.inputs) ? entry.inputs : [];
  const inputCount = inputs.length;
  const inputComplexity = estimateInputComplexity(entry);

  if (inputCount === 0) {
    score += 180;
  } else if (inputCount === 1 && looksLikeQuantityInput(inputs[0], 0, inputCount)) {
    score += 140;
  } else if (
    inputCount === 1 &&
    (isAddressAbiType(inputs[0].type) || isBytesAbiType(inputs[0].type))
  ) {
    score += 40;
  } else if (
    inputCount === 2 &&
    inputs.some((input) => isAddressAbiType(input.type)) &&
    inputs.some((input, inputIndex) => looksLikeQuantityInput(input, inputIndex, inputCount))
  ) {
    score += 110;
  }

  if (inputs.some((input) => looksLikeProofInput(input))) {
    score -= 220;
  }

  if (inputs.some((input) => looksLikeSignatureInput(input))) {
    score -= 220;
  }

  if (inputs.some((input) => looksLikeTokenIdInput(input))) {
    score -= 150;
  }

  score -= inputComplexity * 25;
  return score;
}

function buildMintFunctionAnalysis(abiEntries, requestedFunction = "") {
  const requestedLower = String(requestedFunction || "").trim().toLowerCase();
  const writableFunctions = writableAbiFunctionEntries(abiEntries);
  const payableFunctions = payableAbiFunctionEntries(abiEntries).map((entry) => ({
    name: entry.name,
    signature: formatFunctionSignature(entry),
    inputs: Array.isArray(entry.inputs) ? entry.inputs : [],
    stateMutability: entry.stateMutability || "nonpayable"
  }));

  const candidates = writableFunctions
    .map((entry) => {
      const argResolution = resolveFunctionArgsFromEntry(entry, {
        walletAddress: "{{wallet}}",
        quantity: 1
      });
      const score = mintFunctionCandidateScore(entry);
      const payable = String(entry.stateMutability || "").toLowerCase() === "payable";
      const keywordMatch = /mint|claim|buy|purchase/.test(entry.name.toLowerCase());

      return {
        name: entry.name,
        signature: formatFunctionSignature(entry),
        inputs: Array.isArray(entry.inputs) ? entry.inputs : [],
        stateMutability: entry.stateMutability || "nonpayable",
        payable,
        keywordMatch,
        score,
        supported: argResolution.supported,
        unsupportedReason: argResolution.reason,
        defaultArgs: argResolution.args
      };
    })
    .filter((candidate) => candidate.score > 0 || (candidate.payable && candidate.score >= 0))
    .sort((left, right) => {
      const leftRequested = left.name.toLowerCase() === requestedLower;
      const rightRequested = right.name.toLowerCase() === requestedLower;

      if (leftRequested !== rightRequested) {
        return rightRequested - leftRequested;
      }

      return right.score - left.score || left.inputs.length - right.inputs.length || left.name.localeCompare(right.name);
    });

  return {
    payableFunctions,
    candidates,
    detectedFunctions: candidates.map((candidate) => candidate.name),
    bestCandidate: candidates[0] || null
  };
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
  const requested = String(requestedFunction || "").trim();
  const namesByLower = abiFunctionNameMap(abiEntries);
  const matchedRequestedFunction = requested ? namesByLower.get(requested.toLowerCase()) || "" : "";
  const analysis = buildMintFunctionAnalysis(abiEntries, requestedFunction);

  return {
    detectedFunctions: analysis.detectedFunctions,
    mintFunction: matchedRequestedFunction || analysis.bestCandidate?.name || requested
  };
}

function inferMintArgsFromAbi(abiEntries, mintFunction = "", options = {}) {
  const mintEntry = findAbiFunctionEntry(abiEntries, mintFunction);
  if (!mintEntry?.inputs?.length) {
    return [];
  }

  const resolved = resolveFunctionArgsFromEntry(mintEntry, options);
  return resolved.supported ? resolved.args : [];
}

function getReadOnlyAbiFunctions(abiEntries) {
  return (abiEntries || []).filter(
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
      (type) =>
        /^bool$/i.test(String(type || "")) ||
        isIntegerAbiType(type) ||
        /^string$/i.test(String(type || ""))
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

module.exports = {
  ZERO_BYTES_32,
  abiFunctionEntries,
  abiFunctionNameMap,
  buildMintFunctionAnalysis,
  commonPriceReadFunctionNames,
  defaultValueForAbiInput,
  describeMintFunctionDetection,
  detectMintStartFunctionsFromAbi,
  findAbiFunctionEntry,
  formatFunctionSignature,
  inferMintArgsFromAbi,
  isIntegerAbiType,
  mintFunctionCandidateScore,
  normalizeAbiName,
  payableAbiFunctionEntries,
  preferredMintFunctionNames,
  resolveFunctionArgsFromEntry,
  resolveMintFunctionFromAbi,
  writableAbiFunctionEntries
};
