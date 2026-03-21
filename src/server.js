const { startServer, resolveHost, resolvePort } = require("./dashboard-server");

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Dashboard startup failed:");
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  resolveHost,
  resolvePort,
  startServer
};
