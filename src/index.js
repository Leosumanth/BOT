require("dotenv").config();

const { ethers } = require("ethers");
const { loadConfig } = require("./config");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(isoString, pollIntervalMs) {
  if (!isoString) {
    return;
  }

  const target = new Date(isoString);
  if (Number.isNaN(target.getTime())) {
    throw new Error(`Invalid WAIT_UNTIL_ISO value: ${isoString}`);
  }

  while (Date.now() < target.getTime()) {
    const remainingMs = target.getTime() - Date.now();
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    process.stdout.write(`Waiting for launch time: ${remainingSeconds}s remaining   \r`);
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  process.stdout.write("\n");
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

function buildOverrides(config) {
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

function getMintMethod(contract, mintFunction) {
  const mintMethod = contract[mintFunction];
  if (typeof mintMethod !== "function") {
    throw new Error(
      `Function "${mintFunction}" was not found in the ABI. Check ABI_PATH and MINT_FUNCTION.`
    );
  }

  return mintMethod;
}

async function maybeWaitJitter(maxJitterMs, walletIndex) {
  if (!maxJitterMs || maxJitterMs <= 0) {
    return;
  }

  const delayMs = Math.floor(Math.random() * (maxJitterMs + 1));
  if (delayMs === 0) {
    return;
  }

  console.log(`[wallet ${walletIndex}] Applying ${delayMs}ms startup jitter`);
  await sleep(delayMs);
}

function formatError(error) {
  if (!error) {
    return "Unknown error";
  }

  return error.shortMessage || error.reason || error.message || String(error);
}

async function runSingleWallet(config, privateKey, walletIndex) {
  await maybeWaitJitter(config.startJitterMs, walletIndex);

  const { provider, rpcUrl, chainId } = await createProvider(config);
  const walletBase = new ethers.Wallet(privateKey, provider);
  const wallet = config.nonceOffset > 0
    ? new ethers.NonceManager(walletBase)
    : walletBase;

  const walletAddress = await wallet.getAddress();
  const contract = new ethers.Contract(config.contractAddress, config.abi, wallet);
  const mintMethod = getMintMethod(contract, config.mintFunction);
  const mintArgs = applyPlaceholders(config.mintArgsTemplate, {
    walletAddress,
    walletIndex,
    timestamp: Date.now()
  });
  const overrides = buildOverrides(config);

  if (config.nonceOffset > 0) {
    const currentNonce = await provider.getTransactionCount(walletAddress, "pending");
    wallet.increment();
    for (let i = 1; i < config.nonceOffset; i += 1) {
      wallet.increment();
    }
    console.log(`[wallet ${walletIndex}] Starting from nonce ${currentNonce + config.nonceOffset}`);
  }

  console.log(`[wallet ${walletIndex}] Address: ${walletAddress}`);
  console.log(`[wallet ${walletIndex}] RPC: ${rpcUrl}`);
  console.log(`[wallet ${walletIndex}] Chain ID: ${chainId}`);
  console.log(`[wallet ${walletIndex}] Contract: ${config.contractAddress}`);
  console.log(`[wallet ${walletIndex}] Function: ${config.mintFunction}`);
  console.log(`[wallet ${walletIndex}] Args: ${JSON.stringify(mintArgs)}`);
  console.log(`[wallet ${walletIndex}] Value: ${config.mintValueEth} ETH`);

  for (let attempt = 1; attempt <= config.maxRetries; attempt += 1) {
    try {
      if (config.simulateTransaction) {
        await mintMethod.staticCall(...mintArgs, overrides);
        const estimatedGas = await mintMethod.estimateGas(...mintArgs, overrides);
        console.log(`[wallet ${walletIndex}] Simulation passed. Estimated gas: ${estimatedGas}`);
      }

      if (config.dryRun) {
        console.log(`[wallet ${walletIndex}] Dry run enabled, transaction not sent`);
        return {
          walletAddress,
          walletIndex,
          txHash: null,
          status: "dry-run"
        };
      }

      const tx = await mintMethod(...mintArgs, overrides);
      console.log(`[wallet ${walletIndex}] Submitted tx: ${tx.hash}`);

      if (!config.waitForReceipt) {
        return {
          walletAddress,
          walletIndex,
          txHash: tx.hash,
          status: "submitted"
        };
      }

      const receipt = await tx.wait(config.receiptConfirmations, config.txTimeoutMs);
      console.log(`[wallet ${walletIndex}] Confirmed in block ${receipt.blockNumber}`);
      console.log(`[wallet ${walletIndex}] Status: ${receipt.status === 1 ? "success" : "failed"}`);

      return {
        walletAddress,
        walletIndex,
        txHash: tx.hash,
        receipt,
        status: receipt.status === 1 ? "success" : "failed"
      };
    } catch (error) {
      const message = formatError(error);
      console.error(
        `[wallet ${walletIndex}] Attempt ${attempt}/${config.maxRetries} failed: ${message}`
      );

      if (attempt >= config.maxRetries) {
        throw error;
      }

      await sleep(config.retryDelayMs);
    }
  }

  throw new Error(`[wallet ${walletIndex}] Exhausted retries without a result`);
}

async function main() {
  const config = loadConfig();

  console.log(`Wallet mode: ${config.walletMode}`);
  console.log(`Wallet count: ${config.privateKeys.length}`);
  console.log(`Configured RPC URLs: ${config.rpcUrls.length}`);
  console.log(`Simulation: ${config.simulateTransaction ? "enabled" : "disabled"}`);
  console.log(`Dry run: ${config.dryRun ? "enabled" : "disabled"}`);

  await waitUntil(config.waitUntilIso, config.pollIntervalMs);

  const runners = config.privateKeys.map((privateKey, index) =>
    () => runSingleWallet(config, privateKey, index)
  );

  const results = [];

  if (config.walletMode === "parallel") {
    const settled = await Promise.allSettled(runners.map((run) => run()));
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
        return;
      }

      console.error(`[wallet ${index}] Final failure: ${formatError(result.reason)}`);
    });

    if (results.length === 0) {
      throw new Error("All wallet runs failed");
    }
  } else {
    for (const run of runners) {
      results.push(await run());
    }
  }

  console.log("Run summary:");
  for (const result of results) {
    console.log(
      `[wallet ${result.walletIndex}] ${result.walletAddress} -> ${result.status}${
        result.txHash ? ` (${result.txHash})` : ""
      }`
    );
  }
}

main().catch((error) => {
  console.error("Mint bot failed:");
  console.error(error);
  process.exit(1);
});
