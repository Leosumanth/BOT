import { mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(scriptDir, "..");
const source = resolve(backendDir, "src", "database", "schema.sql");
const destination = resolve(backendDir, "dist", "database", "schema.sql");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
