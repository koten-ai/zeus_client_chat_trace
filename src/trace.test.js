import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initZeusTrace } from "./trace.js";

// Minimal panel markup (ids must match src/widget.html). Avoid node:fs under jsdom.
const widgetHtml = `
<button type="button" id="debug-toggle" aria-expanded="false"></button>
<aside id="debug-panel" class="debug-panel is-hidden" aria-hidden="true">
  <header class="debug-panel-header">
    <div class="debug-panel-title-row">
      <h2 id="debug-panel-title">Zeus Tracer</h2>
      <a
        id="debug-detective-link"
        class="debug-detective-link is-disabled"
        href="#"
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled="true"
        hidden
      >Detective ↗</a>
    </div>
    <button type="button" id="trace-copy-full">Copy all</button>
    <button type="button" id="debug-close">×</button>
  </header>
  <div id="trace-total" class="trace-total" style="display:none"></div>
  <div id="trace-list" class="trace-list">
    <div id="trace-empty">No search run yet.</div>
  </div>
  <footer id="debug-panel-footer" class="debug-panel-footer">
    <span id="debug-panel-version" class="debug-panel-version">v—</span>
  </footer>
</aside>
<div id="toast" class="toast hidden">
  <div class="alert"><span id="toast-msg"></span></div>
</div>
`;

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

  it("shows widget version in the panel footer", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });
    const verEl = root.querySelector("#debug-panel-version");
    expect(verEl).not.toBeNull();
    expect(verEl.textContent).toMatch(/^v.+/);
    expect(api.version).toBeTruthy();
    expect(verEl.textContent).toContain(api.version.replace(/^v/, ""));
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

  it("shows Hash Traces and Tool calls dump for multi-round tool calls", async () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });

    api.appendTraceCard(
      "multi-round",
      makeTraceFixture({
        trace: {
          rounds: 2,
          total_ms: 900,
          spans: [
            { name: "ai.chat.round.1", cls: "ai", at: 0, ms: 200 },
            { name: "tool.find", cls: "tool", at: 200, ms: 300 },
            { name: "ai.chat.round.2", cls: "ai", at: 500, ms: 400 },
          ],
          steps: [
            {
              type: "llm",
              round: 1,
              ms: 200,
              finish_reason: "tool_calls",
              tool_calls: ["find"],
              usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
            },
            { type: "tool", round: 1, name: "find", status: 200, ms: 300, bytes: 512 },
            { type: "llm", round: 2, ms: 400, finish_reason: "stop", tool_calls: [] },
          ],
          ai_requests: [{ round: 1 }, { round: 2 }],
          ai_responses: [{ round: 1 }, { round: 2 }],
          tool_calls: [
            { round: 1, name: "find", status: 200, ms: 300 },
          ],
        },
      })
    );

    const card = root.querySelector(".trace-card");
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("2 rounds");

    // Hash Traces is sync — must show round-prefixed LLM/tool lines.
    const hashDump = [...card.querySelectorAll(".trace-dump")].find((el) =>
      el.textContent.includes("Hash Traces")
    );
    expect(hashDump).toBeTruthy();
    expect(hashDump.textContent).toMatch(/\[r1\] LLM/);
    expect(hashDump.textContent).toMatch(/\[r1\] TOOL find/);
    expect(hashDump.textContent).toMatch(/\[r2\] LLM/);

    // Dump titles attach immediately (before jsnview settles).
    await vi.waitFor(() => {
      const titles = [...card.querySelectorAll(".collapse-title")].map((el) => el.textContent);
      expect(titles.some((t) => t.includes("Tool calls"))).toBe(true);
      expect(titles.some((t) => t.includes("AI requests") && t.includes("2 rounds"))).toBe(true);
      expect(titles.some((t) => t.includes("AI responses") && t.includes("2 rounds"))).toBe(true);
    });

    // Tool calls section is open by default when non-empty (checkbox collapse).
    const toolSection = [...card.querySelectorAll(".trace-dump")].find((el) =>
      el.querySelector(".collapse-title")?.textContent?.includes("Tool calls")
    );
    expect(toolSection).toBeTruthy();
    expect(toolSection.querySelector('input[type="checkbox"]')?.checked).toBe(true);
  });

  it("shows tool_calls rounds in Hash Traces when steps are empty", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });

    api.appendTraceCard(
      "tool-calls only",
      makeTraceFixture({
        trace: {
          rounds: 2,
          total_ms: 100,
          spans: [],
          steps: [],
          ai_requests: [],
          ai_responses: [],
          tool_calls: [
            { round: 1, name: "search", status: 200, ms: 40 },
            { round: 2, name: "find", status: 200, ms: 50 },
          ],
        },
      })
    );

    const card = root.querySelector(".trace-card");
    expect(card.textContent).toMatch(/\[r1\] TOOL search/);
    expect(card.textContent).toMatch(/\[r2\] TOOL find/);
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

  it("readyToolOrder resolves even when fetch never settles (timeout)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = initZeusTrace(root, {
      zeusApiUrl: "https://zeus.example.com",
      zeusAuthToken: "",
      toolOrderTimeoutMs: 50,
    });

    const readyPromise = api.readyToolOrder;
    await vi.advanceTimersByTimeAsync(60);
    await expect(readyPromise).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not require readyToolOrder before appendTraceCard works", async () => {
    let resolveFetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );

    const api = initZeusTrace(root, { zeusApiUrl: "https://zeus.example.com", zeusAuthToken: "" });
    // Widget APIs must work while tool-order is still in flight.
    api.appendTraceCard("Find hotels in Paris", makeTraceFixture());
    expect(root.querySelector(".trace-card")).not.toBeNull();

    resolveFetch({ ok: true, json: async () => ({ v1: [], v2: ["search"] }) });
    await api.readyToolOrder;
  });

  it("applies tool_order from search response payload", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });

    api.appendTraceCard("response tool order", makeTraceFixture({
      tool_order: { v1: [], v2: ["pipeline", "search", "find"] },
      trace: {
        rounds: 1,
        total_ms: 100,
        spans: [],
        steps: [
          { type: "tool", round: 1, name: "find", status: 200, ms: 40 },
          { type: "tool", round: 1, name: "search", status: 200, ms: 60 },
        ],
        ai_requests: [],
        tool_calls: [],
      },
    }));

    const labels = [...root.querySelectorAll(".vbar-labels .l")].map((el) => el.textContent);
    expect(labels.indexOf("pipeline")).toBeLessThan(labels.indexOf("search"));
    expect(labels.indexOf("search")).toBeLessThan(labels.indexOf("find"));
  });

  it("defaults missing api_version to v2 for chart order", () => {
    const api = initZeusTrace(root, {
      zeusApiUrl: "",
      zeusAuthToken: "",
      toolOrder: { v1: ["find"], v2: ["pipeline", "search", "find"] },
    });

    const fixture = makeTraceFixture({
      trace: {
        rounds: 1,
        total_ms: 100,
        spans: [],
        steps: [
          { type: "tool", round: 1, name: "find", status: 200, ms: 40 },
          { type: "tool", round: 1, name: "search", status: 200, ms: 60 },
        ],
        ai_requests: [],
        tool_calls: [],
      },
    });
    delete fixture.api_version;

    api.appendTraceCard("default v2 order", fixture);

    const labels = [...root.querySelectorAll(".vbar-labels .l")].map((el) => el.textContent);
    expect(labels.indexOf("pipeline")).toBeLessThan(labels.indexOf("search"));
    expect(labels.indexOf("search")).toBeLessThan(labels.indexOf("find"));
    expect(root.querySelector(".tc-meta")?.textContent).toMatch(/V2/);
  });

  it("uses injected toolOrder without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const api = initZeusTrace(root, {
      zeusApiUrl: "https://zeus.example.com",
      zeusAuthToken: "tok",
      toolOrder: { v1: [], v2: ["search", "get", "find"] },
    });

    await api.readyToolOrder;

    api.appendTraceCard("ordered tools", makeTraceFixture({
      trace: {
        rounds: 1,
        total_ms: 225,
        spans: [],
        steps: [
          { type: "tool", round: 1, name: "find", status: 200, ms: 100 },
          { type: "tool", round: 1, name: "get", status: 200, ms: 50 },
          { type: "tool", round: 1, name: "search", status: 200, ms: 75 },
        ],
        ai_requests: [],
        tool_calls: [],
      },
    }));

    expect(fetchMock).not.toHaveBeenCalled();

    const labels = [...root.querySelectorAll(".vbar-labels .l")].map((el) => el.textContent);
    expect(labels).toEqual(["search", "get", "find"]);
  });

  describe("debug panel title / Detective link", () => {
    it("defaults to Zeus Tracer with Detective link hidden", () => {
      initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "", hubBaseUrl: "http://hub" });

      const title = root.querySelector("#debug-panel-title");
      const link = root.querySelector("#debug-detective-link");
      expect(title?.textContent).toBe("Zeus Tracer");
      expect(link?.hidden).toBe(true);
      expect(link?.getAttribute("aria-disabled")).toBe("true");
    });

    it("sets title and Detective href from req_id and hubBaseUrl", () => {
      const api = initZeusTrace(root, {
        zeusApiUrl: "",
        zeusAuthToken: "",
        hubBaseUrl: "http://hub",
      });

      api.appendTraceCard("q", makeTraceFixture({ req_id: "req-abc" }));

      const title = root.querySelector("#debug-panel-title");
      const link = root.querySelector("#debug-detective-link");
      expect(title?.textContent).toBe("Zeus Tracer: req-abc");
      expect(link?.getAttribute("href")).toBe("http://hub/hub/debug/req/req-abc");
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toContain("noopener");
      expect(link?.hidden).toBe(false);
      expect(link?.getAttribute("aria-disabled")).toBe("false");
    });

    it("updates title/link to the latest request id", () => {
      const api = initZeusTrace(root, {
        zeusApiUrl: "",
        zeusAuthToken: "",
        hubBaseUrl: "http://hub",
      });

      api.appendTraceCard("one", makeTraceFixture({ req_id: "req-abc" }));
      api.appendTraceCard("two", makeTraceFixture({ req_id: "req-xyz" }));

      expect(root.querySelector("#debug-panel-title")?.textContent).toBe("Zeus Tracer: req-xyz");
      expect(root.querySelector("#debug-detective-link")?.getAttribute("href")).toBe(
        "http://hub/hub/debug/req/req-xyz"
      );
    });

    it("leaves previous title unchanged when a later card has no request id", () => {
      const api = initZeusTrace(root, {
        zeusApiUrl: "",
        zeusAuthToken: "",
        hubBaseUrl: "http://hub",
      });

      api.appendTraceCard("one", makeTraceFixture({ req_id: "req-abc" }));
      api.appendTraceCard("two", makeTraceFixture());

      expect(root.querySelector("#debug-panel-title")?.textContent).toBe("Zeus Tracer: req-abc");
      expect(root.querySelector("#debug-detective-link")?.getAttribute("href")).toBe(
        "http://hub/hub/debug/req/req-abc"
      );
    });

    it("shows title with id but keeps Detective hidden when hubBaseUrl is missing", () => {
      const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "", hubBaseUrl: "" });

      api.appendTraceCard("q", makeTraceFixture({ req_id: "req-abc" }));

      expect(root.querySelector("#debug-panel-title")?.textContent).toBe("Zeus Tracer: req-abc");
      const link = root.querySelector("#debug-detective-link");
      expect(link?.hidden).toBe(true);
      expect(link?.getAttribute("aria-disabled")).toBe("true");
    });

    it("URL-encodes special characters in Detective href", () => {
      const api = initZeusTrace(root, {
        zeusApiUrl: "",
        zeusAuthToken: "",
        hubBaseUrl: "http://hub",
      });

      api.appendTraceCard("q", makeTraceFixture({ req_id: "a/b c" }));

      expect(root.querySelector("#debug-detective-link")?.getAttribute("href")).toBe(
        `http://hub/hub/debug/req/${encodeURIComponent("a/b c")}`
      );
    });

    it("extracts request id from trace.req_id", () => {
      const api = initZeusTrace(root, {
        zeusApiUrl: "",
        zeusAuthToken: "",
        hubBaseUrl: "http://hub",
      });

      api.appendTraceCard(
        "q",
        makeTraceFixture({
          trace: {
            req_id: "from-trace",
            rounds: 1,
            total_ms: 10,
            spans: [],
            steps: [],
            ai_requests: [],
            tool_calls: [],
          },
        })
      );

      expect(root.querySelector("#debug-panel-title")?.textContent).toBe("Zeus Tracer: from-trace");
    });

    it("extracts request id from trace.session_turn.req_id", () => {
      const api = initZeusTrace(root, {
        zeusApiUrl: "",
        zeusAuthToken: "",
        hubBaseUrl: "http://hub",
      });

      api.appendTraceCard(
        "q",
        makeTraceFixture({
          trace: {
            rounds: 1,
            total_ms: 10,
            spans: [],
            steps: [],
            ai_requests: [],
            tool_calls: [{ name: "find", req_id: "tool-old" }],
            session_turn: { req_id: "turn-req-123", status: 200 },
          },
        })
      );

      expect(root.querySelector("#debug-panel-title")?.textContent).toBe("Zeus Tracer: turn-req-123");
      expect(root.querySelector("#debug-detective-link")?.getAttribute("href")).toBe(
        "http://hub/hub/debug/req/turn-req-123"
      );
    });

    it("falls back to last tool_call req_id", () => {
      const api = initZeusTrace(root, {
        zeusApiUrl: "",
        zeusAuthToken: "",
        hubBaseUrl: "http://hub",
      });

      api.appendTraceCard(
        "q",
        makeTraceFixture({
          trace: {
            rounds: 1,
            total_ms: 10,
            spans: [],
            steps: [],
            ai_requests: [],
            tool_calls: [
              { name: "find", req_id: "tool-a" },
              { name: "find", req_id: "tool-b" },
            ],
          },
        })
      );

      expect(root.querySelector("#debug-panel-title")?.textContent).toBe("Zeus Tracer: tool-b");
    });

    it("does not update title when payload has no trace", () => {
      const api = initZeusTrace(root, {
        zeusApiUrl: "",
        zeusAuthToken: "",
        hubBaseUrl: "http://hub",
      });

      api.appendTraceCard("notrace", { req_id: "should-not-apply", answer: "x" });

      expect(root.querySelector("#debug-panel-title")?.textContent).toBe("Zeus Tracer");
      expect(root.querySelector("#debug-detective-link")?.hidden).toBe(true);
    });
  });
});