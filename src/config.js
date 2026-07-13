const DEFAULT_API_URL = typeof __ZEUS_API_URL__ !== "undefined" ? __ZEUS_API_URL__ : "";
const DEFAULT_AUTH_TOKEN = typeof __ZEUS_AUTH_TOKEN__ !== "undefined" ? __ZEUS_AUTH_TOKEN__ : "";

let loadingScript = null;

export function setLoadingScript(script) {
  loadingScript = script;
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

export function resolveConfig() {
  const fromWindow = window.ZeusTraceConfig || {};
  const script = loadingScript || document.currentScript;
  const zeusApiUrl = (
    fromWindow.zeusApiUrl ||
    script?.dataset?.zeusApiUrl ||
    DEFAULT_API_URL ||
    ""
  ).replace(/\/$/, "");

  return {
    zeusApiUrl,
    zeusAuthToken:
      fromWindow.zeusAuthToken ||
      script?.dataset?.zeusAuthToken ||
      DEFAULT_AUTH_TOKEN ||
      "",
    toolOrder: parseToolOrder(fromWindow.toolOrder ?? script?.dataset?.toolOrder),
  };
}

export function publicConfig(config) {
  return { zeusApiUrl: config.zeusApiUrl, toolOrder: config.toolOrder };
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