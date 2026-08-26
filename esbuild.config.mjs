import * as esbuild from "esbuild";
import { readFileSync, existsSync } from "fs";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

const envFile = loadEnvFile(".env");
const zeusApiUrl = process.env.ZEUS_API_URL || envFile.ZEUS_API_URL || "";
const zeusAuthToken = process.env.ZEUS_AUTH_TOKEN || envFile.ZEUS_AUTH_TOKEN || "";
const hubBaseUrl = process.env.HUB_BASE_URL || envFile.HUB_BASE_URL || "";
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const widgetVersion = process.env.WIDGET_VERSION || pkg.version || "0.0.0";

const shared = {
  entryPoints: ["src/bootstrap.js"],
  bundle: true,
  format: "iife",
  outfile: "dist/zeus_client_chat_trace.js",
  loader: {
    ".html": "text",
    ".css": "text",
  },
  define: {
    __ZEUS_API_URL__: JSON.stringify(zeusApiUrl),
    __ZEUS_AUTH_TOKEN__: JSON.stringify(zeusAuthToken),
    __HUB_BASE_URL__: JSON.stringify(hubBaseUrl),
    __WIDGET_VERSION__: JSON.stringify(widgetVersion),
  },
  minify: false,
  sourcemap: true,
};

const watch = process.argv.includes("--watch");

if (watch) {
  const ctx = await esbuild.context(shared);
  await ctx.watch();
  console.log("watching...");
} else {
  await esbuild.build({ ...shared, minify: true });
  console.log("built dist/zeus_client_chat_trace.js");
}