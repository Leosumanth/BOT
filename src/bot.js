const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const mintAutomation = require("./mint-automation");

class AbortRunError extends Error {
  constructor(message = "Run stopped by user") {
    super(message);
    this.name = "AbortRunError";
  }
}

const erc721TransferEventInterface = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
]);
const erc1155TransferEventInterface = new ethers.Interface([
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)"
]);
const erc721TransferInterface = new ethers.Interface([
  "function transferFrom(address from, address to, uint256 tokenId)"
]);
const erc1155TransferInterface = new ethers.Interface([
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)"
]);

const ERC721_TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const ERC1155_TRANSFER_SINGLE_TOPIC = ethers.id(
  "TransferSingle(address,address,address,uint256,uint256)"
);
const ERC1155_TRANSFER_BATCH_TOPIC = ethers.id(
  "TransferBatch(address,address,address,uint256[],uint256[])"
);

function createLogger(hooks = {}) {
  const emit = (level, message) => {
    hooks.onLog?.({
      level,
      message,
      timestamp: new Date().toISOString()
    });
  };

  return {
    info(message) {
      emit("info", message);
      if (!hooks.onLog) {
        console.log(message);
      }
    },
    error(message) {
      emit("error", message);
      if (!hooks.onLog) {
        console.error(message);
      }
    }
  };
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new AbortRunError();
  }
}

function sleep(ms, signal) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(new AbortRunError());
    };

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function withAbort(promise, signal) {
  if (!signal) {
    return promise;
  }

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        reject(new AbortRunError());
      };

      signal.addEventListener("abort", onAbort, { once: true });
    })
  ]);
}

async function waitUntil(isoString, pollIntervalMs, signal, logger) {
  if (!isoString) {
    return;
  }

  const target = new Date(isoString);
  if (Number.isNaN(target.getTime())) {
    throw new Error(`Invalid WAIT_UNTIL_ISO value: ${isoString}`);
  }

  while (Date.now() < target.getTime()) {
    throwIfAborted(signal);
    const remainingMs = target.getTime() - Date.now();
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    logger.info(`Waiting for launch time: ${remainingSeconds}s remaining`);
    await sleep(Math.min(pollIntervalMs, remainingMs), signal);
  }
}

function applyPlaceholders(value, context) {
  if (Array.isArray(value)) {
    return value.map((entry) => applyPlaceholders(entry, context));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, applyPlaceholders(entry, context)])
    );
  }

  if (typeof value !== "string") {
    return value;
  }

  return value
    .replaceAll("{{wallet}}", context.walletAddress)
    .replaceAll("{{index}}", String(context.walletIndex))
    .replaceAll("{{timestamp}}", String(context.timestamp));
}

function buildBaseOverrides(config) {
  const overrides = {
    value: ethers.parseEther(config.mintValueEth)
  };

  if (config.gasLimit) {
    overrides.gasLimit = BigInt(config.gasLimit);
  }

  if (config.gasStrategy === "custom" && config.maxFeeGwei) {
    overrides.maxFeePerGas = ethers.parseUnits(String(config.maxFeeGwei), "gwei");
  }

  if (config.gasStrategy === "custom" && config.maxPriorityFeeGwei) {
    overrides.maxPriorityFeePerGas = ethers.parseUnits(
      String(config.maxPriorityFeeGwei),
      "gwei"
    );
  }

  return overrides;
}

function applyPercentBoost(value, percent) {
  if (value == null) {
    return undefined;
  }

  const multiplier = BigInt(Math.round((100 + percent) * 100));
  return (value * multiplier) / 10000n;
}

function resolveGasStrategyProfile(strategy) {
  if (strategy === "aggressive") {
    return {
      maxFeeBoostPercent: 18,
      priorityBoostPercent: 25
    };
  }

  return {
    maxFeeBoostPercent: 0,
    priorityBoostPercent: 0
  };
}

function getEffectiveGasBoostPercent(config) {
  const profile = resolveGasStrategyProfile(config.gasStrategy);
  return profile.maxFeeBoostPercent + (config.gasBoostPercent || 0);
}

function getEffectivePriorityBoostPercent(config) {
  const profile = resolveGasStrategyProfile(config.gasStrategy);
  return profile.priorityBoostPercent + (config.priorityBoostPercent || 0);
}

async function buildRuntimeOverrides(config, provider) {
  const overrides = buildBaseOverrides(config);
  if (config.autoMintMode) {
    return {
      ...overrides,
      ...(await buildCompetitiveFeeOverrides(provider, config))
    };
  }

  const customNeedsNetworkFees =
    config.gasStrategy === "custom" &&
    (overrides.maxFeePerGas == null || overrides.maxPriorityFeePerGas == null);

  if (config.gasStrategy !== "custom" || customNeedsNetworkFees) {
    const feeData = await provider.getFeeData();
    const gasBoostPercent =
      config.gasStrategy === "custom" ? config.gasBoostPercent || 0 : getEffectiveGasBoostPercent(config);
    const priorityBoostPercent =
      config.gasStrategy === "custom"
        ? config.priorityBoostPercent || 0
        : getEffectivePriorityBoostPercent(config);

    if (overrides.maxFeePerGas == null && feeData.maxFeePerGas != null) {
      overrides.maxFeePerGas = applyPercentBoost(feeData.maxFeePerGas, gasBoostPercent);
    }

    if (overrides.maxPriorityFeePerGas == null && feeData.maxPriorityFeePerGas != null) {
      overrides.maxPriorityFeePerGas = applyPercentBoost(
        feeData.maxPriorityFeePerGas,
        priorityBoostPercent
      );
    }

    if (
      overrides.maxFeePerGas == null &&
      overrides.maxPriorityFeePerGas == null &&
      feeData.gasPrice != null
    ) {
      overrides.gasPrice = applyPercentBoost(feeData.gasPrice, gasBoostPercent);
    }
  }

  return overrides;
}

async function getAggressivePriorityFeePerGas(provider) {
  try {
    const feeHistory = await provider.send("eth_feeHistory", [5, "latest", [90, 95]]);
    const rewards = Array.isArray(feeHistory?.reward)
      ? feeHistory.reward
          .flat()
          .map((value) => {
            try {
              return BigInt(value);
            } catch {
              return null;
            }
          })
          .filter((value) => value != null)
      : [];

    if (rewards.length > 0) {
      return rewards.reduce((highest, value) => (value > highest ? value : highest), rewards[0]);
    }
  } catch {
    // Fall back to simpler fee APIs when fee history is unavailable.
  }

  try {
    const value = await provider.send("eth_maxPriorityFeePerGas", []);
    if (value != null) {
      return BigInt(value);
    }
  } catch {
    // Keep falling back.
  }

  const feeData = await provider.getFeeData();
  return feeData.maxPriorityFeePerGas ?? undefined;
}

async function buildCompetitiveFeeOverrides(provider, config, options = {}) {
  const manualMaxFeePerGas =
    config.maxFeeGwei != null ? ethers.parseUnits(String(config.maxFeeGwei), "gwei") : undefined;
  const manualPriorityFeePerGas =
    config.maxPriorityFeeGwei != null
      ? ethers.parseUnits(String(config.maxPriorityFeeGwei), "gwei")
      : undefined;

  if (config.gasStrategy === "custom" && manualMaxFeePerGas != null && manualPriorityFeePerGas != null) {
    return {
      maxFeePerGas: maxDefinedBigInt(options.minMaxFeePerGas, manualMaxFeePerGas),
      maxPriorityFeePerGas: maxDefinedBigInt(
        options.minMaxPriorityFeePerGas,
        manualPriorityFeePerGas
      )
    };
  }

  const retryBumpPercent = Math.max(
    0,
    (Math.max(1, Number(options.attempt || 1)) - 1) * (config.replacementBumpPercent || 0)
  );
  const gasBoostPercent = (config.gasBoostPercent || 0) + retryBumpPercent;
  const priorityBoostPercent = (config.priorityBoostPercent || 0) + retryBumpPercent;
  const latestBlock = await provider.getBlock("latest").catch(() => null);
  const feeData = await provider.getFeeData();
  const baseFeePerGas = latestBlock?.baseFeePerGas ?? feeData.lastBaseFeePerGas ?? null;
  let maxPriorityFeePerGas = maxDefinedBigInt(
    options.minMaxPriorityFeePerGas,
    manualPriorityFeePerGas,
    await getAggressivePriorityFeePerGas(provider),
    feeData.maxPriorityFeePerGas
  );

  if (maxPriorityFeePerGas != null) {
    maxPriorityFeePerGas = applyPercentBoost(maxPriorityFeePerGas, priorityBoostPercent);
  }

  if (baseFeePerGas != null && maxPriorityFeePerGas != null) {
    let maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas;
    maxFeePerGas = applyPercentBoost(maxFeePerGas, gasBoostPercent);
    maxFeePerGas = maxDefinedBigInt(options.minMaxFeePerGas, manualMaxFeePerGas, maxFeePerGas);

    return {
      maxFeePerGas: maxDefinedBigInt(maxFeePerGas, maxPriorityFeePerGas),
      maxPriorityFeePerGas
    };
  }

  const gasPrice = maxDefinedBigInt(
    options.minGasPrice,
    feeData.gasPrice != null ? applyPercentBoost(feeData.gasPrice, gasBoostPercent) : undefined
  );

  if (gasPrice != null) {
    return { gasPrice };
  }

  return {};
}

function addGasBuffer(value, percent = 20) {
  const multiplier = BigInt(Math.round((100 + percent) * 100));
  const buffered = (BigInt(value) * multiplier) / 10000n;
  return buffered > value ? buffered : BigInt(value) + 1n;
}

function formatEthValue(value) {
  if (value == null) {
    return "0";
  }

  const formatted = ethers.formatEther(value);
  return formatted.includes(".") ? formatted.replace(/\.?0+$/, "") : formatted;
}

function extractRevertMessage(error) {
  const candidates = [
    error?.shortMessage,
    error?.reason,
    error?.message,
    error?.info?.error?.message,
    error?.info?.payload?.error?.message,
    error?.error?.message,
    error?.data?.message,
    error?.receipt?.revertReason
  ].filter(Boolean);

  return candidates[0] || null;
}

function buildPlanFailureSummary(failures) {
  return failures
    .map((failure) => `${failure.signature}: ${failure.error}`)
    .slice(0, 5)
    .join(" | ");
}

