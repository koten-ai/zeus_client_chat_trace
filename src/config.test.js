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
    });
  });

  it("prefers window config over script dataset", () => {
    window.ZeusTraceConfig = { zeusApiUrl: "https://win.example.com", zeusAuthToken: "win" };
    setLoadingScript({ dataset: { zeusApiUrl: "https://lose.example.com", zeusAuthToken: "lose" } });

    expect(resolveConfig().zeusApiUrl).toBe("https://win.example.com");
    expect(resolveConfig().zeusAuthToken).toBe("win");
  });

  it("returns empty strings when unset", () => {
    expect(resolveConfig()).toEqual({ zeusApiUrl: "", zeusAuthToken: "" });
  });
});

describe("publicConfig", () => {
  it("exposes only zeusApiUrl", () => {
    expect(publicConfig({ zeusApiUrl: "https://zeus.example.com", zeusAuthToken: "secret" })).toEqual({
      zeusApiUrl: "https://zeus.example.com",
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
});