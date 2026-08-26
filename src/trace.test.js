import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initZeusTrace } from "./trace.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const widgetHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "widget.html"),
  "utf8"
);

function makeTraceFixture(overrides = {}) {
  return {
    chat_id: "chat-1",
    session_id: "sess-1",
    api_version: "v2",
    target: "demo",
    answer: "Hello",
    trace: {
      rounds: 1,
      total_ms: 500,
      turn_id: "turn-1",
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
      ...(overrides.trace || {}),
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
    vi.stubGlobal("open", vi.fn());
    root = document.createElement("div");
    root.innerHTML = widgetHtml;
    document.body.appendChild(root);
  });

  afterEach(() => {
    root?.remove();
    delete window.ZeusTraceConfig;
    vi.restoreAllMocks();
  });

  it("returns appendTraceCard and openDebugPanel", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });
    expect(api.appendTraceCard).toBeTypeOf("function");
    expect(api.openDebugPanel).toBeTypeOf("function");
    expect(api.setEntries).toBeTypeOf("function");
    expect(api.exportBundle).toBeTypeOf("function");
  });

  it("shows widget version in the panel footer", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });
    const verEl = root.querySelector("#debug-panel-version");
    expect(verEl).not.toBeNull();
    expect(verEl.textContent).toMatch(/^v.+/);
    expect(api.version).toBeTruthy();
    expect(verEl.textContent).toContain(api.version.replace(/^v/, ""));
  });

  it("appendTraceCard renders a turn in the inspector list", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });
    api.appendTraceCard("Find hotels in Paris", makeTraceFixture());

    const empty = root.querySelector("#tt-empty");
    expect(empty.hidden).toBe(true);
    const item = root.querySelector(".tt-turn-item");
    expect(item).not.toBeNull();
    expect(item.textContent).toContain("Find hotels in Paris");
    expect(root.querySelector(".trace-waterfall")).not.toBeNull();
    expect(root.querySelector("#tt-turn-count").textContent).toMatch(/1 turn/);
  });

  it("opens the overlay when a card is appended", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });
    expect(root.querySelector("#debug-panel").classList.contains("is-hidden")).toBe(true);
    api.appendTraceCard("q", makeTraceFixture());
    expect(root.querySelector("#debug-panel").classList.contains("is-hidden")).toBe(false);
    expect(root.querySelector("#debug-toggle").getAttribute("aria-expanded")).toBe("true");
  });

  it("toggle and close control the overlay", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });
    api.openDebugPanel();
    expect(root.querySelector("#debug-panel").classList.contains("is-hidden")).toBe(false);
    root.querySelector("#debug-close").click();
    expect(root.querySelector("#debug-panel").classList.contains("is-hidden")).toBe(true);
    root.querySelector("#debug-toggle").click();
    expect(root.querySelector("#debug-panel").classList.contains("is-hidden")).toBe(false);
  });

  it("shows diagnosis strip and prefers Detective tab on warn", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", zeusAuthToken: "" });
    api.appendTraceCard(
      "failed hop",
      makeTraceFixture({
        trace: {
          hops: [{ req_id: "r-fail", verb: "search", status: 500, ms: 40 }],
          detective: {
            diagnosis: { grade: "warn", headline: "0-row hop then broaden", overview: "Broaden the filter." },
            playbooks: [{ id: "relax_filter", title: "Relax filter" }],
          },
        },
      })
    );
    const diag = root.querySelector("#tt-diagnosis");
    expect(diag.hidden).toBe(false);
    expect(diag.textContent).toMatch(/0-row hop/);
    expect(root.querySelector('[data-tab="detective"]').classList.contains("on")).toBe(true);
  });

  it("renders session bar with contract and semantic cache", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", hubBaseUrl: "http://hub.example:9091" });
    api.appendTraceCard(
      "q",
      makeTraceFixture({
        session_id: "sess-abc",
        session_round: 3,
        contract_status: "match",
        trace: {
          notes: ["semantic_cache.recall: blocks=1"],
          stamp: { user: "zeus_client" },
          preferred_req_id: "req-pref",
          hops: [{ req_id: "req-pref", verb: "search", status: 200, preferred: true }],
        },
      })
    );
    const bar = root.querySelector("#tt-session");
    expect(bar.hidden).toBe(false);
    expect(bar.textContent).toMatch(/contract:match/);
    expect(bar.textContent).toMatch(/cache:recall/);
    expect(bar.textContent).toMatch(/user zeus_client/);
  });

  it("copies a bundle via Copy all", async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const api = initZeusTrace(root, { zeusApiUrl: "" });
    api.appendTraceCard("q", makeTraceFixture());
    root.querySelector("#tt-copy-all").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const payload = JSON.parse(writeText.mock.calls[0][0]);
    expect(payload.traces).toHaveLength(1);
    expect(payload.max_shown_turns).toBe(12);
  });

  it("keeps last 12 turns", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "" });
    for (let i = 0; i < 14; i++) {
      api.appendTraceCard("q" + i, makeTraceFixture({ chat_id: "c", trace: { turn_id: "t" + i, hops: [] } }));
    }
    expect(root.querySelectorAll(".tt-turn-item")).toHaveLength(12);
    const bundle = api.exportBundle();
    expect(bundle.traces).toHaveLength(12);
  });

  it("renders v2.3.0 debug-shaped payload without spans", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "" });
    api.appendTraceCard("How many IPA breweries", {
      question: "How many IPA breweries",
      debug: {
        turn_id: "turn-v23",
        session_id: "sess-v23",
        tokens: { prompt: 100, completion: 20, total: 120, cached: 8, ok: true },
        hops: [{ req_id: "h1", name: "search", status: 200, ms: 80 }],
        catalog: { has_mini_schema: true, has_scope_brief: true, base_id: "base-5.3" },
        public_trace: {
          rounds: 1,
          steps: [
            { type: "llm", ms: 200 },
            { type: "tool", name: "search", status: 200, ms: 80 },
          ],
          notes: ["semantic_cache.recall: blocks=1"],
        },
      },
    });
    expect(root.querySelector(".tt-turn-item").textContent).toMatch(/IPA/);
    expect(root.querySelector(".tt-chip-row")?.textContent).toMatch(/MINI yes/);
    expect(root.querySelector("#tt-session").textContent).toMatch(/cache:recall/);
  });

  it("shows hop Bytes from result_json when hops omit a size field", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "" });
    api.appendTraceCard("find airports", {
      debug: {
        turn_id: "turn-bytes",
        hops: [
          {
            req_id: "h-find",
            name: "find",
            status: 200,
            ms: 22,
            result_json: {
              result: {
                items: [
                  { id: "n1", name: "Sleetmute Airport" },
                  { id: "n2", name: "Fostoria Metropolitan Airport" },
                ],
              },
            },
          },
        ],
        public_trace: { rounds: 1, steps: [] },
      },
    });
    root.querySelector('[data-tab="hops"]').click();
    const bytesCell = root.querySelector("#tt-panel-hops tbody tr td:nth-child(5)");
    expect(bytesCell).not.toBeNull();
    expect(bytesCell.textContent.trim()).not.toBe("—");
    expect(bytesCell.textContent).toMatch(/B$/);
  });

  it("shows hop Bytes from a matching tool step", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "" });
    api.appendTraceCard("legacy mix", {
      trace: {
        hops: [{ req_id: "early", name: "search", status: 200, ms: 240 }],
        steps: [{ type: "tool", name: "search", status: 200, ms: 240, bytes: 4096 }],
      },
    });
    root.querySelector('[data-tab="hops"]').click();
    const bytesCell = root.querySelector("#tt-panel-hops tbody tr td:nth-child(5)");
    expect(bytesCell.textContent.trim()).toBe("4.0kB");
  });

  it("docked mount does not hide the panel on close", () => {
    const api = initZeusTrace(root, { mount: "docked" });
    expect(root.querySelector("#debug-panel").classList.contains("is-hidden")).toBe(false);
    api.closeDebugPanel();
    expect(root.querySelector("#debug-panel").classList.contains("is-hidden")).toBe(false);
  });

  it("clear resets job chrome and empties the list", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "" });
    api.appendTraceCard("job", {
      trace: {
        multi_agent: true,
        job_id: "job-1",
        units: [{ unit_id: "u1", status: "ok", kind: "agent_turn", goal: "plan trip", req_ids: ["a"] }],
      },
    });
    expect(root.querySelector("#tt-turn-count").textContent).toMatch(/unit/);
    api.clear();
    expect(root.querySelector("#tt-turn-count").textContent).toBe("0 turns");
    expect(root.querySelector("#tt-empty").hidden).toBe(false);
    expect(root.querySelector("#tt-empty").textContent).toMatch(/No turn run yet/);
  });

  it("setJobMode swaps chrome to units rail", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "" });
    api.appendTraceCard("job", {
      trace: {
        multi_agent: true,
        job_id: "job-1",
        units: [{ unit_id: "u1", status: "ok", kind: "agent_turn", goal: "plan trip", req_ids: ["a"] }],
      },
    });
    expect(root.querySelector(".tt-title").textContent).toMatch(/Job traces|Zeus Tracer/);
    expect(root.querySelector(".tt-turn-item").textContent).toMatch(/u1|plan trip/);
  });

  it("Detective and Hub session links use hubBaseUrl from config", () => {
    const hub = "http://configured.example:9091";
    const api = initZeusTrace(root, { zeusApiUrl: "", hubBaseUrl: hub });
    api.appendTraceCard(
      "q",
      makeTraceFixture({
        session_id: "sess-cfg",
        preferred_req_id: "req-cfg",
        trace: {
          preferred_req_id: "req-cfg",
          hops: [{ req_id: "req-cfg", verb: "search", status: 200, preferred: true }],
        },
      })
    );

    const sessionLink = root.querySelector("#tt-session a.tt-link");
    expect(sessionLink).not.toBeNull();
    expect(sessionLink.getAttribute("href")).toBe(`${hub}/hub/debug/session/sess-cfg`);

    root.querySelector("#tt-detective").click();
    expect(window.open).toHaveBeenCalledWith(
      `${hub}/hub/#/debug/req/req-cfg`,
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("Open in Hub and Detective tab links use hubBaseUrl from config", () => {
    const hub = "http://from-config.local:9091";
    const api = initZeusTrace(root, { zeusApiUrl: "", hubBaseUrl: hub });
    api.appendTraceCard(
      "q",
      makeTraceFixture({
        session_id: "sess-tab",
        preferred_req_id: "req-tab",
        trace: {
          preferred_req_id: "req-tab",
          hops: [{ req_id: "req-tab", verb: "search", status: 200, preferred: true }],
        },
      })
    );

    root.querySelector('[data-tab="hops"]').click();
    root.querySelector('[data-action="open-req"]').click();
    expect(window.open).toHaveBeenCalledWith(
      `${hub}/hub/#/debug/req/req-tab`,
      "_blank",
      "noopener,noreferrer"
    );

    root.querySelector('[data-tab="detective"]').click();
    const session = root.querySelector('[data-action="hub-session"]');
    const req = root.querySelector('[data-action="hub-req"]');
    expect(session.getAttribute("href")).toBe(`${hub}/hub/debug/session/sess-tab`);
    expect(req.getAttribute("href")).toBe(`${hub}/hub/#/debug/req/req-tab`);
  });

  it("Detective uses live ZeusTraceConfig.hubBaseUrl over the init snapshot", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", hubBaseUrl: "http://stale.example" });
    api.appendTraceCard(
      "q",
      makeTraceFixture({
        session_id: "sess-live",
        preferred_req_id: "req-live",
        trace: {
          preferred_req_id: "req-live",
          hops: [{ req_id: "req-live", verb: "search", status: 200, preferred: true }],
        },
      })
    );
    window.ZeusTraceConfig = { hubBaseUrl: "http://live.example:9091" };
    root.querySelector("#tt-detective").click();
    expect(window.open).toHaveBeenCalledWith(
      "http://live.example:9091/hub/#/debug/req/req-live",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("does not open a tab when hubBaseUrl is unset", () => {
    const api = initZeusTrace(root, { zeusApiUrl: "", hubBaseUrl: "" });
    api.appendTraceCard(
      "q",
      makeTraceFixture({
        session_id: "sess-none",
        preferred_req_id: "req-none",
        trace: {
          preferred_req_id: "req-none",
          hops: [{ req_id: "req-none", verb: "search", status: 200, preferred: true }],
        },
      })
    );
    expect(root.querySelector("#tt-session a.tt-link")).toBeNull();
    root.querySelector("#tt-detective").click();
    expect(window.open).not.toHaveBeenCalled();
  });
});
