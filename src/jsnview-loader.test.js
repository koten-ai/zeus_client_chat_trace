import { afterEach, describe, expect, it, vi } from "vitest";

describe("loadJsnview", () => {
  afterEach(async () => {
    delete window.jsnview;
    document.head.innerHTML = "";
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function loadModule() {
    const mod = await import("./jsnview-loader.js");
    mod.__resetJsnviewLoaderForTests();
    return mod;
  }

  it("resolves immediately when window.jsnview already exists", async () => {
    const fakeJsnview = vi.fn();
    window.jsnview = fakeJsnview;

    const { loadJsnview } = await loadModule();
    const result = await loadJsnview();

    expect(result).toBe(fakeJsnview);
    expect(document.querySelectorAll("script")).toHaveLength(0);
  });

  it("injects the correct CDN script when jsnview is not loaded", async () => {
    const { loadJsnview, JSNVIEW_URL } = await loadModule();

    const promise = loadJsnview();
    const script = document.querySelector(`script[src="${JSNVIEW_URL}"]`);
    expect(script).not.toBeNull();
    expect(JSNVIEW_URL).toContain("index.min.js");
    expect(JSNVIEW_URL).not.toContain("index.umd.js");

    window.jsnview = vi.fn();
    script.onload();

    await expect(promise).resolves.toBe(window.jsnview);
  });

  it("rejects when script load fails", async () => {
    const { loadJsnview } = await loadModule();

    const promise = loadJsnview();
    const script = document.querySelector('script[src*="jsnview"]');
    script.onerror();

    await expect(promise).rejects.toThrow("Failed to load jsnview");
  });

  it("retries after a previous failed inject instead of hanging", async () => {
    const { loadJsnview, JSNVIEW_URL, __resetJsnviewLoaderForTests } = await loadModule();

    const first = loadJsnview();
    const script1 = document.querySelector(`script[src="${JSNVIEW_URL}"]`);
    script1.onerror();
    await expect(first).rejects.toThrow("Failed to load jsnview");

    // Simulate what a broken loader left behind, then clear module cache only.
    __resetJsnviewLoaderForTests();

    const second = loadJsnview();
    const script2 = document.querySelector(`script[src="${JSNVIEW_URL}"]`);
    expect(script2).not.toBeNull();
    window.jsnview = vi.fn();
    script2.onload();
    await expect(second).resolves.toBe(window.jsnview);
  });

  it("rejects if script loads without defining window.jsnview", async () => {
    const { loadJsnview } = await loadModule();

    const promise = loadJsnview();
    const script = document.querySelector('script[src*="jsnview"]');
    script.onload();

    await expect(promise).rejects.toThrow(/window\.jsnview is missing/);
  });
});
