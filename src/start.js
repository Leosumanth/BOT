require("dotenv").config();

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function hasAnyValue(env, names) {
  return names.some((name) => !isBlank(env[name]));
}

function hasCompleteBotConfig(env) {
  return (
    hasAnyValue(env, ["RPC_URLS", "RPC_URL"]) &&
    hasAnyValue(env, ["PRIVATE_KEYS", "PRIVATE_KEY"]) &&
    !isBlank(env.CONTRACT_ADDRESS)
  );
}

function normalizeMode(value) {
  if (isBlank(value)) {
    return undefined;
  }

  return String(value).trim().toLowerCase();
}

function resolveStartMode(env = process.env) {
  const explicitMode = normalizeMode(env.BOT_MODE || env.APP_MODE || env.START_MODE);

  if (["bot", "cli", "mint", "worker"].includes(explicitMode)) {
    return "bot";
  }

  if (["ui", "dashboard", "server", "web"].includes(explicitMode)) {
    return "dashboard";
  }

  if (!isBlank(env.PORT) && !hasCompleteBotConfig(env)) {
    return "dashboard";
  }

  return "bot";
}

async function main() {
  const mode = resolveStartMode(process.env);

  if (mode === "dashboard") {
    if (isBlank(process.env.BOT_MODE) && !isBlank(process.env.PORT)) {
      console.log("Hosted runtime detected without complete bot config. Starting dashboard instead of CLI bot.");
    }

    const { startServer } = require("./server");
    await startServer();
    return;
  }

  const { main: startBot } = require("./index");
  await startBot();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Startup failed:");
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  main,
  resolveStartMode
};
