import { afterEach, describe, expect, it, vi } from "vitest";
import { publicConfig, resolveConfig, setLoadingScript, zeusFetch } from "./config.js";

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
      zeusAuthToken: "secret",
      toolOrder: null,
    });
  });

  it("falls back to script dataset attributes", () => {
    setLoadingScript({
      dataset: {
        zeusApiUrl: "https://api.test/",
        zeusAuthToken: "dataset-token",
      },
    });

    expect(resolveConfig()).toEqual({
      zeusApiUrl: "https://api.test",
      zeusAuthToken: "dataset-token",
      toolOrder: null,
    });
  });

  it("prefers window config over script dataset", () => {
    window.ZeusTraceConfig = { zeusApiUrl: "https://win.example.com", zeusAuthToken: "win" };
    setLoadingScript({ dataset: { zeusApiUrl: "https://lose.example.com", zeusAuthToken: "lose" } });

    expect(resolveConfig().zeusApiUrl).toBe("https://win.example.com");
    expect(resolveConfig().zeusAuthToken).toBe("win");
  });

  it("returns empty strings when unset", () => {
    expect(resolveConfig()).toEqual({ zeusApiUrl: "", zeusAuthToken: "", toolOrder: null });
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

describe("publicConfig", () => {
  it("exposes zeusApiUrl and toolOrder", () => {
    expect(
      publicConfig({
        zeusApiUrl: "https://zeus.example.com",
        zeusAuthToken: "secret",
        toolOrder: { v1: [], v2: ["find"] },
      })
    ).toEqual({
      zeusApiUrl: "https://zeus.example.com",
      toolOrder: { v1: [], v2: ["find"] },
    });
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