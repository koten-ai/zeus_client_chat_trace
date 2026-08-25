import { getWidgetVersion, parseToolOrder, zeusFetch } from "./config.js";
import { createTracePanel } from "./panel.js";

export function initZeusTrace(root, config = {}) {
  const $ = (id) => root.querySelector(`#${id}`);

  let CHART_ORDER = parseToolOrder(config.toolOrder) ?? { v1: [], v2: [] };
  let chatId = null;
  const docked = config.mount === "docked";

  const panel = createTracePanel(root);
  panel.init({
    getClientVersion: () => getWidgetVersion(),
    getHubBase: () => config.hubBaseUrl || "",
    getChatId: () => chatId,
    getChartOrder: () => CHART_ORDER,
    showToast,
  });

  function openDebugPanel() {
    const el = $("debug-panel");
    const toggle = $("debug-toggle");
    if (!el) return;
    el.classList.remove("is-hidden");
    el.setAttribute("aria-hidden", "false");
    toggle?.setAttribute("aria-expanded", "true");
  }

  function closeDebugPanel() {
    if (docked) return;
    const el = $("debug-panel");
    const toggle = $("debug-toggle");
    if (!el) return;
    el.classList.add("is-hidden");
    el.setAttribute("aria-hidden", "true");
    toggle?.setAttribute("aria-expanded", "false");
  }

  function toggleDebugPanel() {
    const el = $("debug-panel");
    if (!el) return;
    if (el.classList.contains("is-hidden")) openDebugPanel();
    else closeDebugPanel();
  }

  function showToast(msg, kind) {
    const toast = $("toast");
    const msgEl = $("toast-msg");
    if (!toast || !msgEl) return;
    msgEl.textContent = msg;
    toast.classList.toggle("tt-toast-warn", kind === "warning" || kind === "error");
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 2200);
  }

  function applyToolOrder(raw) {
    const order = parseToolOrder(raw);
    if (order) CHART_ORDER = order;
  }

  async function loadToolOrder() {
    const injected = parseToolOrder(config.toolOrder);
    if (injected) {
      CHART_ORDER = injected;
      return;
    }
    if (!config.zeusApiUrl) return;
    const timeoutMs = Number(config.toolOrderTimeoutMs);
    const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 3000;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => {
          try {
            controller.abort();
          } catch {
            /* ignore */
          }
        }, ms)
      : null;
    try {
      const res = await zeusFetch("/api/tool-order", config, controller ? { signal: controller.signal } : {});
      const fetched = parseToolOrder(await res.json());
      if (fetched) CHART_ORDER = fetched;
    } catch {
      /* keep sync fallback */
    } finally {
      if (timer != null) clearTimeout(timer);
    }
  }

  function appendTraceCard(question, j) {
    if (!j) return;
    const entry = { ...j };
    if (question && !entry.question) entry.question = question;
    if (!entry.trace && !entry.debug) return;
    applyToolOrder(entry.tool_order);
    chatId = entry.chat_id || chatId;
    panel.pushEntry(entry);
    if (!docked) openDebugPanel();
  }

  function setEntries(list) {
    panel.setEntries(list);
  }

  function clear() {
    panel.clear();
  }

  function exportBundle() {
    return panel.getBundle();
  }

  $("debug-toggle")?.addEventListener("click", toggleDebugPanel);
  $("debug-close")?.addEventListener("click", closeDebugPanel);

  const versionEl = $("debug-panel-version");
  if (versionEl) {
    const ver = getWidgetVersion();
    versionEl.textContent = ver.startsWith("v") ? ver : `v${ver}`;
    versionEl.setAttribute("title", `zeus_client_chat_trace ${ver}`);
  }

  if (docked) openDebugPanel();

  const readyToolOrder = loadToolOrder();

  return {
    appendTraceCard,
    openDebugPanel,
    closeDebugPanel,
    setEntries,
    clear,
    exportBundle,
    setJobMode: (on) => panel.setJobMode(on),
    setToolOrder: applyToolOrder,
    readyToolOrder,
    version: getWidgetVersion(),
  };
}
