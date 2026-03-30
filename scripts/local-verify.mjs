import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const modeArg = process.argv.find((value) => value.startsWith("--mode="));
const mode = modeArg ? modeArg.split("=")[1] : "dev";

if (!["dev", "prod"].includes(mode)) {
  console.error(`Unsupported mode "${mode}". Use --mode=dev or --mode=prod.`);
  process.exit(1);
}

const rootDir = process.cwd();
const envPath = resolve(rootDir, ".env");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

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

async function expectJson(name, url, init, validate) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`${name} failed with ${response.status}.`);
  }

  if (!validate(payload)) {
    throw new Error(`${name} returned an unexpected payload.`);
  }

  console.log(`PASS ${name}`);
  return { response, payload };
}

async function expectHtml(name, url, textNeedle) {
  const response = await fetch(url);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${name} failed with ${response.status}.`);
  }

  if (!body.includes(textNeedle)) {
    throw new Error(`${name} did not contain "${textNeedle}".`);
  }

  console.log(`PASS ${name}`);
}

const env = parseEnvFile(envPath);
const password = env.DASHBOARD_ACCESS_PASSWORD;

if (!password) {
  console.error("Local verify failed.");
  console.error("DASHBOARD_ACCESS_PASSWORD is missing in .env.");
  process.exit(1);
}

const frontendBaseUrl = mode === "prod" ? "http://127.0.0.1:4000" : "http://127.0.0.1:3000";
const backendBaseUrl = "http://127.0.0.1:4000";

console.log(`Local verify mode: ${mode}`);
console.log(`Frontend base URL: ${frontendBaseUrl}`);
console.log(`Backend base URL: ${backendBaseUrl}`);

await expectJson(
  "backend health",
  `${backendBaseUrl}/health`,
  undefined,
  (payload) => Boolean(payload?.ok)
);

await expectHtml("login page", `${frontendBaseUrl}/login`, "Dashboard Sign-In");

await expectJson(
  "frontend dashboard-api health",
  `${frontendBaseUrl}/dashboard-api/health`,
  undefined,
  (payload) => Boolean(payload?.ok)
);

const loginResult = await expectJson(
  "dashboard login",
  `${frontendBaseUrl}/dashboard-api/session/login`,
  {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ password })
  },
  (payload) => payload?.ok === true
);

const setCookie = loginResult.response.headers.get("set-cookie");
if (!setCookie) {
  throw new Error("dashboard login did not return a session cookie.");
}

const sessionCookie = setCookie.split(";")[0];

await expectJson(
  "socket token route",
  `${frontendBaseUrl}/dashboard-api/socket-token`,
  {
    headers: {
      cookie: sessionCookie
    }
  },
  (payload) => typeof payload?.token === "string" && payload.token.length > 10
);

await expectJson(
  "backend proxy route",
  `${frontendBaseUrl}/dashboard-api/backend/system`,
  {
    headers: {
      cookie: sessionCookie
    }
  },
  (payload) => payload && typeof payload === "object" && "data" in payload
);

console.log("Local verification completed.");
