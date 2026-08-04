import { resolveConfig, publicConfig, setLoadingScript } from "./config.js";

setLoadingScript(document.currentScript);
import { initZeusTrace } from "./trace.js";
import widgetHtml from "./widget.html";
import widgetCss from "./widget.css";

const DAISYUI_CDN = "https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css";

const earlyQueue = [];
let bootstrapped = false;

function noopApi() {
  return {
    appendTraceCard() {},
    openDebugPanel() {},
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

function mountWidget() {
  const config = resolveConfig();

  // Kill switch: no DOM, no DaisyUI, no side-fetches when disabled.
  // Host APIs remain no-ops so callers never throw.
  if (!config.enabled) {
    const api = noopApi();
    window.appendTraceCard = api.appendTraceCard;
    window.openDebugPanel = api.openDebugPanel;
    earlyQueue.length = 0;
    bootstrapped = true;
    return { api, config };
  }

  const host = document.createElement("div");
  host.id = "zeus-trace-host";
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:99999;pointer-events:none;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const daisyLink = document.createElement("link");
  daisyLink.rel = "stylesheet";
  daisyLink.href = DAISYUI_CDN;

  const style = document.createElement("style");
  style.textContent = widgetCss;

  const themeRoot = document.createElement("div");
  themeRoot.className = "zeus-trace-root";
  themeRoot.setAttribute("data-theme", "light");
  themeRoot.style.pointerEvents = "auto";
  themeRoot.innerHTML = widgetHtml;

  shadow.append(daisyLink, style, themeRoot);

  // Install APIs immediately. tool-order is best-effort chart metadata and must
  // never gate the floating widget or early-queue drain (fetch can hang/CORS).
  const api = initZeusTrace(themeRoot, config);
  window.appendTraceCard = api.appendTraceCard;
  window.openDebugPanel = api.openDebugPanel;
  drainQueue(api);

  bootstrapped = true;

  return { api, config };
}

installEarlyQueue();

const ready = new Promise((resolve) => {
  const run = () => {
    try {
      const { api, config } = mountWidget();
      resolve({ api, config });
    } catch (err) {
      console.error("[ZeusTrace] Failed to mount widget:", err);
      resolve({ api: null, config: null, error: err });
    }
  };

  if (document.body) run();
  else document.addEventListener("DOMContentLoaded", run);
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