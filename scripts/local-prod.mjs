import { spawn } from "node:child_process";
import { resolve } from "node:path";

const rootDir = process.cwd();
const backendEntry = resolve(rootDir, "apps", "backend", "dist", "main.js");

const child = spawn(process.execPath, [backendEntry], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production"
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
