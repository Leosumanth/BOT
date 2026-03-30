import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();
const envPath = resolve(rootDir, ".env");

const requiredVars = [
  "DATABASE_URL",
  "REDIS_URL",
  "PRIVATE_KEY_ENCRYPTION_SECRET",
  "ADMIN_API_TOKEN",
  "DASHBOARD_ACCESS_PASSWORD",
  "DASHBOARD_SESSION_SECRET"
];

const recommendedVars = [
  "REALTIME_AUTH_SECRET"
];

function parseEnvFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function printSection(title) {
  console.log(`\n${title}`);
}

if (!existsSync(envPath)) {
  console.error("Local doctor failed.");
  console.error("Missing .env in the repository root.");
  console.error("Copy .env.example to .env and fill in your local values first.");
  process.exit(1);
}

const env = parseEnvFile(envPath);
const missingRequired = requiredVars.filter((key) => !env[key]);
const missingRecommended = recommendedVars.filter((key) => !env[key]);

printSection("Local Doctor");
console.log(`Loaded ${envPath}`);

printSection("Required Variables");
for (const key of requiredVars) {
  console.log(`${env[key] ? "PASS" : "FAIL"} ${key}`);
}

printSection("Recommended Variables");
for (const key of recommendedVars) {
  console.log(`${env[key] ? "PASS" : "WARN"} ${key}`);
}

printSection("Local Workflow Notes");
if (env.FRONTEND_URL && !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(env.FRONTEND_URL)) {
  console.log(`WARN FRONTEND_URL is set to a non-local value (${env.FRONTEND_URL}). For single-service local testing, leave it unset or localhost-based.`);
} else {
  console.log("PASS FRONTEND_URL is local-safe for localhost testing.");
}

if (env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_SOCKET_URL) {
  console.log("INFO NEXT_PUBLIC_API_URL / NEXT_PUBLIC_SOCKET_URL are set. That is fine for split local frontend/backend dev, but leave them unset for single-service embedded production-like testing.");
} else {
  console.log("PASS NEXT_PUBLIC_API_URL and NEXT_PUBLIC_SOCKET_URL are unset, which matches single-service embedded testing.");
}

if (missingRequired.length > 0) {
  printSection("Next Step");
  console.log(`Fill the missing required variables in .env: ${missingRequired.join(", ")}`);
  process.exit(1);
}

printSection("Suggested Commands");
console.log("Fast iteration: npm run local:dev");
console.log("Verify dev mode in a second terminal: npm run local:verify");
console.log("Railway-like embedded run: npm run local:prod");
console.log("Verify embedded mode in a second terminal: npm run local:verify:prod");

if (missingRecommended.length > 0) {
  printSection("Recommendation");
  console.log(`Add ${missingRecommended.join(", ")} to match production auth behavior more closely.`);
}
