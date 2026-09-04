import { resolveConfig, publicConfig, setLoadingScript } from "./config.js";

setLoadingScript(document.currentScript);
import { initZeusTrace } from "./trace.js";
import widgetHtml from "./widget.html";
import widgetCss from "./widget.css";

const earlyQueue = [];
let bootstrapped = false;

function noopApi() {
  return {
    appendTraceCard() {},
    openDebugPanel() {},
    setEntries() {},
    clear() {},
    exportBundle() {
      return { traces: [] };
    },
    setJobMode() {},
  };
}

function installEarlyQueue() {
  if (bootstrapped) return;
  window.appendTraceCard = (...args) => earlyQueue.push({ type: "card", args });
  window.openDebugPanel = () => earlyQueue.push({ type: "open" });
}

function drainQueue(api) {
  for (const item of earlyQueue) {
    if (item.type === "open") api.openDebugPanel();
    else if (item.type === "card") api.appendTraceCard(...item.args);
  }
  earlyQueue.length = 0;
}

const DAISYUI_HREF =
  "https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css";
const INTER_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";

function ensureInterFont() {
  if (typeof document === "undefined" || !document.head) return;
  const sel = 'link[data-zeus-trace-font="inter"]';
  if (document.head.querySelector(sel)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = INTER_HREF;
  link.setAttribute("data-zeus-trace-font", "inter");
  document.head.appendChild(link);
}

function attachHost(config) {
  const docked = config.mount === "docked";
  const selector = config.mountSelector;
  let host;
  if (docked && selector) {
    host = document.querySelector(selector);
  }
  if (!host) {
    host = document.createElement("div");
    host.id = "zeus-trace-host";
    host.style.cssText = docked
      ? "all:initial;display:block;position:relative;width:100%;height:100%;min-height:320px;z-index:1;"
      : "all:initial;display:block;position:fixed;inset:0;z-index:99999;pointer-events:none;";
    document.body.appendChild(host);
  } else {
    host.style.display = host.style.display || "block";
    host.style.position = host.style.position || "relative";
    host.style.minHeight = host.style.minHeight || "320px";
  }
  if (!host.id) host.id = "zeus-trace-host";
  return { host, docked };
}

function mountWidget() {
  const config = resolveConfig();

  if (!config.enabled) {
    const api = noopApi();
    window.appendTraceCard = api.appendTraceCard;
    window.openDebugPanel = api.openDebugPanel;
    earlyQueue.length = 0;
    bootstrapped = true;
    return { api, config };
  }

  const { host, docked } = attachHost(config);
  const shadow = host.attachShadow({ mode: "open" });

  ensureInterFont();

  const daisy = document.createElement("link");
  daisy.rel = "stylesheet";
  daisy.href = DAISYUI_HREF;

  const style = document.createElement("style");
  style.textContent = widgetCss;

  const themeRoot = document.createElement("div");
  themeRoot.className = "zeus-trace-root bg-base-100 text-base-content";
  themeRoot.setAttribute("data-theme", "light");
  themeRoot.setAttribute("data-mount", docked ? "docked" : "overlay");
  themeRoot.style.pointerEvents = "auto";
  themeRoot.innerHTML = widgetHtml;

  shadow.append(daisy, style, themeRoot);

  const api = initZeusTrace(themeRoot, config);
  window.appendTraceCard = api.appendTraceCard;
  window.openDebugPanel = api.openDebugPanel;
  if (window.ZeusTrace) {
    window.ZeusTrace.setEntries = api.setEntries;
    window.ZeusTrace.clear = api.clear;
    window.ZeusTrace.exportBundle = api.exportBundle;
    window.ZeusTrace.setJobMode = api.setJobMode;
  }
  drainQueue(api);

  bootstrapped = true;

  return { api, config };
}

installEarlyQueue();

let settleReady;
const ready = new Promise((resolve) => {
  settleReady = resolve;
});

window.ZeusTrace = {
  ready,
  get config() {
    return publicConfig(resolveConfig());
  },
  get version() {
    return publicConfig(resolveConfig()).version;
  },
};

const run = () => {
  try {
    const { api, config } = mountWidget();
    settleReady({ api, config });
  } catch (err) {
    console.error("[ZeusTrace] Failed to mount widget:", err);
    settleReady({ api: null, config: null, error: err });
  }
};

if (document.body) run();
else document.addEventListener("DOMContentLoaded", run);
