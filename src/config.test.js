import { afterEach, describe, expect, it, vi } from "vitest";
import { detectiveUrl, getWidgetVersion, publicConfig, resolveConfig, setLoadingScript, zeusFetch } from "./config.js";

afterEach(() => {
  delete window.ZeusTraceConfig;
  setLoadingScript(null);
  vi.restoreAllMocks();
});

describe("resolveConfig", () => {
  it("reads zeusApiUrl and zeusAuthToken from window.ZeusTraceConfig", () => {
    window.ZeusTraceConfig = {
      zeusApiUrl: "https://zeus.example.com/",
      zeusAuthToken: "secret",
    };

    expect(resolveConfig()).toEqual({
      zeusApiUrl: "https://zeus.example.com",
      hubBaseUrl: "",
      zeusAuthToken: "secret",
      toolOrder: null,
    });
  });

  it("reads hubBaseUrl from window.ZeusTraceConfig and strips trailing slash", () => {
    window.ZeusTraceConfig = {
      hubBaseUrl: "http://hub/",
    };

    expect(resolveConfig().hubBaseUrl).toBe("http://hub");
  });

  it("falls back to script dataset attributes", () => {
    setLoadingScript({
      dataset: {
        zeusApiUrl: "https://api.test/",
        zeusAuthToken: "dataset-token",
        hubBaseUrl: "http://hub-from-data/",
      },
    });

    expect(resolveConfig()).toEqual({
      zeusApiUrl: "https://api.test",
      hubBaseUrl: "http://hub-from-data",
      zeusAuthToken: "dataset-token",
      toolOrder: null,
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

    expect(resolveConfig().zeusApiUrl).toBe("https://win.example.com");
    expect(resolveConfig().zeusAuthToken).toBe("win");
    expect(resolveConfig().hubBaseUrl).toBe("http://hub-win");
  });

  it("returns empty strings when unset", () => {
    expect(resolveConfig()).toEqual({
      zeusApiUrl: "",
      hubBaseUrl: "",
      zeusAuthToken: "",
      toolOrder: null,
    });
  });

  it("reads toolOrder from window.ZeusTraceConfig", () => {
    window.ZeusTraceConfig = {
      toolOrder: { v1: ["find"], v2: ["search", "get"] },
    };

    expect(resolveConfig().toolOrder).toEqual({ v1: ["find"], v2: ["search", "get"] });
  });

  it("parses toolOrder JSON from script dataset", () => {
    setLoadingScript({
      dataset: { toolOrder: '{"v1":["a"],"v2":["b"]}' },
    });

    expect(resolveConfig().toolOrder).toEqual({ v1: ["a"], v2: ["b"] });
  });

  it("prefers window toolOrder over script dataset", () => {
    window.ZeusTraceConfig = { toolOrder: { v1: ["win"], v2: ["win"] } };
    setLoadingScript({ dataset: { toolOrder: '{"v1":["lose"],"v2":["lose"]}' } });

    expect(resolveConfig().toolOrder).toEqual({ v1: ["win"], v2: ["win"] });
  });
});

describe("detectiveUrl", () => {
  it("builds hub detective path", () => {
    expect(detectiveUrl("http://hub", "req-abc")).toBe("http://hub/hub/debug/req/req-abc");
  });

  it("strips trailing slash on hub base", () => {
    expect(detectiveUrl("http://hub/", "abc")).toBe("http://hub/hub/debug/req/abc");
  });

  it("returns empty when hub or request id missing", () => {
    expect(detectiveUrl("", "abc")).toBe("");
    expect(detectiveUrl("http://hub", "")).toBe("");
    expect(detectiveUrl("http://hub", "   ")).toBe("");
    expect(detectiveUrl(null, "abc")).toBe("");
  });

  it("URL-encodes request ids", () => {
    expect(detectiveUrl("http://hub", "a/b c")).toBe(
      `http://hub/hub/debug/req/${encodeURIComponent("a/b c")}`
    );
  });
});

describe("publicConfig", () => {
  it("exposes zeusApiUrl, hubBaseUrl, toolOrder, and version", () => {
    expect(
      publicConfig({
        zeusApiUrl: "https://zeus.example.com",
        hubBaseUrl: "http://hub",
        zeusAuthToken: "secret",
        toolOrder: { v1: [], v2: ["find"] },
      })
    ).toEqual({
      zeusApiUrl: "https://zeus.example.com",
      hubBaseUrl: "http://hub",
      toolOrder: { v1: [], v2: ["find"] },
      version: getWidgetVersion(),
    });
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
