import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initZeusTrace } from "./trace.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const widgetHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "widget.html"),
  "utf8"
);

function failFixture() {
  return {
    chat_id: "chat-1",
    session_id: "sess-abc-123",
    session_round: 2,
    contract_status: "drift",
    debug: {
      turn_id: "turn-xyz-789",
      session_id: "sess-abc-123",
      preferred_req_id: "req-pref-1",
      hops: [
        {
          req_id: "req-pref-1",
          name: "search",
          status: 500,
          ms: 10,
          preferred: true,
          req: { q: "hi" },
          res: { error: "0 rows" },
        },
      ],
      detective: {
        diagnosis: { grade: "warn", headline: "needs attention", overview: "relax" },
        playbooks: [{ id: "pb1", title: "t" }],
      },
      catalog: { has_mini_schema: true },
      public_trace: {
        rounds: 1,
        layer_a: {
          query_decomposition: { intent: "count", geo: "CO" },
          decomposition: { output: "count", targets: [{ entity_type: "brewery" }] },
        },
        ai_requests: [{ model: "g", messages: ["m"] }],
        ai_responses: [{ finish_reason: "stop", content: "a" }],
        steps: [{ type: "llm", ms: 10, finish_reason: "stop" }],
      },
    },
  };
}

describe("click-to-copy", () => {
  let root;
  let writeText;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ v1: [], v2: [] }) })
    );
    vi.stubGlobal("open", vi.fn());
    document.execCommand = vi.fn(() => true);
    root = document.createElement("div");
    root.innerHTML = widgetHtml;
    document.body.appendChild(root);
  });

  afterEach(() => {
    root?.remove();
    delete document.execCommand;
    vi.restoreAllMocks();
  });

  async function copied(pred) {
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const texts = writeText.mock.calls.map((c) => String(c[0]));
    if (typeof pred === "string") expect(texts).toContain(pred);
    else expect(texts.some(pred)).toBe(true);
    return texts;
  }

  function mount(payload = failFixture()) {
    const api = initZeusTrace(root, {
      zeusApiUrl: "",
      hubBaseUrl: "http://hub.example",
    });
    api.appendTraceCard(payload.question || "q", payload);
    return api;
  }

  it("copies envelope IDs from Overview/Session text plus icon", async () => {
    mount();
    expect(root.querySelector("#tt-panel-overview .det-env button.tt-id")).toBeNull();
    const overviewVals = [...root.querySelectorAll("#tt-panel-overview .tt-copy-id-val")].map(
      (n) => n.textContent
    );
    expect(overviewVals.some((t) => t.includes("sess-abc-123"))).toBe(true);
    expect(overviewVals.some((t) => t.includes("turn-xyz-789"))).toBe(true);
    const overviewBtn = root.querySelector('#tt-panel-overview [data-copy="sess-abc-123"]');
    expect(overviewBtn).not.toBeNull();
    expect(overviewBtn.classList.contains("tt-id")).toBe(false);
    overviewBtn.click();
    await copied("sess-abc-123");
    writeText.mockClear();

    root.querySelector('[data-tab="session"]').click();
    expect(root.querySelector("#tt-panel-session .det-env button.tt-id")).toBeNull();
    const sessionBtn = root.querySelector('#tt-panel-session [data-copy="sess-abc-123"]');
    expect(sessionBtn).not.toBeNull();
    sessionBtn.click();
    await copied("sess-abc-123");
  });

  it("copies session, preferred, turn IDs and support pack", async () => {
    mount();
    root.querySelector("#tt-session button.tt-id").click();
    await copied("sess-abc-123");
    writeText.mockClear();

    root.querySelector('#tt-session [data-copy="req-pref-1"]').click();
    await copied("req-pref-1");
    writeText.mockClear();

    root.querySelector("#tt-detail-head [data-copy]").click();
    await copied("turn-xyz-789");
    writeText.mockClear();

    const chipB = root.querySelector("#tt-diagnosis .idchip b");
    chipB.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await copied("turn-xyz-789");
    writeText.mockClear();

    root.querySelector('[data-action="copy-pack"]').click();
    await copied((t) => t.includes("# Support pack") && t.includes("turn-xyz-789"));
  });

  it("copies hop req_id and hop JSON from the rendered pre", async () => {
    mount();
    root.querySelector('[data-tab="tools"]').click();
    root.querySelector("#tt-tools-hops [data-copy]").click();
    await copied("req-pref-1");
    writeText.mockClear();

    root.querySelector('[data-copy-from="tt-hop-req"]').click();
    await copied((t) => t.includes('"q": "hi"'));
    writeText.mockClear();

    root.querySelector('[data-copy-from="tt-hop-res"]').click();
    await copied((t) => t.includes("0 rows"));
  });

  it("copies LLM I/O, decomp, inject, raw JSON, and Copy all", async () => {
    mount();
    root.querySelector('[data-tab="tools"]').click();
    expect(root.querySelector("#tt-decomp-copy")).not.toBeNull();
    root.querySelector("#tt-decomp-copy").click();
    await copied((t) => t.includes("query_decomposition") && t.includes("count"));
    writeText.mockClear();

    root.querySelector("#tt-llm-copy-req").click();
    await copied((t) => t.includes("messages"));
    writeText.mockClear();

    root.querySelector("#tt-llm-copy-res").click();
    await copied((t) => t.includes("finish_reason"));
    writeText.mockClear();

    root.querySelector('[data-tab="prompt"]').click();
    root.querySelector("#tt-inj-copy-req").click();
    await copied((t) => t.includes("catalog") && t.includes("has_mini_schema"));
    writeText.mockClear();

    root.querySelector('[data-tab="raw"]').click();
    root.querySelector("#tt-raw-copy").click();
    await copied((t) => t.includes("turn-xyz-789") && t.includes("hops"));
    writeText.mockClear();

    root.querySelector("#tt-copy-all").click();
    await copied((t) => {
      const j = JSON.parse(t);
      return Array.isArray(j.traces) && j.traces.length === 1;
    });
  });

  it("copies job id from the session bar", async () => {
    const api = initZeusTrace(root, { zeusApiUrl: "" });
    api.appendTraceCard("job", {
      trace: {
        multi_agent: true,
        job_id: "job_travel_paris_sf",
        pack: "travel",
        units: [{ unit_id: "u1", status: "ok", kind: "agent_turn", goal: "plan", req_ids: ["a"] }],
      },
    });
    const btn = root.querySelector("#tt-session [data-copy]");
    expect(btn).not.toBeNull();
    expect(btn.getAttribute("title")).toBe("Click to copy");
    btn.click();
    await copied("job_travel_paris_sf");
  });

  it("copies from Shadow DOM when clipboard.writeText rejects", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const theme = document.createElement("div");
    theme.className = "zeus-trace-root";
    theme.innerHTML = widgetHtml;
    shadow.appendChild(theme);
    const api = initZeusTrace(theme, { zeusApiUrl: "", mount: "docked" });
    api.appendTraceCard("q", failFixture());
    const btn = theme.querySelector("#tt-session button.tt-id");
    btn.click();
    await vi.waitFor(() => expect(document.execCommand).toHaveBeenCalledWith("copy"));
    await vi.waitFor(() => {
      const toast = theme.querySelector("#toast-msg");
      expect(toast.textContent).toMatch(/copied/i);
    });
    expect(btn.classList.contains("is-copied")).toBe(true);
    host.remove();
  });

  it("keeps the copy toast inside the panel chrome", () => {
    expect(root.querySelector("#tt-panel #toast")).not.toBeNull();
  });
});