function buildAutomatedMintArgs(config, session, candidate) {
  if (
    config.mintArgsProvided &&
    config.mintFunctionProvided &&
    String(candidate.name || "").toLowerCase() === String(config.mintFunction || "").toLowerCase()
  ) {
    return {
      supported: true,
      args: applyPlaceholders(config.mintArgsTemplate, {
        walletAddress: session.walletAddress,
        walletIndex: session.walletIndex,
        timestamp: Date.now()
      }),
      source: "config"
    };
  }

  const argResolution = mintAutomation.resolveFunctionArgsFromEntry(candidate, {
    walletAddress: session.walletAddress,
    quantity: 1
  });
  if (!argResolution.supported) {
    return {
      supported: false,
      reason: argResolution.reason,
      source: "auto"
    };
  }

  return {
    supported: true,
    args: argResolution.args,
    source: "auto"
  };
}

function extractCandidateQuantity(candidate, args) {
  const inputs = Array.isArray(candidate?.inputs) ? candidate.inputs : [];

  for (const [index, input] of inputs.entries()) {
    if (!mintAutomation.isIntegerAbiType(input?.type)) {
      continue;
    }

    if (!/quantity|qty|amount|count|num|number|tokens|mintamount|purchaseamount|buyamount|claimamount/i.test(String(input?.name || ""))) {
      continue;
    }

    const value = normalizeNumberish(args[index]);
    if (value != null && value > 0n) {
      return value;
    }
  }

  return 1n;
}

async function readCommonMintPrice(session) {
  if (session.cachedMintPrice !== undefined) {
    return session.cachedMintPrice;
  }

  for (const functionName of mintAutomation.commonPriceReadFunctionNames) {
    const priceEntry = mintAutomation.findAbiFunctionEntry(session.config.abi, functionName);
    if (
      !priceEntry ||
      priceEntry.inputs?.length > 0 ||
      !["view", "pure"].includes(String(priceEntry.stateMutability || "").toLowerCase())
    ) {
      continue;
    }

    try {
      const value = await session.contract[priceEntry.name]();
      if (typeof value === "bigint") {
        session.cachedMintPrice = {
          value,
          functionName: priceEntry.name
        };
        return session.cachedMintPrice;
      }
    } catch {
      // Keep probing other read functions.
    }
  }

  session.cachedMintPrice = null;
  return null;
}

async function simulateMintMethod(method, args, overrides) {
  try {
    await method.staticCall(...args, overrides);
    return {
      success: true,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      error
    };
  }
}

async function discoverAutomatedMintValue({ config, session, candidate, method, args }) {
  if (!candidate.payable) {
    return {
      value: 0n,
      source: "nonpayable",
      lastError: null
    };
  }

  if (config.mintValueProvided) {
    return {
      value: ethers.parseEther(config.mintValueEth),
      source: "config",
      lastError: null
    };
  }

  const commonPrice = await readCommonMintPrice(session);
  if (commonPrice?.value != null) {
    return {
      value: commonPrice.value * extractCandidateQuantity(candidate, args),
      source: commonPrice.functionName,
      lastError: null
    };
  }

  const zeroValueSimulation = await simulateMintMethod(method, args, { value: 0n });
  if (zeroValueSimulation.success) {
    return {
      value: 0n,
      source: "simulation:free",
      lastError: null
    };
  }

  const probeValues = ["0.001", "0.01", "0.05", "0.1"].map((value) => ethers.parseEther(value));
  let lastError = zeroValueSimulation.error;

  for (const probeValue of probeValues) {
    const simulation = await simulateMintMethod(method, args, { value: probeValue });
    if (simulation.success) {
      return {
        value: probeValue,
        source: `probe:${formatEthValue(probeValue)}`,
        lastError
      };
    }

    lastError = simulation.error;
  }

  return {
    value: 0n,
    source: "fallback:free",
    lastError
  };
}

async function buildAutomatedMintPlan(config, session, context, attempt) {
  const { signal, logger } = context;
  const failures = [];
  const nonce = session.getPlannedNonce();

  for (const candidate of session.automationAnalysis.candidates) {
    throwIfAborted(signal);
    const method = getContractMethod(session.contract, candidate.name);
    const argResolution = buildAutomatedMintArgs(config, session, candidate);

    if (!argResolution.supported) {
      failures.push({
        signature: candidate.signature,
        error: argResolution.reason || "argument resolution failed"
      });
      continue;
    }

    const discoveredValue = await discoverAutomatedMintValue({
      config,
      session,
      candidate,
      method,
      args: argResolution.args
    });
    const feeOverrides = await buildCompetitiveFeeOverrides(session.provider, config, {
      attempt
    });
    const simulationOverrides = {
      ...feeOverrides,
      value: discoveredValue.value
    };

    if (config.autoMintMode || config.simulateTransaction) {
      const simulation = await simulateMintMethod(method, argResolution.args, simulationOverrides);
      if (!simulation.success) {
        failures.push({
          signature: candidate.signature,
          error: extractRevertMessage(simulation.error) || "simulation reverted"
        });
        continue;
      }
    }

    let estimatedGas;
    try {
      estimatedGas = await method.estimateGas(...argResolution.args, simulationOverrides);
    } catch (error) {
      failures.push({
        signature: candidate.signature,
        error: extractRevertMessage(error) || "gas estimation failed"
      });
      continue;
    }

    const txRequest = await method.populateTransaction(...argResolution.args, {
      ...simulationOverrides,
      gasLimit: config.gasLimit ? BigInt(config.gasLimit) : addGasBuffer(estimatedGas, 20),
      nonce
    });

    logger.info(
      `[wallet ${session.walletIndex}] Candidate ${candidate.signature} selected with args ${JSON.stringify(
        argResolution.args
      )}, value ${formatEthValue(discoveredValue.value)} ETH, estimated gas ${estimatedGas}`
    );

    return {
      candidate,
      method,
      args: argResolution.args,
      argsSource: argResolution.source,
      value: discoveredValue.value,
      valueSource: discoveredValue.source,
      estimatedGas,
      gasLimit: txRequest.gasLimit,
      feeOverrides,
      txRequest
    };
  }

  const lastFailure = failures[failures.length - 1] || null;
  throw attachErrorContext(
    new Error(
      `All automated mint candidates failed. ${buildPlanFailureSummary(failures) || "No candidate could be simulated"}`
    ),
    {
      walletAddress: session.walletAddress,
      lastRevertMessage: lastFailure?.error || null,
      automationFailures: failures,
      attemptedFunctions: session.automationAnalysis.candidates.map((candidate) => candidate.signature)
    }
  );
}

function buildGasSettingsSnapshot(source = {}) {
  return {
    gasLimit: source.gasLimit != null ? source.gasLimit.toString() : null,
    gasPrice: source.gasPrice != null ? source.gasPrice.toString() : null,
    maxFeePerGas: source.maxFeePerGas != null ? source.maxFeePerGas.toString() : null,
    maxPriorityFeePerGas:
      source.maxPriorityFeePerGas != null ? source.maxPriorityFeePerGas.toString() : null
  };
}

function isSocketRpcUrl(rpcUrl) {
  return /^wss?:\/\//i.test(String(rpcUrl || ""));
}

function createTransportProvider(rpcUrl) {
  return isSocketRpcUrl(rpcUrl)
    ? new ethers.WebSocketProvider(rpcUrl)
    : new ethers.JsonRpcProvider(rpcUrl);
}

async function destroyProvider(provider) {
  if (!provider?.destroy) {
    return;
  }

  try {
    await provider.destroy();
  } catch {
    // Best effort shutdown for websocket-backed providers.
  }
}

function normalizeEventFragment(signature) {
  const trimmed = String(signature || "").trim();
  return trimmed.startsWith("event ") ? trimmed : `event ${trimmed}`;
}

function resolveMempoolSelector(signature) {
  const trimmed = String(signature || "").trim();
  if (!trimmed) {
    return null;
  }

  if (/^0x[0-9a-fA-F]{8}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return ethers.id(trimmed).slice(0, 10).toLowerCase();
}

function withoutValueOverride(overrides) {
  const { value, ...nextOverrides } = overrides;
  return nextOverrides;
}

function maxDefinedBigInt(...values) {
  return values.reduce((currentMax, value) => {
    if (value == null) {
      return currentMax;
    }

    if (currentMax == null || value > currentMax) {
      return value;
    }

    return currentMax;
  }, undefined);
}

function bumpFeeValue(value, percent) {
  if (value == null) {
    return undefined;
  }

  const bumped = applyPercentBoost(value, percent);
  return bumped > value ? bumped : value + 1n;
}

function formatGwei(value) {
  if (value == null) {
    return "n/a";
  }

  return `${ethers.formatUnits(value, "gwei")} gwei`;
}

function messageIncludesAny(error, patterns) {
  const text = [error?.shortMessage, error?.reason, error?.message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return patterns.some((pattern) => text.includes(pattern));
}

function isRetryableMintError(error, options = {}) {
  const allowRevertRecovery = options.allowRevertRecovery === true;

  if (error instanceof AbortRunError) {
    return false;
  }

  if (error?.receipt?.status === 0 && !allowRevertRecovery) {
    return false;
  }

  const code = String(error?.code || "").toUpperCase();
  if (
    code === "INSUFFICIENT_FUNDS" ||
    code === "ACTION_REJECTED" ||
    code === "INVALID_ARGUMENT" ||
    code === "UNSUPPORTED_OPERATION"
  ) {
    return false;
  }

  if (code === "CALL_EXCEPTION" && !allowRevertRecovery) {
    return false;
  }

  if (
    messageIncludesAny(error, [
      "insufficient funds",
      "user rejected",
      "user denied",
      "denied transaction",
      "invalid argument",
      "unsupported operation"
    ])
  ) {
    return false;
  }

  if (
    !allowRevertRecovery &&
    messageIncludesAny(error, [
      "execution reverted",
      "transaction reverted",
      "mint transaction reverted",
      "call exception"
    ])
  ) {
    return false;
  }

  return true;
}

function hasRetryBudgetRemaining(config, attempt, retryWindowDeadline) {
  if (attempt < config.maxRetries) {
    return true;
  }

  return retryWindowDeadline != null && Date.now() < retryWindowDeadline;
}

function attachErrorContext(error, context) {
  if (!error || typeof error !== "object") {
    return error;
  }

  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined && error[key] === undefined) {
      error[key] = value;
    }
  }

  return error;
}

