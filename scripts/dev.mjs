#!/usr/bin/env node
/**
 * Local playground: initial build, esbuild watch, static server.
 * Not used for CDN publish.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "5199";
const node = process.execPath;
const esbuildConfig = path.join(root, "esbuild.config.mjs");

let shuttingDown = false;
const children = [];

function spawnInherit(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const other of children) {
      if (other !== child && !other.killed) other.kill("SIGTERM");
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
  return child;
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`
Zeus Tracer local playground (not published)
  Widget:     http://localhost:${port}/
  Overlay:    http://localhost:${port}/?mount=overlay
  Host demo:  http://localhost:${port}/examples/embed.html

Rebuilds on save — refresh the browser.
`);

await new Promise((resolve, reject) => {
  const build = spawn(node, [esbuildConfig], { cwd: root, stdio: "inherit", env: process.env });
  build.on("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`initial build failed (${code})`));
  });
});

spawnInherit(node, [esbuildConfig, "--watch"]);
spawnInherit("npx", ["--yes", "serve", ".", "-p", String(port)]);
