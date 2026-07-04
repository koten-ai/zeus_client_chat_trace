import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initZeusTrace } from "./trace.js";

const widgetHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "widget.html"),
  "utf8"
);

function makeTraceFixture(overrides = {}) {
  return {
    chat_id: "chat-1",
    api_version: "v2",
    target: "demo",
    answer: "Hello",
    trace: {
      rounds: 1,
      total_ms: 500,
      spans: [
        { name: "llm.round1", cls: "ai", at: 0, ms: 200 },
        { name: "tool.search", cls: "tool", at: 200, ms: 300 },
      ],
      steps: [
        { type: "llm", round: 1, ms: 200, finish_reason: "tool_calls", tool_calls: ["search"] },
        { type: "tool", round: 1, name: "search", status: 200, ms: 300, bytes: 1024 },
      ],
      ai_requests: [{ model: "gpt-4o-mini" }],
      tool_calls: [{ name: "search", status: 200 }],
      ...overrides.trace,
    },
    ...overrides,
  };
}

describe("initZeusTrace", () => {
  let root;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ v1: ["search"], v2: ["search"] }) })
    );

    root = document.createElement("div");
    root.innerHTML = widgetHtml;
    document.body.appendChild(root);
  });

  afterEach(() => {
    root?.remove();
    vi.restoreAllMocks();
  });

  it("returns appendTraceCard and openDebugPanel", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });
    expect(api.appendTraceCard).toBeTypeOf("function");
    expect(api.openDebugPanel).toBeTypeOf("function");
  });

  it("appendTraceCard renders a trace card and removes empty state", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });

    api.appendTraceCard("Find hotels in Paris", makeTraceFixture());

    expect(root.querySelector("#trace-empty")).toBeNull();
    const card = root.querySelector(".trace-card");
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("Find hotels in Paris");
    expect(card.textContent).toContain("#1");
    expect(root.querySelector(".trace-waterfall")).not.toBeNull();
  });

  it("appendTraceCard ignores payloads without trace", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });

    api.appendTraceCard("No trace", { answer: "x" });

    expect(root.querySelector("#trace-empty")).not.toBeNull();
    expect(root.querySelectorAll(".trace-card")).toHaveLength(0);
  });

  it("openDebugPanel reveals the debug panel", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });
    const panel = root.querySelector("#debug-panel");

    expect(panel.classList.contains("is-hidden")).toBe(true);

    api.openDebugPanel();

    expect(panel.classList.contains("is-hidden")).toBe(false);
    expect(panel.getAttribute("aria-hidden")).toBe("false");
  });

  it("fetches tool-order when zeusApiUrl is configured", async () => {
    initZeusTrace(root, { zeusApiUrl: "https://zeus.example.com", zeusAuthToken: "tok" });

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://zeus.example.com/api/tool-order",
        expect.objectContaining({ headers: { Authorization: "Bearer tok" } })
      );
    });
  });
});