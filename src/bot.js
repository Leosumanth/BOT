const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

class AbortRunError extends Error {
  constructor(message = "Run stopped by user") {
    super(message);
    this.name = "AbortRunError";
  }
}

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

  if (config.maxFeeGwei) {
    overrides.maxFeePerGas = ethers.parseUnits(String(config.maxFeeGwei), "gwei");
  }

  if (config.maxPriorityFeeGwei) {
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

async function buildRuntimeOverrides(config, provider) {
  const overrides = buildBaseOverrides(config);

  if (config.gasStrategy === "provider") {
    const feeData = await provider.getFeeData();

    if (!overrides.maxFeePerGas && feeData.maxFeePerGas != null) {
      overrides.maxFeePerGas = applyPercentBoost(feeData.maxFeePerGas, config.gasBoostPercent);
    }

    if (!overrides.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas != null) {
      overrides.maxPriorityFeePerGas = applyPercentBoost(
        feeData.maxPriorityFeePerGas,
        config.priorityBoostPercent
      );
    }

    if (
      overrides.maxFeePerGas == null &&
      overrides.maxPriorityFeePerGas == null &&
      feeData.gasPrice != null
    ) {
      overrides.gasPrice = applyPercentBoost(feeData.gasPrice, config.gasBoostPercent);
    }
  }

  return overrides;
}

async function createProvider(config) {
  const failures = [];

  for (const rpcUrl of config.rpcUrls) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
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
    try {
      return new ethers.Wallet(privateKey).address;
    } catch {
      return "unknown";
    }
  })();

  return {
    walletIndex,
    walletAddress,
    status: error instanceof AbortRunError ? "stopped" : "failed",
    error: formatError(error)
  };
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

async function runSingleWallet(config, privateKey, walletIndex, context) {
  const { signal, logger } = context;
  await maybeWaitJitter(config.startJitterMs, walletIndex, signal, logger);

  const { provider, rpcUrl, chainId } = await createProvider(config);
  const walletBase = new ethers.Wallet(privateKey, provider);
  const wallet = config.nonceOffset > 0 ? new ethers.NonceManager(walletBase) : walletBase;

  const walletAddress = await wallet.getAddress();
  const contract = new ethers.Contract(config.contractAddress, config.abi, wallet);
  const mintMethod = getContractMethod(contract, config.mintFunction);
  const mintArgs = applyPlaceholders(config.mintArgsTemplate, {
    walletAddress,
    walletIndex,
    timestamp: Date.now()
  });

  if (config.nonceOffset > 0 && wallet instanceof ethers.NonceManager) {
    const currentNonce = await provider.getTransactionCount(walletAddress, "pending");
    for (let i = 0; i < config.nonceOffset; i += 1) {
      wallet.increment();
    }
    logger.info(`[wallet ${walletIndex}] Starting from nonce ${currentNonce + config.nonceOffset}`);
  }

  logger.info(`[wallet ${walletIndex}] Address: ${walletAddress}`);
  logger.info(`[wallet ${walletIndex}] RPC: ${rpcUrl}`);
  logger.info(`[wallet ${walletIndex}] Chain ID: ${chainId}`);
  logger.info(`[wallet ${walletIndex}] Contract: ${config.contractAddress}`);
  logger.info(`[wallet ${walletIndex}] Function: ${config.mintFunction}`);
  logger.info(`[wallet ${walletIndex}] Args: ${JSON.stringify(mintArgs)}`);
  logger.info(`[wallet ${walletIndex}] Value: ${config.mintValueEth} ETH`);

  if (config.warmupRpc) {
    await warmupProvider(provider, walletAddress, signal);
    logger.info(`[wallet ${walletIndex}] Provider warmup complete`);
  }

  await ensureMinimumBalance(provider, walletAddress, config, walletIndex, logger);
  await waitForReadyCheck(contract, config, walletIndex, signal, logger);

  for (let attempt = 1; attempt <= config.maxRetries; attempt += 1) {
    throwIfAborted(signal);

    try {
      const overrides = await buildRuntimeOverrides(config, provider);

      if (config.simulateTransaction) {
        await mintMethod.staticCall(...mintArgs, overrides);
        const estimatedGas = await mintMethod.estimateGas(...mintArgs, overrides);
        logger.info(`[wallet ${walletIndex}] Simulation passed. Estimated gas: ${estimatedGas}`);
      }

      if (config.dryRun) {
        logger.info(`[wallet ${walletIndex}] Dry run enabled, transaction not sent`);
        return {
          walletAddress,
          walletIndex,
          txHash: null,
          status: "dry-run"
        };
      }

      const tx = await mintMethod(...mintArgs, overrides);
      logger.info(`[wallet ${walletIndex}] Submitted tx: ${tx.hash}`);

      if (!config.waitForReceipt) {
        return {
          walletAddress,
          walletIndex,
          txHash: tx.hash,
          status: "submitted"
        };
      }

      const receipt = await withAbort(
        tx.wait(config.receiptConfirmations, config.txTimeoutMs),
        signal
      );

      logger.info(`[wallet ${walletIndex}] Confirmed in block ${receipt.blockNumber}`);
      logger.info(`[wallet ${walletIndex}] Status: ${receipt.status === 1 ? "success" : "failed"}`);

      return {
        walletAddress,
        walletIndex,
        txHash: tx.hash,
        receipt,
        status: receipt.status === 1 ? "success" : "failed"
      };
    } catch (error) {
      if (error instanceof AbortRunError) {
        throw error;
      }

      logger.error(
        `[wallet ${walletIndex}] Attempt ${attempt}/${config.maxRetries} failed: ${formatError(error)}`
      );

      if (attempt >= config.maxRetries) {
        throw error;
      }

      await sleep(config.retryDelayMs, signal);
    }
  }

  throw new Error(`[wallet ${walletIndex}] Exhausted retries without a result`);
}

async function runMintBot(config, hooks = {}) {
  const logger = createLogger(hooks);
  const signal = hooks.signal;

  logger.info(`Wallet mode: ${config.walletMode}`);
  logger.info(`Wallet count: ${config.privateKeys.length}`);
  logger.info(`Configured RPC URLs: ${config.rpcUrls.length}`);
  logger.info(`Simulation: ${config.simulateTransaction ? "enabled" : "disabled"}`);
  logger.info(`Dry run: ${config.dryRun ? "enabled" : "disabled"}`);
  logger.info(`Gas strategy: ${config.gasStrategy}`);
  logger.info(`Ready check: ${config.readyCheckFunction || "disabled"}`);

  await waitUntil(config.waitUntilIso, config.pollIntervalMs, signal, logger);

  const runners = config.privateKeys.map((privateKey, index) => () =>
    runSingleWallet(config, privateKey, index, { signal, logger })
  );

  const results = [];

  if (config.walletMode === "parallel") {
    const settled = await Promise.allSettled(runners.map((run) => run()));
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
  } else {
    for (const [index, run] of runners.entries()) {
      try {
        results.push(await run());
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
  }

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