async function getConfirmedReceipt(tx, confirmations) {
  const receipt = await tx.provider.getTransactionReceipt(tx.hash);
  if (!receipt) {
    return null;
  }

  if (confirmations <= 1 || (await receipt.confirmations()) >= confirmations) {
    return receipt;
  }

  return null;
}

function buildReplacementRequest(tx, feeOverrides) {
  const request = {
    to: tx.to,
    data: tx.data,
    value: tx.value,
    nonce: tx.nonce,
    chainId: tx.chainId,
    type: tx.type,
    gasLimit: tx.gasLimit
  };

  if (tx.accessList != null) {
    request.accessList = tx.accessList;
  }

  if (tx.maxFeePerBlobGas != null) {
    request.maxFeePerBlobGas = tx.maxFeePerBlobGas;
  }

  if (feeOverrides.gasPrice != null) {
    request.gasPrice = feeOverrides.gasPrice;
  }

  if (feeOverrides.maxFeePerGas != null) {
    request.maxFeePerGas = feeOverrides.maxFeePerGas;
  }

  if (feeOverrides.maxPriorityFeePerGas != null) {
    request.maxPriorityFeePerGas = feeOverrides.maxPriorityFeePerGas;
  }

  return request;
}

async function buildReplacementFeeOverrides(config, provider, tx) {
  if (config.autoMintMode || config.gasStrategy === "aggressive") {
    return buildCompetitiveFeeOverrides(provider, config, {
      attempt: 2,
      minGasPrice: bumpFeeValue(tx.gasPrice, config.replacementBumpPercent),
      minMaxFeePerGas: bumpFeeValue(tx.maxFeePerGas, config.replacementBumpPercent),
      minMaxPriorityFeePerGas: bumpFeeValue(tx.maxPriorityFeePerGas, config.replacementBumpPercent)
    });
  }

  const feeData = await provider.getFeeData();
  const gasBoostPercent = getEffectiveGasBoostPercent(config);
  const priorityBoostPercent = getEffectivePriorityBoostPercent(config);

  if (tx.maxFeePerGas != null || tx.maxPriorityFeePerGas != null) {
    const maxPriorityFeePerGas = maxDefinedBigInt(
      bumpFeeValue(tx.maxPriorityFeePerGas, config.replacementBumpPercent),
      applyPercentBoost(feeData.maxPriorityFeePerGas, priorityBoostPercent)
    );
    const maxFeePerGas = maxDefinedBigInt(
      bumpFeeValue(tx.maxFeePerGas, config.replacementBumpPercent),
      applyPercentBoost(feeData.maxFeePerGas, gasBoostPercent),
      maxPriorityFeePerGas
    );

    return {
      maxFeePerGas,
      maxPriorityFeePerGas
    };
  }

  const gasPrice = maxDefinedBigInt(
    bumpFeeValue(tx.gasPrice, config.replacementBumpPercent),
    applyPercentBoost(feeData.gasPrice, gasBoostPercent)
  );

  return { gasPrice };
}

function isTransactionTimeoutError(error) {
  return error?.code === "TIMEOUT";
}

function isTransactionReplacedError(error) {
  return error?.code === "TRANSACTION_REPLACED";
}

async function waitForManagedReceipt({
  tx,
  config,
  walletIndex,
  label,
  logger,
  signal,
  submitReplacement
}) {
  let currentTx = tx;
  let replacementCount = 0;

  while (true) {
    throwIfAborted(signal);

    try {
      const receipt = await withAbort(
        currentTx.wait(config.receiptConfirmations, config.txTimeoutMs),
        signal
      );

      return {
        tx: currentTx,
        receipt,
        replacementCount
      };
    } catch (error) {
      if (error instanceof AbortRunError) {
        throw error;
      }

      if (isTransactionReplacedError(error)) {
        if (error.cancelled) {
          throw attachErrorContext(
            new Error(`${label} transaction was ${error.reason || "replaced"} before confirmation`),
            {
              txHash: currentTx.hash
            }
          );
        }

        logger.info(
          `[wallet ${walletIndex}] ${label} transaction was repriced and confirmed as ${(error.replacement || currentTx).hash}`
        );

        return {
          tx: error.replacement || currentTx,
          receipt: error.receipt,
          replacementCount
        };
      }

      if (!isTransactionTimeoutError(error) || !config.smartGasReplacement) {
        throw attachErrorContext(error, {
          txHash: currentTx.hash
        });
      }

      const receipt = await getConfirmedReceipt(currentTx, config.receiptConfirmations);
      if (receipt) {
        return {
          tx: currentTx,
          receipt,
          replacementCount
        };
      }

      if (replacementCount >= config.replacementMaxAttempts) {
        throw attachErrorContext(
          new Error(
            `${label} transaction timed out after ${replacementCount} replacement attempt(s)`
          ),
          {
            txHash: currentTx.hash
          }
        );
      }

      const feeOverrides = await buildReplacementFeeOverrides(config, currentTx.provider, currentTx);
      const replacementRequest = buildReplacementRequest(currentTx, feeOverrides);

      logger.info(
        `[wallet ${walletIndex}] ${label} timeout detected. Replacing nonce ${currentTx.nonce} with max fee ${formatGwei(
          feeOverrides.maxFeePerGas
        )}, priority ${formatGwei(feeOverrides.maxPriorityFeePerGas)}, gas price ${formatGwei(
          feeOverrides.gasPrice
        )}`
      );

      try {
        currentTx = await submitReplacement(replacementRequest);
        replacementCount += 1;
        logger.info(
          `[wallet ${walletIndex}] Submitted ${label.toLowerCase()} replacement tx ${replacementCount}/${config.replacementMaxAttempts}: ${currentTx.hash}`
        );
      } catch (sendError) {
        const confirmedReceipt = await getConfirmedReceipt(currentTx, config.receiptConfirmations);
        if (confirmedReceipt) {
          return {
            tx: currentTx,
            receipt: confirmedReceipt,
            replacementCount
          };
        }

        throw attachErrorContext(sendError, {
          txHash: currentTx.hash
        });
      }
    }
  }
}

async function sendManagedTransaction({
  send,
  submitReplacement,
  config,
  walletIndex,
  label,
  logger,
  signal,
  onSubmitted
}) {
  const tx = await send();
  onSubmitted?.(tx);
  logger.info(`[wallet ${walletIndex}] Submitted ${label.toLowerCase()} tx: ${tx.hash}`);

  if (!config.waitForReceipt) {
    return {
      tx,
      receipt: null,
      replacementCount: 0
    };
  }

  const result = await waitForManagedReceipt({
    tx,
    config,
    walletIndex,
    label,
    logger,
    signal,
    submitReplacement
  });

  logger.info(`[wallet ${walletIndex}] ${label} confirmed in block ${result.receipt.blockNumber}`);
  logger.info(
    `[wallet ${walletIndex}] ${label} status: ${result.receipt.status === 1 ? "success" : "failed"}`
  );

  return result;
}

function extractMintedAssets(receipt, walletAddress) {
  const normalizedWalletAddress = walletAddress.toLowerCase();
  const mintedAssets = [];

  for (const log of receipt.logs || []) {
    const topic = log.topics?.[0];
    if (!topic) {
      continue;
    }

    try {
      if (topic === ERC721_TRANSFER_TOPIC && log.topics.length === 4) {
        const parsed = erc721TransferEventInterface.parseLog(log);
        if (
          parsed.args.from === ethers.ZeroAddress &&
          parsed.args.to.toLowerCase() === normalizedWalletAddress
        ) {
          mintedAssets.push({
            standard: "erc721",
            tokenAddress: ethers.getAddress(log.address),
            tokenId: parsed.args.tokenId
          });
        }
        continue;
      }

      if (topic === ERC1155_TRANSFER_SINGLE_TOPIC) {
        const parsed = erc1155TransferEventInterface.parseLog(log);
        if (
          parsed.args.from === ethers.ZeroAddress &&
          parsed.args.to.toLowerCase() === normalizedWalletAddress
        ) {
          mintedAssets.push({
            standard: "erc1155",
            tokenAddress: ethers.getAddress(log.address),
            tokenId: parsed.args.id,
            amount: parsed.args.value
          });
        }
        continue;
      }

      if (topic === ERC1155_TRANSFER_BATCH_TOPIC) {
        const parsed = erc1155TransferEventInterface.parseLog(log);
        if (
          parsed.args.from === ethers.ZeroAddress &&
          parsed.args.to.toLowerCase() === normalizedWalletAddress
        ) {
          parsed.args.ids.forEach((tokenId, index) => {
            mintedAssets.push({
              standard: "erc1155",
              tokenAddress: ethers.getAddress(log.address),
              tokenId,
              amount: parsed.args.values[index]
            });
          });
        }
      }
    } catch {
      // Ignore unrelated logs that share topic hashes or malformed payloads.
    }
  }

  return mintedAssets;
}

function aggregateTransferAssets(assets) {
  const aggregatedAssets = [];
  const erc1155Indexes = new Map();

  for (const asset of assets) {
    if (asset.standard !== "erc1155") {
      aggregatedAssets.push(asset);
      continue;
    }

    const key = `${asset.tokenAddress.toLowerCase()}:${asset.tokenId.toString()}`;
    const existingIndex = erc1155Indexes.get(key);

    if (existingIndex == null) {
      erc1155Indexes.set(key, aggregatedAssets.length);
      aggregatedAssets.push({
        ...asset
      });
      continue;
    }

    aggregatedAssets[existingIndex].amount += asset.amount;
  }

  return aggregatedAssets;
}

