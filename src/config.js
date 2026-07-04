const DEFAULT_API_URL = typeof __ZEUS_API_URL__ !== "undefined" ? __ZEUS_API_URL__ : "";
const DEFAULT_AUTH_TOKEN = typeof __ZEUS_AUTH_TOKEN__ !== "undefined" ? __ZEUS_AUTH_TOKEN__ : "";

let loadingScript = null;

export function setLoadingScript(script) {
  loadingScript = script;
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
  };
}

export function publicConfig(config) {
  return { zeusApiUrl: config.zeusApiUrl };
}

export function zeusFetch(path, config) {
  const headers = {};
  if (config.zeusAuthToken) {
    headers.Authorization = `Bearer ${config.zeusAuthToken}`;
  }
  return fetch(`${config.zeusApiUrl}${path}`, { headers });
}