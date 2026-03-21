require("dotenv").config();

const { runMintBot } = require("./bot");
const { loadConfig } = require("./config");

async function main() {
  const config = loadConfig();
  await runMintBot(config);
}

main().catch((error) => {
  console.error("Mint bot failed:");
  console.error(error);
  process.exit(1);
});