async function transferMintedAssets({
  config,
  provider,
  rpcUrl,
  wallet,
  walletAddress,
  walletIndex,
  receipt,
  logger,
  signal,
  getPlannedNonce,
  reserveSubmittedNonce
}) {
  const transferAssets = aggregateTransferAssets(extractMintedAssets(receipt, walletAddress));

  if (transferAssets.length === 0) {
    throw new Error(
      "No ERC-721 or ERC-1155 mint events were detected for the wallet, so transfer-after-minted could not continue"
    );
  }

  logger.info(
    `[wallet ${walletIndex}] Preparing ${transferAssets.length} post-mint transfer(s) to ${config.transferAddress}`
  );

  const transferResults = [];

  for (const asset of transferAssets) {
    try {
      throwIfAborted(signal);
      const transferOverrides = {
        ...(withoutValueOverride(await buildRuntimeOverrides(config, provider))),
        nonce: getPlannedNonce()
      };

      let result;

      if (asset.standard === "erc721") {
        const tokenContract = new ethers.Contract(asset.tokenAddress, erc721TransferInterface, wallet);
        logger.info(
          `[wallet ${walletIndex}] Transferring ERC-721 ${asset.tokenAddress} token ${asset.tokenId.toString()}`
        );
        result = await sendManagedTransaction({
          send: () =>
            sendContractTransaction({
              contractMethod: tokenContract.transferFrom,
              args: [walletAddress, config.transferAddress, asset.tokenId],
              overrides: transferOverrides,
              wallet,
              provider,
              rpcUrl,
              config,
              walletIndex,
              label: "Transfer",
              logger,
              signal
            }),
          submitReplacement: (txRequest) =>
            submitTransactionWithRoute({
              wallet,
              provider,
              rpcUrl,
              config,
              txRequest,
              walletIndex,
              label: "Transfer",
              logger,
              signal
            }),
          config,
          walletIndex,
          label: "Transfer",
          logger,
          signal,
          onSubmitted: reserveSubmittedNonce
        });
      } else {
        const tokenContract = new ethers.Contract(asset.tokenAddress, erc1155TransferInterface, wallet);
        logger.info(
          `[wallet ${walletIndex}] Transferring ERC-1155 ${asset.tokenAddress} token ${asset.tokenId.toString()} x${asset.amount.toString()}`
        );
        result = await sendManagedTransaction({
          send: () =>
            sendContractTransaction({
              contractMethod: tokenContract.safeTransferFrom,
              args: [walletAddress, config.transferAddress, asset.tokenId, asset.amount, "0x"],
              overrides: transferOverrides,
              wallet,
              provider,
              rpcUrl,
              config,
              walletIndex,
              label: "Transfer",
              logger,
              signal
            }),
          submitReplacement: (txRequest) =>
            submitTransactionWithRoute({
              wallet,
              provider,
              rpcUrl,
              config,
              txRequest,
              walletIndex,
              label: "Transfer",
              logger,
              signal
            }),
          config,
          walletIndex,
          label: "Transfer",
          logger,
          signal,
          onSubmitted: reserveSubmittedNonce
        });
      }

      transferResults.push({
        standard: asset.standard,
        tokenAddress: asset.tokenAddress,
        tokenId: asset.tokenId.toString(),
        amount: asset.amount?.toString(),
        txHash: result.tx.hash,
        receipt: result.receipt,
        replacementCount: result.replacementCount
      });
    } catch (error) {
      throw attachErrorContext(error, {
        transfers: transferResults,
        transferTxHashes: transferResults.map((entry) => entry.txHash)
      });
    }
  }

  return transferResults;
}

async function createProvider(config, options = {}) {
  const failures = [];
  let rpcUrls = [...config.rpcUrls];

  if (options.requireSocket) {
    rpcUrls = rpcUrls.filter((rpcUrl) => isSocketRpcUrl(rpcUrl));
    if (rpcUrls.length === 0) {
      throw new Error("No websocket RPC URL is configured for this execution mode");
    }
  } else if (options.preferSocket) {
    rpcUrls = rpcUrls.sort((left, right) => Number(isSocketRpcUrl(right)) - Number(isSocketRpcUrl(left)));
  }

  for (const rpcUrl of rpcUrls) {
    let provider = null;

    try {
      provider = createTransportProvider(rpcUrl);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      if (config.requiredChainId && chainId !== config.requiredChainId) {
        throw new Error(
          `RPC chain ID ${chainId} did not match required CHAIN_ID ${config.requiredChainId}`
        );
      }

      return { provider, rpcUrl, chainId };
    } catch (error) {
      failures.push(`${rpcUrl}: ${error.message}`);
      await destroyProvider(provider);
    }
  }

  throw new Error(`Unable to connect to any RPC URL.\n${failures.join("\n")}`);
}

function getContractMethod(contract, name) {
  const method = contract[name];
  if (typeof method !== "function") {
    throw new Error(`Function "${name}" was not found in the ABI.`);
  }

  return method;
}

function stringifyForLog(value) {
  return JSON.stringify(
    value,
    (_, entry) => (typeof entry === "bigint" ? entry.toString() : entry),
    2
  );
}

function normalizeForComparison(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForComparison(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeForComparison(entry)])
    );
  }

  return value;
}

function matchesExpectedStructure(actual, expected) {
  if (expected === undefined) {
    return true;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return false;
    }

    return expected.every((entry, index) => matchesExpectedStructure(actual[index], entry));
  }

  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") {
      return false;
    }

    return Object.entries(expected).every(([key, value]) =>
      matchesExpectedStructure(actual[key], value)
    );
  }

  return (
    stringifyForLog(normalizeForComparison(actual)) ===
    stringifyForLog(normalizeForComparison(expected))
  );
}

function evaluateReadyState(config, value) {
  if (config.readyCheckMode === "truthy") {
    return Boolean(value);
  }

  if (config.readyCheckMode === "falsey") {
    return !value;
  }

  return (
    stringifyForLog(normalizeForComparison(value)) ===
    stringifyForLog(normalizeForComparison(config.readyCheckExpected))
  );
}

function normalizeNumberish(value) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  return null;
}

function isMintStartStateOpen(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (/closed|pause|inactive|disabled|pending|off|notopen|notlive/.test(normalized)) {
      return false;
    }

    return /open|live|active|public|mint|sale/.test(normalized);
  }

  return false;
}

function buildMintStartDetectors(contract, config) {
  const detectionConfig = config.mintStartDetectionConfig || {};
  const checks = [
    detectionConfig.saleActiveFunction
      ? {
          key: "saleActive",
          functionName: detectionConfig.saleActiveFunction,
          semantics: "truthy"
        }
      : null,
    detectionConfig.pausedFunction
      ? {
          key: "paused",
          functionName: detectionConfig.pausedFunction,
          semantics: "paused"
        }
      : null,
    detectionConfig.totalSupplyFunction
      ? {
          key: "totalSupply",
          functionName: detectionConfig.totalSupplyFunction,
          semantics: "increase"
        }
      : null,
    detectionConfig.stateFunction
      ? {
          key: "state",
          functionName: detectionConfig.stateFunction,
          semantics: "state"
        }
      : null
  ].filter(Boolean);

  return checks.map((check) => ({
    ...check,
    method: getContractMethod(contract, check.functionName),
    baselineRaw: undefined,
    baselineLabel: null,
    disabled: false
  }));
}

async function waitForMintStartDetection(contract, config, walletIndex, signal, logger) {
  if (!config.mintStartDetectionEnabled) {
    return;
  }

  const detectors = buildMintStartDetectors(contract, config);
  if (detectors.length === 0) {
    return;
  }

  const pollIntervalMs = Math.max(
    100,
    Number(config.mintStartDetectionConfig?.pollIntervalMs || config.readyCheckIntervalMs || 500)
  );

  logger.info(
    `[wallet ${walletIndex}] Mint start detection armed: ${detectors
      .map((detector) => `${detector.functionName}()`)
      .join(", ")}`
  );

  let pollCount = 0;

  while (true) {
    throwIfAborted(signal);
    pollCount += 1;
    const summaries = [];
    let blockedByPause = false;
    let openSignal = null;

    for (const detector of detectors) {
      if (detector.disabled) {
        continue;
      }

      try {
        const value = await detector.method();
        const valueLabel = stringifyForLog(normalizeForComparison(value));
        let isOpen = false;

        if (detector.semantics === "truthy") {
          isOpen = Boolean(value);
        } else if (detector.semantics === "paused") {
          blockedByPause = Boolean(value);
        } else if (detector.semantics === "increase") {
          if (detector.baselineLabel == null) {
            detector.baselineRaw = value;
            detector.baselineLabel = valueLabel;
            logger.info(
              `[wallet ${walletIndex}] Mint start baseline ${detector.functionName} -> ${valueLabel}`
            );
          } else {
            const currentValue = normalizeNumberish(value);
            const baselineValue = normalizeNumberish(detector.baselineRaw);
            isOpen = currentValue != null && baselineValue != null && currentValue > baselineValue;
          }
        } else if (detector.semantics === "state") {
          if (detector.baselineLabel == null) {
            detector.baselineRaw = value;
            detector.baselineLabel = valueLabel;
            logger.info(
              `[wallet ${walletIndex}] Mint start baseline ${detector.functionName} -> ${valueLabel}`
            );
            isOpen = isMintStartStateOpen(value);
          } else {
            isOpen =
              isMintStartStateOpen(value) ||
              valueLabel !== detector.baselineLabel;
          }
        }

        summaries.push(`${detector.functionName}=${valueLabel}`);

        if (isOpen && !openSignal) {
          openSignal = {
            functionName: detector.functionName,
            valueLabel
          };
        }
      } catch (error) {
        detector.disabled = true;
        logger.error(
          `[wallet ${walletIndex}] Mint start detector ${detector.functionName} disabled: ${formatError(
            error
          )}`
        );
      }
    }

    if (detectors.every((detector) => detector.disabled)) {
      logger.error(
        `[wallet ${walletIndex}] All mint start detectors failed; continuing without mint start detection`
      );
      return;
    }

    if (openSignal && !blockedByPause) {
      logger.info(
        `[wallet ${walletIndex}] Mint start detected via ${openSignal.functionName} -> ${openSignal.valueLabel}`
      );
      return;
    }

    if (pollCount === 1 || pollCount % 10 === 0) {
      logger.info(
        `[wallet ${walletIndex}] Waiting for mint start detection: ${summaries.join(" | ")}${
          blockedByPause ? " | paused=true" : ""
        }`
      );
    }

    await sleep(pollIntervalMs, signal);
  }
}

async function maybeWaitJitter(maxJitterMs, walletIndex, signal, logger) {
  if (!maxJitterMs || maxJitterMs <= 0) {
    return;
  }

  const delayMs = Math.floor(Math.random() * (maxJitterMs + 1));
  if (delayMs === 0) {
    return;
  }

  logger.info(`[wallet ${walletIndex}] Applying ${delayMs}ms startup jitter`);
  await sleep(delayMs, signal);
}

