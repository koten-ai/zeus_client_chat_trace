import { afterEach, describe, expect, it, vi } from "vitest";

describe("loadJsnview", () => {
  afterEach(() => {
    delete window.jsnview;
    document.head.innerHTML = "";
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("resolves immediately when window.jsnview already exists", async () => {
    const fakeJsnview = vi.fn();
    window.jsnview = fakeJsnview;

    const { loadJsnview } = await import("./jsnview-loader.js");
    const result = await loadJsnview();

    expect(result).toBe(fakeJsnview);
    expect(document.querySelectorAll("script")).toHaveLength(0);
  });

  it("injects a script tag when jsnview is not loaded", async () => {
    const { loadJsnview } = await import("./jsnview-loader.js");

    const promise = loadJsnview();
    const script = document.querySelector('script[src*="jsnview"]');
    expect(script).not.toBeNull();

    window.jsnview = vi.fn();
    script.onload();

    await expect(promise).resolves.toBe(window.jsnview);
  });

  it("rejects when script load fails", async () => {
    const { loadJsnview } = await import("./jsnview-loader.js");

    const promise = loadJsnview();
    const script = document.querySelector('script[src*="jsnview"]');
    script.onerror();

    await expect(promise).rejects.toThrow("Failed to load jsnview");
  });
});