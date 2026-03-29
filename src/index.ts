require("dotenv").config();

const { runMintBot } = require("./bot");
const { loadConfig } = require("./config");

async function main() {
  const config = loadConfig();
  await runMintBot(config);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Mint bot failed:");
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  main
};