function formatError(error) {
  if (!error) {
    return "Unknown error";
  }

  return error.shortMessage || error.reason || error.message || String(error);
}

function buildRelayRequestParams(config, signedTransaction) {
  if (config.privateRelayMethod === "eth_sendPrivateTransaction") {
    return [
      {
        tx: signedTransaction
      }
    ];
  }

  return [signedTransaction];
}

function extractRelayTransactionHash(result) {
  if (!result) {
    return null;
  }

  if (typeof result === "string") {
    return result;
  }

  if (typeof result === "object") {
    return result.txHash || result.hash || null;
  }

  return null;
}

function buildPrivateRelayTimeoutMs(config) {
  const configuredTimeoutMs = Number(config?.txTimeoutMs);
  if (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0) {
    return Math.max(1000, configuredTimeoutMs);
  }

  return 10000;
}

function createRelayAbortController(signal, timeoutMs) {
  const controller = new AbortController();
  const cleanupFns = [];
  let timedOut = false;

  if (signal?.aborted) {
    controller.abort();
  } else if (signal) {
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    cleanupFns.push(() => signal.removeEventListener("abort", onAbort));
  }

  if (timeoutMs > 0) {
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    cleanupFns.push(() => clearTimeout(timeoutId));
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      cleanupFns.splice(0).forEach((cleanup) => cleanup());
    }
  };
}

async function sendRelayRpcRequest(config, signedTransaction, signal) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable. Use Node.js 18 or newer.");
  }

  throwIfAborted(signal);

  const relayTimeoutMs = buildPrivateRelayTimeoutMs(config);
  const relayAbort = createRelayAbortController(signal, relayTimeoutMs);

  try {
    const response = await fetch(config.privateRelayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.privateRelayHeaders || {})
      },
      body: JSON.stringify({
        id: Date.now(),
        jsonrpc: "2.0",
        method: config.privateRelayMethod,
        params: buildRelayRequestParams(config, signedTransaction)
      }),
      signal: relayAbort.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(
        payload.error?.message ||
          payload.error?.data ||
          payload.result ||
          `Private relay request failed with status ${response.status}`
      );
    }

    return payload.result;
  } catch (error) {
    if (signal?.aborted) {
      throw new AbortRunError();
    }

    if (relayAbort.timedOut()) {
      throw new Error(`Private relay request timed out after ${relayTimeoutMs}ms`);
    }

    throw error;
  } finally {
    relayAbort.cleanup();
  }
}

async function wrapSignedTransactionResponse(provider, signedTransaction) {
  const network = await provider.getNetwork();
  const blockNumber = await provider.getBlockNumber();
  const transaction = ethers.Transaction.from(signedTransaction);
  return provider._wrapTransactionResponse(transaction, network).replaceableTransaction(blockNumber);
}

function buildBroadcastRpcMesh(config, preferredRpcUrl) {
  const uniqueRpcUrls = [];
  const seen = new Set();

  for (const rpcUrl of [preferredRpcUrl, ...(config.rpcUrls || [])]) {
    const normalized = String(rpcUrl || "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    uniqueRpcUrls.push(normalized);
  }

  return uniqueRpcUrls;
}

function isDuplicateBroadcastError(error) {
  const message = formatError(error).toLowerCase();
  return [
    "already known",
    "known transaction",
    "already imported",
    "already in mempool",
    "already exists",
    "tx already exists",
    "already seen",
    "already pending"
  ].some((fragment) => message.includes(fragment));
}

async function broadcastSignedTransactionToRpcTarget({
  sharedProvider,
  primaryRpcUrl,
  targetRpcUrl,
  signedTransaction
}) {
  const isPrimary = targetRpcUrl === primaryRpcUrl;
  const provider = isPrimary ? sharedProvider : createTransportProvider(targetRpcUrl);

  try {
    const tx = await provider.broadcastTransaction(signedTransaction);
    return {
      accepted: true,
      duplicate: false,
      rpcUrl: targetRpcUrl,
      tx: isPrimary ? tx : null
    };
  } catch (error) {
    if (isDuplicateBroadcastError(error)) {
      return {
        accepted: true,
        duplicate: true,
        rpcUrl: targetRpcUrl,
        tx: null
      };
    }

    throw attachErrorContext(error, {
      rpcUrl: targetRpcUrl
    });
  } finally {
    if (!isPrimary) {
      await destroyProvider(provider);
    }
  }
}

async function submitSignedTransactionToPublicRpcMesh({
  provider,
  rpcUrl,
  config,
  signedTransaction,
  walletIndex,
  label,
  logger
}) {
  const meshRpcUrls =
    config.multiRpcBroadcast && (config.rpcUrls || []).length > 1
      ? buildBroadcastRpcMesh(config, rpcUrl)
      : [rpcUrl];

  if (meshRpcUrls.length <= 1) {
    return provider.broadcastTransaction(signedTransaction);
  }

  logger.info(
    `[wallet ${walletIndex}] ${label} multi-RPC broadcast to ${meshRpcUrls.length} RPCs`
  );

  const attempts = meshRpcUrls.map((targetRpcUrl) =>
    broadcastSignedTransactionToRpcTarget({
      sharedProvider: provider,
      primaryRpcUrl: rpcUrl,
      targetRpcUrl,
      signedTransaction
    })
  );

  const acceptedPromise = Promise.any(
    attempts.map((attempt) =>
      attempt.then((result) => {
        if (result.accepted) {
          return result;
        }

        throw new Error(`RPC ${result.rpcUrl} did not accept the transaction`);
      })
    )
  );

  void Promise.allSettled(attempts).then((results) => {
    const acceptedCount = results.filter(
      (result) => result.status === "fulfilled" && result.value.accepted && !result.value.duplicate
    ).length;
    const duplicateCount = results.filter(
      (result) => result.status === "fulfilled" && result.value.duplicate
    ).length;
    const failedCount = results.filter((result) => result.status === "rejected").length;

    logger.info(
      `[wallet ${walletIndex}] ${label} propagation summary: ${acceptedCount} accepted, ${duplicateCount} duplicate, ${failedCount} failed`
    );
  });

  let acceptedResult = null;

  try {
    acceptedResult = await acceptedPromise;
  } catch (error) {
    if (error instanceof AggregateError) {
      throw new Error(
        `${label} multi-RPC broadcast failed across ${meshRpcUrls.length} RPCs: ${error.errors
          .map((entry) => {
            const rpcLabel = entry?.rpcUrl ? `${entry.rpcUrl} -> ` : "";
            return `${rpcLabel}${formatError(entry)}`;
          })
          .join("; ")}`
      );
    }

    throw error;
  }

  if (acceptedResult.tx) {
    return acceptedResult.tx;
  }

  return wrapSignedTransactionResponse(provider, signedTransaction);
}

async function submitSignedTransactionWithRoute({
  provider,
  rpcUrl,
  config,
  signedTransaction,
  walletIndex,
  label,
  logger,
  signal
}) {
  if (!config.privateRelayEnabled) {
    return submitSignedTransactionToPublicRpcMesh({
      provider,
      rpcUrl,
      config,
      signedTransaction,
      walletIndex,
      label,
      logger
    });
  }

  try {
    const relayResult = await sendRelayRpcRequest(config, signedTransaction, signal);
    const relayHash = extractRelayTransactionHash(relayResult);
    const wrappedTransaction = await wrapSignedTransactionResponse(provider, signedTransaction);

    logger.info(
      `[wallet ${walletIndex}] ${label} submitted through private relay${
        relayHash ? ` (${relayHash})` : ""
      }`
    );

    return wrappedTransaction;
  } catch (error) {
    if (error instanceof AbortRunError) {
      throw error;
    }

    if (config.privateRelayOnly) {
      throw new Error(`Private relay submission failed: ${formatError(error)}`);
    }

    logger.error(
      `[wallet ${walletIndex}] Private relay submission failed, falling back to public RPC: ${formatError(error)}`
    );
    return submitSignedTransactionToPublicRpcMesh({
      provider,
      rpcUrl,
      config,
      signedTransaction,
      walletIndex,
      label,
      logger
    });
  }
}

async function submitTransactionWithRoute({
  wallet,
  provider,
  rpcUrl,
  config,
  txRequest,
  walletIndex,
  label,
  logger,
  signal
}) {
  const populatedTransaction = await wallet.populateTransaction(txRequest);
  const signedTransaction = await wallet.signTransaction(populatedTransaction);
  return submitSignedTransactionWithRoute({
    provider,
    rpcUrl,
    config,
    signedTransaction,
    walletIndex,
    label,
    logger,
    signal
  });
}

async function sendContractTransaction({
  contractMethod,
  args,
  overrides,
  wallet,
  provider,
  rpcUrl,
  config,
  walletIndex,
  label,
  logger,
  signal
}) {
  if (!config.privateRelayEnabled && !config.multiRpcBroadcast) {
    return contractMethod(...args, overrides);
  }

  const txRequest = await contractMethod.populateTransaction(...args, overrides);
  return submitTransactionWithRoute({
    wallet,
    provider,
    rpcUrl,
    config,
    txRequest,
    walletIndex,
    label,
    logger,
    signal
  });
}

async function preparePresignedContractTransaction({
  contractMethod,
  args,
  overrides,
  wallet,
  walletIndex,
  label,
  logger
}) {
  const txRequest = await contractMethod.populateTransaction(...args, overrides);
  return preparePresignedTransactionRequest({
    txRequest,
    wallet,
    walletIndex,
    label,
    logger
  });
}

async function preparePresignedTransactionRequest({
  txRequest,
  wallet,
  walletIndex,
  label,
  logger
}) {
  const populatedTransaction = await wallet.populateTransaction(txRequest);
  const signedTransaction = await wallet.signTransaction(populatedTransaction);
  const transaction = ethers.Transaction.from(signedTransaction);

  logger.info(
    `[wallet ${walletIndex}] Pre-signed ${label.toLowerCase()} tx: ${transaction.hash} (nonce ${transaction.nonce})`
  );

  return {
    request: populatedTransaction,
    signedTransaction,
    hash: transaction.hash,
    nonce: transaction.nonce
  };
}

async function waitForEventTrigger(config, signal, logger) {
  const { provider, rpcUrl } = await createProvider(config, { preferSocket: true });
  const triggerAddress = ethers.getAddress(config.triggerContractAddress);
  const triggerInterface = new ethers.Interface([normalizeEventFragment(config.triggerEventSignature)]);
  const triggerEvent = triggerInterface.fragments.find((fragment) => fragment.type === "event");
  const filter = {
    address: triggerAddress,
    topics: [triggerEvent.topicHash]
  };

  logger.info(
    `Waiting for event trigger ${triggerEvent.format()} on ${triggerAddress} via ${rpcUrl}`
  );

  try {
    await new Promise((resolve, reject) => {
      let timeoutId = null;
      let removeAbortListener = () => {};

      const cleanup = () => {
        provider.off(filter, onLog);
        removeAbortListener();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const onLog = (log) => {
        try {
          const parsedLog = triggerInterface.parseLog(log);
          if (!matchesExpectedStructure(parsedLog.args, config.triggerEventCondition)) {
            return;
          }

          cleanup();
          logger.info(
            `Event trigger matched in tx ${log.transactionHash} at block ${log.blockNumber}`
          );
          resolve();
        } catch {
          // Ignore unrelated or malformed logs.
        }
      };

      if (signal) {
        const onAbort = () => {
          cleanup();
          reject(new AbortRunError());
        };

        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      }

      if (config.triggerTimeoutMs) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(
            new Error(`Event trigger timed out after ${config.triggerTimeoutMs}ms`)
          );
        }, config.triggerTimeoutMs);
      }

      provider.on(filter, onLog);
    });
  } finally {
    await destroyProvider(provider);
  }
}

