const DEFAULT_API_URL = typeof __ZEUS_API_URL__ !== "undefined" ? __ZEUS_API_URL__ : "";
const DEFAULT_AUTH_TOKEN = typeof __ZEUS_AUTH_TOKEN__ !== "undefined" ? __ZEUS_AUTH_TOKEN__ : "";
const WIDGET_VERSION = typeof __WIDGET_VERSION__ !== "undefined" ? __WIDGET_VERSION__ : "dev";

let loadingScript = null;

export function setLoadingScript(script) {
  loadingScript = script;
}

export function getWidgetVersion() {
  return WIDGET_VERSION || "dev";
}

export function parseToolOrder(raw) {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return {
      v1: Array.isArray(raw.v1) ? raw.v1 : [],
      v2: Array.isArray(raw.v2) ? raw.v2 : [],
    };
  }
  if (typeof raw === "string") {
    try {
      return parseToolOrder(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return null;
}

export function detectiveUrl(hubBaseUrl, sessionId) {
  if (!hubBaseUrl || !sessionId) return "";
  const base = String(hubBaseUrl).replace(/\/$/, "");
  const sid = String(sessionId).trim();
  if (!sid) return "";
  return `${base}/hub/debug/session/${encodeURIComponent(sid)}`;
}

/** @returns {boolean|null} null when unset / unrecognized */
export function parseBoolFlag(raw) {
  if (raw === true || raw === false) return raw;
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return null;
}

/**
 * Read page `debug` query param (e.g. `?debug=true`).
 * @param {string} [search] defaults to `location.search`
 * @returns {boolean|null}
 */
export function readDebugQueryParam(search) {
  try {
    const raw =
      search !== undefined
        ? search
        : typeof location !== "undefined"
          ? location.search
          : "";
    const q = raw.startsWith("?") || raw === "" ? raw : `?${raw}`;
    return parseBoolFlag(new URLSearchParams(q).get("debug"));
  } catch {
    return null;
  }
}

/**
 * Kill switch: widget UI mounts only when enabled.
 * Priority: explicit config/data-enabled → `?debug=` → default false.
 */
export function resolveEnabled(options = {}) {
  const fromWindow =
    options.fromWindow !== undefined
      ? options.fromWindow || {}
      : (typeof window !== "undefined" ? window.ZeusTraceConfig : null) || {};
  const script =
    options.script !== undefined
      ? options.script
      : loadingScript || (typeof document !== "undefined" ? document.currentScript : null);
  const explicit = parseBoolFlag(
    fromWindow.enabled !== undefined ? fromWindow.enabled : script?.dataset?.enabled
  );
  if (explicit !== null) return explicit;

  const fromQuery = readDebugQueryParam(options.search);
  if (fromQuery !== null) return fromQuery;

  return false;
}

export function resolveConfig(options = {}) {
  const fromWindow =
    options.fromWindow !== undefined
      ? options.fromWindow || {}
      : window.ZeusTraceConfig || {};
  const script =
    options.script !== undefined ? options.script : loadingScript || document.currentScript;
  const zeusApiUrl = (
    fromWindow.zeusApiUrl ||
    script?.dataset?.zeusApiUrl ||
    DEFAULT_API_URL ||
    ""
  ).replace(/\/$/, "");

  const hubBaseUrl = (
    fromWindow.hubBaseUrl ||
    script?.dataset?.hubBaseUrl ||
    ""
  ).replace(/\/$/, "");

  const mountRaw = String(
    fromWindow.mount || script?.dataset?.mount || "overlay"
  ).toLowerCase();
  const mount = mountRaw === "docked" ? "docked" : "overlay";
  const mountSelector = (
    fromWindow.mountSelector ||
    script?.dataset?.mountSelector ||
    ""
  ).trim();

  return {
    zeusApiUrl,
    hubBaseUrl,
    zeusAuthToken:
      fromWindow.zeusAuthToken ||
      script?.dataset?.zeusAuthToken ||
      DEFAULT_AUTH_TOKEN ||
      "",
    toolOrder: parseToolOrder(fromWindow.toolOrder ?? script?.dataset?.toolOrder),
    enabled: resolveEnabled({ fromWindow, script, search: options.search }),
    mount,
    mountSelector,
  };
}

export function publicConfig(config) {
  return {
    zeusApiUrl: config.zeusApiUrl,
    hubBaseUrl: config.hubBaseUrl,
    toolOrder: config.toolOrder,
    enabled: Boolean(config.enabled),
    mount: config.mount || "overlay",
    mountSelector: config.mountSelector || "",
    version: getWidgetVersion(),
  };
}

export function zeusFetch(path, config, options = {}) {
  const headers = {};
  if (config.zeusAuthToken) {
    headers.Authorization = `Bearer ${config.zeusAuthToken}`;
  }
  const init = { headers };
  if (options.signal) init.signal = options.signal;
  return fetch(`${config.zeusApiUrl}${path}`, init);
}
