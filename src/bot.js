const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

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
  const feeData = await provider.getFeeData();

  if (tx.maxFeePerGas != null || tx.maxPriorityFeePerGas != null) {
    const maxPriorityFeePerGas = maxDefinedBigInt(
      bumpFeeValue(tx.maxPriorityFeePerGas, config.replacementBumpPercent),
      applyPercentBoost(feeData.maxPriorityFeePerGas, config.priorityBoostPercent)
    );
    const maxFeePerGas = maxDefinedBigInt(
      bumpFeeValue(tx.maxFeePerGas, config.replacementBumpPercent),
      applyPercentBoost(feeData.maxFeePerGas, config.gasBoostPercent),
      maxPriorityFeePerGas
    );

    return {
      maxFeePerGas,
      maxPriorityFeePerGas
    };
  }

  const gasPrice = maxDefinedBigInt(
    bumpFeeValue(tx.gasPrice, config.replacementBumpPercent),
    applyPercentBoost(feeData.gasPrice, config.gasBoostPercent)
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
  signer,
  config,
  walletIndex,
  label,
  logger,
  signal
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

      const feeOverrides = await buildReplacementFeeOverrides(config, signer.provider, currentTx);
      const replacementRequest = buildReplacementRequest(currentTx, feeOverrides);

      logger.info(
        `[wallet ${walletIndex}] ${label} timeout detected. Replacing nonce ${currentTx.nonce} with max fee ${formatGwei(
          feeOverrides.maxFeePerGas
        )}, priority ${formatGwei(feeOverrides.maxPriorityFeePerGas)}, gas price ${formatGwei(
          feeOverrides.gasPrice
        )}`
      );

      try {
        currentTx = await signer.sendTransaction(replacementRequest);
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
  signer,
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
    signer,
    config,
    walletIndex,
    label,
    logger,
    signal
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
            tokenContract.transferFrom(
              walletAddress,
              config.transferAddress,
              asset.tokenId,
              transferOverrides
            ),
          signer: wallet,
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
            tokenContract.safeTransferFrom(
              walletAddress,
              config.transferAddress,
              asset.tokenId,
              asset.amount,
              "0x",
              transferOverrides
            ),
          signer: wallet,
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

async function runSingleWallet(config, privateKey, walletIndex, context) {
  const { signal, logger } = context;
  await maybeWaitJitter(config.startJitterMs, walletIndex, signal, logger);

  const { provider, rpcUrl, chainId } = await createProvider(config);
  const wallet = new ethers.Wallet(privateKey, provider);
  const walletAddress = await wallet.getAddress();
  const contract = new ethers.Contract(config.contractAddress, config.abi, wallet);
  const mintMethod = getContractMethod(contract, config.mintFunction);
  const mintArgs = applyPlaceholders(config.mintArgsTemplate, {
    walletAddress,
    walletIndex,
    timestamp: Date.now()
  });
  let nextPlannedNonce = (await provider.getTransactionCount(walletAddress, "pending")) + config.nonceOffset;

  logger.info(`[wallet ${walletIndex}] Address: ${walletAddress}`);
  logger.info(`[wallet ${walletIndex}] RPC: ${rpcUrl}`);
  logger.info(`[wallet ${walletIndex}] Chain ID: ${chainId}`);
  logger.info(`[wallet ${walletIndex}] Contract: ${config.contractAddress}`);
  logger.info(`[wallet ${walletIndex}] Function: ${config.mintFunction}`);
  logger.info(`[wallet ${walletIndex}] Args: ${JSON.stringify(mintArgs)}`);
  logger.info(`[wallet ${walletIndex}] Value: ${config.mintValueEth} ETH`);
  logger.info(`[wallet ${walletIndex}] Starting nonce plan: ${nextPlannedNonce}`);

  if (config.warmupRpc) {
    await warmupProvider(provider, walletAddress, signal);
    logger.info(`[wallet ${walletIndex}] Provider warmup complete`);
  }

  await ensureMinimumBalance(provider, walletAddress, config, walletIndex, logger);
  await waitForReadyCheck(contract, config, walletIndex, signal, logger);

  const reserveSubmittedNonce = (tx) => {
    if (typeof tx?.nonce === "number" && tx.nonce >= nextPlannedNonce) {
      nextPlannedNonce = tx.nonce + 1;
    }
  };

  let mintResult = null;

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

      mintResult = await sendManagedTransaction({
        send: () => mintMethod(...mintArgs, { ...overrides, nonce: nextPlannedNonce }),
        signer: wallet,
        config,
        walletIndex,
        label: "Mint",
        logger,
        signal,
        onSubmitted: reserveSubmittedNonce
      });
      break;
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

  if (!mintResult) {
    throw new Error(`[wallet ${walletIndex}] Exhausted retries without a result`);
  }

  if (!config.waitForReceipt) {
    return {
      walletAddress,
      walletIndex,
      txHash: mintResult.tx.hash,
      status: "submitted"
    };
  }

  const result = {
    walletAddress,
    walletIndex,
    txHash: mintResult.tx.hash,
    mintTxHash: mintResult.tx.hash,
    receipt: mintResult.receipt,
    replacementCount: mintResult.replacementCount,
    status: mintResult.receipt.status === 1 ? "success" : "failed"
  };

  if (!config.transferAfterMinted) {
    return result;
  }

  try {
    const transferResults = await transferMintedAssets({
      config,
      provider,
      wallet,
      walletAddress,
      walletIndex,
      receipt: mintResult.receipt,
      logger,
      signal,
      getPlannedNonce: () => nextPlannedNonce,
      reserveSubmittedNonce
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
      receipt: mintResult.receipt
    });
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