async function getPendingTransactionWithRetry(provider, txHash, signal, attempts = 5, delayMs = 150) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfAborted(signal);

    const transaction = await provider.getTransaction(txHash);
    if (transaction) {
      return transaction;
    }

    if (attempt < attempts) {
      await sleep(delayMs, signal);
    }
  }

  return null;
}

async function waitForMempoolTrigger(config, signal, logger) {
  const { provider, rpcUrl } = await createProvider(config, { requireSocket: true });
  const triggerAddress = ethers.getAddress(config.triggerContractAddress).toLowerCase();
  const selector = resolveMempoolSelector(config.triggerMempoolSignature);
  const seenHashes = new Set();

  logger.info(
    `Waiting for mempool trigger on ${triggerAddress}${
      selector ? ` with selector ${selector}` : ""
    } via ${rpcUrl}`
  );

  try {
    await new Promise((resolve, reject) => {
      let timeoutId = null;
      let removeAbortListener = () => {};
      let settled = false;
      const inFlightHashes = new Set();

      const cleanup = () => {
        settled = true;
        provider.off("pending", onPending);
        removeAbortListener();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const inspectPendingHash = async (txHash) => {
        try {
          const transaction = await getPendingTransactionWithRetry(provider, txHash, signal);
          if (!transaction || settled) {
            return;
          }

          seenHashes.add(txHash);
          if (seenHashes.size > 5000) {
            seenHashes.clear();
            seenHashes.add(txHash);
          }

          if (!transaction.to || transaction.to.toLowerCase() !== triggerAddress) {
            return;
          }

          if (
            selector &&
            String(transaction.data || "0x").slice(0, 10).toLowerCase() !== selector
          ) {
            return;
          }

          cleanup();
          logger.info(`Mempool trigger matched pending tx ${txHash}`);
          resolve();
        } catch (error) {
          if (!(error instanceof AbortRunError)) {
            // Ignore transient pending transaction lookup failures.
          }
        } finally {
          inFlightHashes.delete(txHash);
        }
      };

      const onPending = (txHash) => {
        if (!txHash || settled || seenHashes.has(txHash) || inFlightHashes.has(txHash)) {
          return;
        }

        inFlightHashes.add(txHash);
        void inspectPendingHash(txHash);
      };

      if (signal) {
        const onAbort = () => {
          cleanup();
          reject(new AbortRunError());
        };

        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      }

      if (config.triggerTimeoutMs) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(
            new Error(`Mempool trigger timed out after ${config.triggerTimeoutMs}ms`)
          );
        }, config.triggerTimeoutMs);
      }

      provider.on("pending", onPending);
    });
  } finally {
    await destroyProvider(provider);
  }
}

async function waitForBlockTrigger(config, signal, logger) {
  const { provider, rpcUrl } = await createProvider(config, { preferSocket: true });
  const targetBlockNumber = Number(config.triggerBlockNumber);

  logger.info(`Waiting for block trigger ${targetBlockNumber} via ${rpcUrl}`);

  try {
    const currentBlockNumber = await provider.getBlockNumber();
    if (currentBlockNumber >= targetBlockNumber) {
      logger.info(
        `Block trigger already satisfied at block ${currentBlockNumber} (target ${targetBlockNumber})`
      );
      return;
    }

    await new Promise((resolve, reject) => {
      let timeoutId = null;
      let removeAbortListener = () => {};
      let settled = false;

      const cleanup = () => {
        settled = true;
        provider.off("block", onBlock);
        removeAbortListener();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const onBlock = (blockNumber) => {
        if (settled || blockNumber < targetBlockNumber) {
          return;
        }

        cleanup();
        logger.info(`Block trigger matched at block ${blockNumber} (target ${targetBlockNumber})`);
        resolve();
      };

      if (signal) {
        const onAbort = () => {
          cleanup();
          reject(new AbortRunError());
        };

        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      }

      if (config.triggerTimeoutMs) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(
            new Error(`Block trigger timed out after ${config.triggerTimeoutMs}ms`)
          );
        }, config.triggerTimeoutMs);
      }

      provider.on("block", onBlock);
      void provider
        .getBlockNumber()
        .then(onBlock)
        .catch(() => {
          // Ignore immediate re-check failures and keep waiting on block events.
        });
    });
  } finally {
    await destroyProvider(provider);
  }
}

async function waitForExecutionTrigger(config, signal, logger) {
  if (config.executionTriggerMode === "event") {
    await waitForEventTrigger(config, signal, logger);
    return;
  }

  if (config.executionTriggerMode === "mempool") {
    await waitForMempoolTrigger(config, signal, logger);
    return;
  }

  if (config.executionTriggerMode === "block") {
    await waitForBlockTrigger(config, signal, logger);
  }
}

async function warmupProvider(provider, walletAddress, signal) {
  throwIfAborted(signal);
  await Promise.all([
    provider.getBlockNumber(),
    provider.getFeeData(),
    provider.getBalance(walletAddress),
    provider.getTransactionCount(walletAddress, "pending")
  ]);
}

async function waitForReadyCheck(contract, config, walletIndex, signal, logger) {
  if (!config.readyCheckFunction) {
    return;
  }

  const readyCheckMethod = getContractMethod(contract, config.readyCheckFunction);

  while (true) {
    throwIfAborted(signal);
    const result = await readyCheckMethod(...config.readyCheckArgs);
    const isReady = evaluateReadyState(config, result);
    logger.info(
      `[wallet ${walletIndex}] Ready check ${config.readyCheckFunction} -> ${stringifyForLog(
        normalizeForComparison(result)
      )}`
    );

    if (isReady) {
      return;
    }

    await sleep(config.readyCheckIntervalMs, signal);
  }
}

async function ensureMinimumBalance(provider, walletAddress, config, walletIndex, logger) {
  if (!config.minBalanceEth) {
    return;
  }

  const balance = await provider.getBalance(walletAddress);
  const minimumBalance = ethers.parseEther(config.minBalanceEth);

  logger.info(
    `[wallet ${walletIndex}] Balance: ${ethers.formatEther(balance)} ETH (minimum ${config.minBalanceEth} ETH)`
  );

  if (balance < minimumBalance) {
    throw new Error(
      `Wallet balance ${ethers.formatEther(balance)} ETH is below MIN_BALANCE_ETH ${config.minBalanceEth}`
    );
  }
}

function buildFailureResult(walletIndex, privateKey, error) {
  const walletAddress = (() => {
    if (error?.walletAddress) {
      return error.walletAddress;
    }

    try {
      return new ethers.Wallet(privateKey).address;
    } catch {
      return "unknown";
    }
  })();

  const result = {
    walletIndex,
    walletAddress,
    status: error instanceof AbortRunError ? "stopped" : "failed",
    error: formatError(error)
  };

  if (error?.txHash || error?.mintTxHash) {
    result.txHash = error.txHash || error.mintTxHash;
  }

  if (error?.mintTxHash) {
    result.mintTxHash = error.mintTxHash;
  }

  if (error?.receipt) {
    result.receipt = error.receipt;
  }

  if (error?.functionUsed) {
    result.functionUsed = error.functionUsed;
  }

  if (error?.ethValueUsed != null) {
    result.ethValueUsed = error.ethValueUsed;
  }

  if (error?.gasSettings) {
    result.gasSettings = error.gasSettings;
  }

  if (error?.lastRevertMessage) {
    result.lastRevertMessage = error.lastRevertMessage;
  }

  if (Array.isArray(error?.transferTxHashes)) {
    result.transferTxHashes = error.transferTxHashes;
  }

  if (Array.isArray(error?.transfers)) {
    result.transfers = error.transfers;
  }

  return result;
}

