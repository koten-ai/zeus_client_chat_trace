import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard, escapeHtml, prettyJSON } from "./helpers.js";

describe("copy helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete document.execCommand;
  });

  it("prettyJSON always returns a string", () => {
    expect(prettyJSON(undefined)).toBe("null");
    expect(prettyJSON({ a: 1 })).toBe("{\n  \"a\": 1\n}");
  });

  it("escapeHtml encodes quotes for data-copy attributes", () => {
    expect(escapeHtml('sess"x')).toContain("&quot;");
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("copyToClipboard uses clipboard.writeText when it resolves", async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    document.execCommand = vi.fn(() => false);
    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("copyToClipboard keeps sync execCommand result when writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    document.execCommand = vi.fn(() => true);
    await expect(copyToClipboard("sid-1")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(writeText).toHaveBeenCalledWith("sid-1");
  });

  it("copyToClipboard falls back to execCommand when clipboard is missing", async () => {
    vi.stubGlobal("navigator", {});
    document.execCommand = vi.fn(() => true);
    await expect(copyToClipboard("job-9")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("copyToClipboard returns false when empty or both methods fail", async () => {
    vi.stubGlobal("navigator", {});
    document.execCommand = vi.fn(() => false);
    await expect(copyToClipboard("")).resolves.toBe(false);
    await expect(copyToClipboard("x")).resolves.toBe(false);
  });
});
