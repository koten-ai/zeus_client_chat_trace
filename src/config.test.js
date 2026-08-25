import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectiveUrl,
  getWidgetVersion,
  parseBoolFlag,
  publicConfig,
  readDebugQueryParam,
  resolveConfig,
  resolveEnabled,
  setLoadingScript,
  zeusFetch,
} from "./config.js";

afterEach(() => {
  delete window.ZeusTraceConfig;
  setLoadingScript(null);
  vi.restoreAllMocks();
});

describe("parseBoolFlag", () => {
  it("parses common truthy/falsy strings and booleans", () => {
    expect(parseBoolFlag(true)).toBe(true);
    expect(parseBoolFlag(false)).toBe(false);
    expect(parseBoolFlag("true")).toBe(true);
    expect(parseBoolFlag("YES")).toBe(true);
    expect(parseBoolFlag("1")).toBe(true);
    expect(parseBoolFlag("on")).toBe(true);
    expect(parseBoolFlag("false")).toBe(false);
    expect(parseBoolFlag("0")).toBe(false);
    expect(parseBoolFlag("off")).toBe(false);
    expect(parseBoolFlag(null)).toBe(null);
    expect(parseBoolFlag("")).toBe(null);
    expect(parseBoolFlag("maybe")).toBe(null);
  });
});

describe("readDebugQueryParam", () => {
  it("reads debug from a search string", () => {
    expect(readDebugQueryParam("?debug=true")).toBe(true);
    expect(readDebugQueryParam("debug=1")).toBe(true);
    expect(readDebugQueryParam("?foo=1&debug=yes")).toBe(true);
    expect(readDebugQueryParam("?debug=false")).toBe(false);
    expect(readDebugQueryParam("?other=1")).toBe(null);
    expect(readDebugQueryParam("")).toBe(null);
  });
});

describe("resolveEnabled", () => {
  it("defaults to false when nothing is set", () => {
    expect(resolveEnabled({ fromWindow: {}, script: null, search: "" })).toBe(false);
  });

  it("enables when ?debug=true", () => {
    expect(resolveEnabled({ fromWindow: {}, script: null, search: "?debug=true" })).toBe(true);
  });

  it("disables when ?debug=false", () => {
    expect(resolveEnabled({ fromWindow: {}, script: null, search: "?debug=false" })).toBe(false);
  });

  it("prefers explicit window.enabled over debug query", () => {
    expect(
      resolveEnabled({ fromWindow: { enabled: false }, script: null, search: "?debug=true" })
    ).toBe(false);
    expect(
      resolveEnabled({ fromWindow: { enabled: true }, script: null, search: "?debug=false" })
    ).toBe(true);
  });

  it("reads data-enabled from script dataset", () => {
    expect(
      resolveEnabled({
        fromWindow: {},
        script: { dataset: { enabled: "true" } },
        search: "",
      })
    ).toBe(true);
    expect(
      resolveEnabled({
        fromWindow: {},
        script: { dataset: { enabled: "false" } },
        search: "?debug=true",
      })
    ).toBe(false);
  });

  it("prefers window.enabled over script dataset", () => {
    expect(
      resolveEnabled({
        fromWindow: { enabled: true },
        script: { dataset: { enabled: "false" } },
        search: "",
      })
    ).toBe(true);
  });
});

describe("resolveConfig", () => {
  it("reads zeusApiUrl and zeusAuthToken from window.ZeusTraceConfig", () => {
    window.ZeusTraceConfig = {
      zeusApiUrl: "https://zeus.example.com/",
      zeusAuthToken: "secret",
    };

    expect(resolveConfig({ search: "" })).toEqual({
      zeusApiUrl: "https://zeus.example.com",
      hubBaseUrl: "",
      zeusAuthToken: "secret",
      toolOrder: null,
      enabled: false,
      mount: "overlay",
      mountSelector: "",
    });
  });

  it("reads hubBaseUrl from window.ZeusTraceConfig and strips trailing slash", () => {
    window.ZeusTraceConfig = {
      hubBaseUrl: "http://hub/",
    };

    expect(resolveConfig({ search: "" }).hubBaseUrl).toBe("http://hub");
  });

  it("falls back to script dataset attributes", () => {
    setLoadingScript({
      dataset: {
        zeusApiUrl: "https://api.test/",
        zeusAuthToken: "dataset-token",
        hubBaseUrl: "http://hub-from-data/",
      },
    });

    expect(resolveConfig({ search: "" })).toEqual({
      zeusApiUrl: "https://api.test",
      hubBaseUrl: "http://hub-from-data",
      zeusAuthToken: "dataset-token",
      toolOrder: null,
      enabled: false,
      mount: "overlay",
      mountSelector: "",
    });
  });

  it("prefers window config over script dataset", () => {
    window.ZeusTraceConfig = {
      zeusApiUrl: "https://win.example.com",
      zeusAuthToken: "win",
      hubBaseUrl: "http://hub-win",
    };
    setLoadingScript({
      dataset: {
        zeusApiUrl: "https://lose.example.com",
        zeusAuthToken: "lose",
        hubBaseUrl: "http://hub-lose",
      },
    });

    expect(resolveConfig({ search: "" }).zeusApiUrl).toBe("https://win.example.com");
    expect(resolveConfig({ search: "" }).zeusAuthToken).toBe("win");
    expect(resolveConfig({ search: "" }).hubBaseUrl).toBe("http://hub-win");
  });

  it("returns empty strings when unset", () => {
    expect(resolveConfig({ search: "" })).toEqual({
      zeusApiUrl: "",
      hubBaseUrl: "",
      zeusAuthToken: "",
      toolOrder: null,
      enabled: false,
      mount: "overlay",
      mountSelector: "",
    });
  });

  it("sets enabled from debug query when config omits enabled", () => {
    expect(resolveConfig({ search: "?debug=true" }).enabled).toBe(true);
  });

  it("reads toolOrder from window.ZeusTraceConfig", () => {
    window.ZeusTraceConfig = {
      toolOrder: { v1: ["find"], v2: ["search", "get"] },
    };

    expect(resolveConfig({ search: "" }).toolOrder).toEqual({ v1: ["find"], v2: ["search", "get"] });
  });

  it("parses toolOrder JSON from script dataset", () => {
    setLoadingScript({
      dataset: { toolOrder: '{"v1":["a"],"v2":["b"]}' },
    });

    expect(resolveConfig({ search: "" }).toolOrder).toEqual({ v1: ["a"], v2: ["b"] });
  });

  it("prefers window toolOrder over script dataset", () => {
    window.ZeusTraceConfig = { toolOrder: { v1: ["win"], v2: ["win"] } };
    setLoadingScript({ dataset: { toolOrder: '{"v1":["lose"],"v2":["lose"]}' } });

    expect(resolveConfig({ search: "" }).toolOrder).toEqual({ v1: ["win"], v2: ["win"] });
  });
});