function persistResults(resultsPath, results, logger) {
  if (!resultsPath) {
    return;
  }

  const resolvedPath = path.resolve(process.cwd(), resultsPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${stringifyForLog(results)}\n`, "utf8");
  logger.info(`Saved results to ${resolvedPath}`);
}

async function createWalletSession(config, privateKey, walletIndex, context) {
  const { signal, logger } = context;
  const { provider, rpcUrl, chainId } = await createProvider(config);
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const walletAddress = await wallet.getAddress();
    const contract = new ethers.Contract(config.contractAddress, config.abi, wallet);
    const automationAnalysis = config.autoMintMode
      ? mintAutomation.buildMintFunctionAnalysis(
          config.abi,
          config.mintFunctionProvided ? config.mintFunction : ""
        )
      : null;
    const mintMethod = config.autoMintMode ? null : getContractMethod(contract, config.mintFunction);
    const mintArgs = config.autoMintMode
      ? []
      : applyPlaceholders(config.mintArgsTemplate, {
          walletAddress,
          walletIndex,
          timestamp: Date.now()
        });
    let nextPlannedNonce =
      (await provider.getTransactionCount(walletAddress, "pending")) + config.nonceOffset;

    logger.info(`[wallet ${walletIndex}] Address: ${walletAddress}`);
    logger.info(`[wallet ${walletIndex}] RPC: ${rpcUrl}`);
    logger.info(`[wallet ${walletIndex}] Chain ID: ${chainId}`);
    logger.info(`[wallet ${walletIndex}] Contract: ${config.contractAddress}`);

    if (config.autoMintMode) {
      logger.info(`[wallet ${walletIndex}] Automated mint mode: enabled`);
      logger.info(
        `[wallet ${walletIndex}] Ranked candidates: ${
          automationAnalysis?.candidates?.map((candidate) => candidate.signature).slice(0, 6).join(", ") ||
          "none"
        }`
      );
      logger.info(
        `[wallet ${walletIndex}] Payable functions: ${
          config.payableMintFunctions?.map((entry) => entry.signature).join(", ") || "none"
        }`
      );
      if (config.mintFunctionProvided) {
        logger.info(`[wallet ${walletIndex}] Preferred function hint: ${config.mintFunction}`);
      }
      if (config.mintArgsProvided) {
        logger.info(`[wallet ${walletIndex}] Args hint: ${JSON.stringify(config.mintArgsTemplate)}`);
      }
      if (config.mintValueProvided) {
        logger.info(`[wallet ${walletIndex}] Value hint: ${config.mintValueEth} ETH`);
      }
    } else {
      logger.info(`[wallet ${walletIndex}] Function: ${config.mintFunction}`);
      logger.info(`[wallet ${walletIndex}] Args: ${JSON.stringify(mintArgs)}`);
      logger.info(`[wallet ${walletIndex}] Value: ${config.mintValueEth} ETH`);
    }

    logger.info(`[wallet ${walletIndex}] Starting nonce plan: ${nextPlannedNonce}`);

    if (config.warmupRpc) {
      await warmupProvider(provider, walletAddress, signal);
      logger.info(`[wallet ${walletIndex}] Provider warmup complete`);
    }

    await ensureMinimumBalance(provider, walletAddress, config, walletIndex, logger);

    return {
      config,
      provider,
      rpcUrl,
      wallet,
      walletAddress,
      walletIndex,
      contract,
      automationAnalysis,
      cachedMintPrice: undefined,
      mintMethod,
      mintArgs,
      getPlannedNonce() {
        return nextPlannedNonce;
      },
      reserveSubmittedNonce(tx) {
        if (typeof tx?.nonce === "number" && tx.nonce >= nextPlannedNonce) {
          nextPlannedNonce = tx.nonce + 1;
        }
      },
      preparedMint: null,
      lastMintPlan: null,
      async refreshPlannedNonce() {
        const pendingNonce =
          (await provider.getTransactionCount(walletAddress, "pending")) + config.nonceOffset;
        if (pendingNonce > nextPlannedNonce) {
          logger.info(
            `[wallet ${walletIndex}] Nonce plan refreshed from ${nextPlannedNonce} to ${pendingNonce}`
          );
          nextPlannedNonce = pendingNonce;
        }
        return nextPlannedNonce;
      }
    };
  } catch (error) {
    await destroyProvider(provider);
    throw error;
  }
}

async function tryPreparePresignedMint(config, session, context) {
  if (config.dryRun || config.autoMintMode) {
    return null;
  }

  const { signal, logger } = context;
  const { provider, mintMethod, mintArgs, wallet, walletIndex } = session;
  throwIfAborted(signal);

  try {
    const overrides = await buildRuntimeOverrides(config, provider);

    if (config.simulateTransaction) {
      await mintMethod.staticCall(...mintArgs, overrides);
      const estimatedGas = await mintMethod.estimateGas(...mintArgs, overrides);
      logger.info(`[wallet ${walletIndex}] Simulation passed. Estimated gas: ${estimatedGas}`);
    }

    const preparedMint = await preparePresignedContractTransaction({
      contractMethod: mintMethod,
      args: mintArgs,
      overrides: {
        ...overrides,
        nonce: session.getPlannedNonce()
      },
      wallet,
      walletIndex,
      label: "Mint",
      logger
    });

    logger.info(`[wallet ${walletIndex}] Mint broadcast armed with a pre-signed transaction`);
    return preparedMint;
  } catch (error) {
    throw attachErrorContext(
      new Error(`Pre-signing failed: ${formatError(error)}`),
      {
        walletAddress: session.walletAddress
      }
    );
  }
}

async function tryPrepareAutomatedPresignedMint(config, session, context, attempt = 1) {
  if (config.dryRun || !config.autoMintMode || !config.preSignTransactions) {
    return null;
  }

  const { logger } = context;
  const plan = await buildAutomatedMintPlan(config, session, context, attempt);
  const preparedMint = await preparePresignedTransactionRequest({
    txRequest: plan.txRequest,
    wallet: session.wallet,
    walletIndex: session.walletIndex,
    label: "Mint",
    logger
  });

  logger.info(
    `[wallet ${session.walletIndex}] Automated mint pre-signed using ${plan.candidate.signature}`
  );

  return {
    ...preparedMint,
    plan
  };
}

async function ensurePreparedMint(config, session, context) {
  if (session.preparedMint) {
    return session.preparedMint;
  }

  session.preparedMint = await tryPreparePresignedMint(config, session, context);
  return session.preparedMint;
}

async function closeWalletSession(session) {
  if (!session) {
    return;
  }

  await destroyProvider(session.provider);
}

async function closeWalletSessions(sessions) {
  await Promise.allSettled((sessions || []).map((session) => closeWalletSession(session)));
}

async function executeWalletSession(config, session, context) {
  const { signal, logger } = context;
  const { provider, rpcUrl, wallet, walletAddress, walletIndex, contract, mintMethod, mintArgs } =
    session;

  try {
    await maybeWaitJitter(config.startJitterMs, walletIndex, signal, logger);

    const retryWindowDeadline =
      config.retryWindowMs > 0 ? Date.now() + config.retryWindowMs : null;

    logger.info(
      `[wallet ${walletIndex}] Retry policy: ${config.maxRetries} attempt(s) minimum${
        retryWindowDeadline ? ` with a ${config.retryWindowMs}ms retry window` : ""
      }`
    );

    await waitForMintStartDetection(contract, config, walletIndex, signal, logger);
    await waitForReadyCheck(contract, config, walletIndex, signal, logger);
    await session.refreshPlannedNonce();

    if (config.autoMintMode && config.preSignTransactions && !session.preparedMint) {
      try {
        session.preparedMint = await tryPrepareAutomatedPresignedMint(config, session, context, 1);
      } catch (error) {
        logger.info(
          `[wallet ${walletIndex}] Automated pre-sign unavailable, falling back to live signing: ${formatError(
            error
          )}`
        );
      }
    }

    let mintResult = null;
    let lastAttemptError = null;
    let successfulPlan = null;
    let attempt = 0;

    while (attempt === 0 || hasRetryBudgetRemaining(config, attempt, retryWindowDeadline)) {
      attempt += 1;
      throwIfAborted(signal);

      let usedPreparedMint = false;
      let currentPlan = null;

      try {
        if (config.autoMintMode) {
          const preparedMint = attempt === 1 ? session.preparedMint : null;
          if (preparedMint) {
            usedPreparedMint = true;
            currentPlan = preparedMint.plan || null;
            session.lastMintPlan = currentPlan;
            logger.info(
              `[wallet ${walletIndex}] Broadcasting automated pre-signed mint tx: ${preparedMint.hash}`
            );
            mintResult = await sendManagedTransaction({
              send: () =>
                submitSignedTransactionWithRoute({
                  provider,
                  rpcUrl,
                  config,
                  signedTransaction: preparedMint.signedTransaction,
                  walletIndex,
                  label: "Mint",
                  logger,
                  signal
                }),
              submitReplacement: (txRequest) =>
                submitTransactionWithRoute({
                  wallet,
                  provider,
                  rpcUrl,
                  config,
                  txRequest,
                  walletIndex,
                  label: "Mint",
                  logger,
                  signal
                }),
              config,
              walletIndex,
              label: "Mint",
              logger,
              signal,
              onSubmitted: (tx) => session.reserveSubmittedNonce(tx)
            });
          } else {
            currentPlan = await buildAutomatedMintPlan(config, session, context, attempt);
            session.lastMintPlan = currentPlan;

            if (config.dryRun) {
              logger.info(
                `[wallet ${walletIndex}] Automated dry run passed with ${currentPlan.candidate.signature}`
              );
              return {
                walletAddress,
                walletIndex,
                txHash: null,
                status: "dry-run",
                functionUsed: currentPlan.candidate.name,
                ethValueUsed: formatEthValue(currentPlan.value),
                gasSettings: buildGasSettingsSnapshot({
                  ...currentPlan.feeOverrides,
                  gasLimit: currentPlan.gasLimit
                })
              };
            }

            mintResult = await sendManagedTransaction({
              send: () =>
                submitTransactionWithRoute({
                  wallet,
                  provider,
                  rpcUrl,
                  config,
                  txRequest: currentPlan.txRequest,
                  walletIndex,
                  label: "Mint",
                  logger,
                  signal
                }),
              submitReplacement: (txRequest) =>
                submitTransactionWithRoute({
                  wallet,
                  provider,
                  rpcUrl,
                  config,
                  txRequest,
                  walletIndex,
                  label: "Mint",
                  logger,
                  signal
                }),
              config,
              walletIndex,
              label: "Mint",
              logger,
              signal,
              onSubmitted: (tx) => session.reserveSubmittedNonce(tx)
            });
          }
        } else if (config.dryRun) {
          const overrides = await buildRuntimeOverrides(config, provider);

          if (config.simulateTransaction) {
            await mintMethod.staticCall(...mintArgs, overrides);
            const estimatedGas = await mintMethod.estimateGas(...mintArgs, overrides);
            logger.info(`[wallet ${walletIndex}] Simulation passed. Estimated gas: ${estimatedGas}`);
          }

          logger.info(`[wallet ${walletIndex}] Dry run enabled, transaction not sent`);
          return {
            walletAddress,
            walletIndex,
            txHash: null,
            status: "dry-run"
          };
        } else {
          const preparedMint = await ensurePreparedMint(config, session, context);
          if (!preparedMint) {
            throw new Error("Pre-signed mint transaction is unavailable");
          }

          usedPreparedMint = true;
          logger.info(
            `[wallet ${walletIndex}] Broadcasting pre-signed mint tx: ${preparedMint.hash}`
          );

          mintResult = await sendManagedTransaction({
            send: () =>
              submitSignedTransactionWithRoute({
                provider,
                rpcUrl,
                config,
                signedTransaction: preparedMint.signedTransaction,
                walletIndex,
                label: "Mint",
                logger,
                signal
              }),
            submitReplacement: (txRequest) =>
              submitTransactionWithRoute({
                wallet,
                provider,
                rpcUrl,
                config,
                txRequest,
                walletIndex,
                label: "Mint",
                logger,
                signal
              }),
            config,
            walletIndex,
            label: "Mint",
            logger,
            signal,
            onSubmitted: (tx) => session.reserveSubmittedNonce(tx)
          });

          if (usedPreparedMint) {
            session.preparedMint = null;
          }
        }

        if (config.waitForReceipt && mintResult.receipt?.status !== 1) {
          throw attachErrorContext(new Error("Mint transaction reverted on-chain"), {
            walletAddress,
            txHash: mintResult.tx.hash,
            mintTxHash: mintResult.tx.hash,
            receipt: mintResult.receipt,
            functionUsed: currentPlan?.candidate?.name || config.mintFunction,
            ethValueUsed: currentPlan
              ? formatEthValue(currentPlan.value)
              : formatEthValue(mintResult.tx.value),
            gasSettings: buildGasSettingsSnapshot(mintResult.tx),
            lastRevertMessage: extractRevertMessage(mintResult.receipt)
          });
        }

        successfulPlan = currentPlan || successfulPlan;
        break;
      } catch (error) {
        if (error instanceof AbortRunError) {
          throw error;
        }

        if (usedPreparedMint) {
          session.preparedMint = null;
        }

        if (currentPlan) {
          attachErrorContext(error, {
            functionUsed: currentPlan.candidate.name,
            ethValueUsed: formatEthValue(currentPlan.value),
            gasSettings: buildGasSettingsSnapshot({
              ...currentPlan.feeOverrides,
              gasLimit: currentPlan.gasLimit
            }),
            lastRevertMessage: error.lastRevertMessage || extractRevertMessage(error)
          });
        }

        lastAttemptError = error;
        const retryable = isRetryableMintError(error, {
          allowRevertRecovery: config.autoMintMode
        });
        const willRetry = retryable && hasRetryBudgetRemaining(config, attempt, retryWindowDeadline);
        const retryWindowRemainingMs =
          retryWindowDeadline == null ? 0 : Math.max(0, retryWindowDeadline - Date.now());
        const retrySuffix = !retryable
          ? " - not retryable"
          : willRetry
            ? retryWindowDeadline
              ? ` - retrying in ${config.retryDelayMs}ms (${retryWindowRemainingMs}ms retry window remaining)`
              : ` - retrying in ${config.retryDelayMs}ms`
            : "";

        logger.error(
          `[wallet ${walletIndex}] Attempt ${attempt} failed: ${formatError(error)}${retrySuffix}`
        );

        if (!willRetry) {
          throw error;
        }

        await sleep(config.retryDelayMs, signal);
      }
    }

    if (!mintResult) {
      throw lastAttemptError || new Error(`[wallet ${walletIndex}] Exhausted retries without a result`);
    }

    if (!config.waitForReceipt) {
      return {
        walletAddress,
        walletIndex,
        txHash: mintResult.tx.hash,
        status: "submitted",
        functionUsed: successfulPlan?.candidate?.name || config.mintFunction,
        ethValueUsed: successfulPlan
          ? formatEthValue(successfulPlan.value)
          : formatEthValue(mintResult.tx.value),
        gasSettings: buildGasSettingsSnapshot(mintResult.tx)
      };
    }

    const result = {
      walletAddress,
      walletIndex,
      txHash: mintResult.tx.hash,
      mintTxHash: mintResult.tx.hash,
      receipt: mintResult.receipt,
      replacementCount: mintResult.replacementCount,
      functionUsed: successfulPlan?.candidate?.name || config.mintFunction,
      ethValueUsed: successfulPlan
        ? formatEthValue(successfulPlan.value)
        : formatEthValue(mintResult.tx.value),
      gasSettings: buildGasSettingsSnapshot(mintResult.tx),
      status: attempt > 1 || mintResult.replacementCount > 0 ? "retried" : "success"
    };

    if (!config.transferAfterMinted) {
      return result;
    }

    try {
      const transferResults = await transferMintedAssets({
        config,
        provider,
        rpcUrl,
        wallet,
        walletAddress,
        walletIndex,
        receipt: mintResult.receipt,
        logger,
        signal,
        getPlannedNonce: () => session.getPlannedNonce(),
        reserveSubmittedNonce: (tx) => session.reserveSubmittedNonce(tx)
      });

      result.transfers = transferResults;
      result.transferTxHashes = transferResults.map((entry) => entry.txHash);
      result.replacementCount += transferResults.reduce(
        (total, entry) => total + (entry.replacementCount || 0),
        0
      );
      return result;
    } catch (error) {
      throw attachErrorContext(error, {
        walletAddress,
        txHash: mintResult.tx.hash,
        mintTxHash: mintResult.tx.hash,
        receipt: mintResult.receipt,
        functionUsed: result.functionUsed,
        ethValueUsed: result.ethValueUsed,
        gasSettings: result.gasSettings,
        lastRevertMessage: error.lastRevertMessage || extractRevertMessage(error)
      });
    }
  } finally {
    await closeWalletSession(session);
  }
}

async function runSingleWallet(config, privateKey, walletIndex, context) {
  const session = await createWalletSession(config, privateKey, walletIndex, context);
  return executeWalletSession(config, session, context);
}

async function prepareWalletSlots(config, context) {
  const prepared = await Promise.allSettled(
    config.privateKeys.map(async (privateKey, index) => {
      const session = await createWalletSession(config, privateKey, index, context);
      session.preparedMint = await tryPreparePresignedMint(config, session, context);
      return session;
    })
  );

  return prepared.map((result, index) => {
    if (result.status === "fulfilled") {
      return {
        session: result.value
      };
    }

    return {
      error: result.reason,
      walletIndex: index
    };
  });
}

async function runMintBotWithPreparedWallets(config, context) {
  const { signal, logger } = context;
  let launchGateError = null;
  const launchGatePromise = (async () => {
    await waitUntil(config.waitUntilIso, config.pollIntervalMs, signal, logger);
    await waitForExecutionTrigger(config, signal, logger);
  })().catch((error) => {
    launchGateError = error;
  });

  const preparedSlots = await prepareWalletSlots(config, context);
  const sessionsToClose = preparedSlots.flatMap((slot) => (slot.session ? [slot.session] : []));
  const results = [];

  try {
    await launchGatePromise;
    if (launchGateError) {
      throw launchGateError;
    }

    if (config.walletMode === "parallel") {
      const settled = await Promise.allSettled(
        preparedSlots.map((slot) => {
          if (slot.session) {
            return executeWalletSession(config, slot.session, context);
          }

          return Promise.reject(slot.error);
        })
      );

      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          results.push(result.value);
          return;
        }

        const failure = buildFailureResult(index, config.privateKeys[index], result.reason);
        results.push(failure);
        logger.error(`[wallet ${index}] Final failure: ${failure.error}`);
      });

      const successCount = results.filter((result) => !["failed", "stopped"].includes(result.status)).length;
      if (successCount === 0) {
        persistResults(config.resultsPath, results, logger);
        throw new Error(signal?.aborted ? "Run stopped" : "All wallet runs failed");
      }

      return { results };
    }

    for (const [index, slot] of preparedSlots.entries()) {
      try {
        if (slot.session) {
          results.push(await executeWalletSession(config, slot.session, context));
        } else {
          throw slot.error;
        }
      } catch (error) {
        const failure = buildFailureResult(index, config.privateKeys[index], error);
        results.push(failure);

        if (error instanceof AbortRunError) {
          persistResults(config.resultsPath, results, logger);
          throw error;
        }

        if (!config.continueOnError) {
          persistResults(config.resultsPath, results, logger);
          throw error;
        }

        logger.error(`[wallet ${index}] Continuing after failure`);
      }
    }

    return { results };
  } finally {
    await closeWalletSessions(sessionsToClose);
  }
}

async function runMintBot(config, hooks = {}) {
  const logger = createLogger(hooks);
  const signal = hooks.signal;

  logger.info(`Wallet mode: ${config.walletMode}`);
  logger.info(`Wallet count: ${config.privateKeys.length}`);
  logger.info(`Configured RPC URLs: ${config.rpcUrls.length}`);
  logger.info(`Simulation: ${config.simulateTransaction ? "enabled" : "disabled"}`);
  logger.info(`Dry run: ${config.dryRun ? "enabled" : "disabled"}`);
  logger.info(`Mint mode: ${config.autoMintMode ? "automated" : "manual"}`);
  logger.info(`Gas strategy: ${config.gasStrategy}`);
  logger.info(
    `Mint start detection: ${
      config.mintStartDetectionEnabled
        ? (config.mintStartDetectionConfig?.signals || [])
            .map((signalName) => signalName)
            .join(", ") || "enabled"
        : "disabled"
    }`
  );
  logger.info(`Ready check: ${config.readyCheckFunction || "disabled"}`);
  logger.info(`Execution trigger: ${config.executionTriggerMode}`);
  if (config.executionTriggerMode === "block") {
    logger.info(`Trigger block: ${config.triggerBlockNumber}`);
  }
  logger.info(`Private relay: ${config.privateRelayEnabled ? "enabled" : "disabled"}`);
  logger.info(
    `Pre-signed launch: ${
      config.preSignTransactions
        ? config.autoMintMode
          ? "enabled when an automated mint plan can be resolved at launch"
          : "required"
        : "disabled"
    }`
  );

  const preparedRun = await runMintBotWithPreparedWallets(config, { signal, logger });
  const results = preparedRun.results;

  persistResults(config.resultsPath, results, logger);
  logger.info("Run summary:");
  for (const result of results) {
    logger.info(
      `[wallet ${result.walletIndex}] ${result.walletAddress} -> ${result.status}${
        result.txHash ? ` (${result.txHash})` : ""
      }${result.error ? ` [${result.error}]` : ""}`
    );
  }

  return {
    results
  };
}

module.exports = {
  AbortRunError,
  formatError,
  runMintBot
};
