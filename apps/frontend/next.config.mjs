import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "..", "..", ".env")]) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mintbot/shared"],
  typedRoutes: true
};

export default nextConfig;