describe("detectiveUrl", () => {
  it("builds hub detective session path", () => {
    expect(detectiveUrl("http://hub", "sess-abc")).toBe(
      "http://hub/hub/debug/session/sess-abc"
    );
  });

  it("strips trailing slash on hub base", () => {
    expect(detectiveUrl("http://hub/", "abc")).toBe("http://hub/hub/debug/session/abc");
  });

  it("returns empty when hub or session id missing", () => {
    expect(detectiveUrl("", "abc")).toBe("");
    expect(detectiveUrl("http://hub", "")).toBe("");
    expect(detectiveUrl("http://hub", "   ")).toBe("");
    expect(detectiveUrl(null, "abc")).toBe("");
  });

  it("URL-encodes session ids", () => {
    expect(detectiveUrl("http://hub", "a/b c")).toBe(
      `http://hub/hub/debug/session/${encodeURIComponent("a/b c")}`
    );
  });
});

describe("publicConfig", () => {
  it("exposes zeusApiUrl, hubBaseUrl, toolOrder, enabled, and version", () => {
    expect(
      publicConfig({
        zeusApiUrl: "https://zeus.example.com",
        hubBaseUrl: "http://hub",
        zeusAuthToken: "secret",
        toolOrder: { v1: [], v2: ["find"] },
        enabled: true,
      })
    ).toEqual({
      zeusApiUrl: "https://zeus.example.com",
      hubBaseUrl: "http://hub",
      toolOrder: { v1: [], v2: ["find"] },
      enabled: true,
      mount: "overlay",
      mountSelector: "",
      version: getWidgetVersion(),
    });
  });

  it("passes through docked mount", () => {
    expect(
      publicConfig({
        zeusApiUrl: "",
        hubBaseUrl: "",
        toolOrder: null,
        enabled: true,
        mount: "docked",
        mountSelector: "#slot",
      }).mount
    ).toBe("docked");
  });
});

describe("resolveConfig mount", () => {
  it("defaults to overlay", () => {
    expect(resolveConfig({ search: "" }).mount).toBe("overlay");
  });

  it("reads docked from window config", () => {
    window.ZeusTraceConfig = { mount: "docked", mountSelector: "#zeus-trace-slot" };
    const cfg = resolveConfig({ search: "" });
    expect(cfg.mount).toBe("docked");
    expect(cfg.mountSelector).toBe("#zeus-trace-slot");
  });
});

describe("getWidgetVersion", () => {
  it("returns a non-empty version string", () => {
    expect(typeof getWidgetVersion()).toBe("string");
    expect(getWidgetVersion().length).toBeGreaterThan(0);
  });
});

describe("zeusFetch", () => {
  it("calls fetch with Bearer header when token is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await zeusFetch("/api/tool-order", {
      zeusApiUrl: "https://zeus.example.com",
      zeusAuthToken: "tok-abc",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://zeus.example.com/api/tool-order", {
      headers: { Authorization: "Bearer tok-abc" },
    });
  });

  it("omits Authorization header when token is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await zeusFetch("/api/tool-order", { zeusApiUrl: "https://zeus.example.com", zeusAuthToken: "" });

    expect(fetchMock).toHaveBeenCalledWith("https://zeus.example.com/api/tool-order", { headers: {} });
  });

  it("forwards AbortSignal when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await zeusFetch("/api/tool-order", { zeusApiUrl: "https://zeus.example.com", zeusAuthToken: "" }, {
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith("https://zeus.example.com/api/tool-order", {
      headers: {},
      signal: controller.signal,
    });
  });
});
