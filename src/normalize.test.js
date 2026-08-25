import { describe, expect, it } from "vitest";
import {
  coerceTraceEntry,
  detectiveGrade,
  normalizeHops,
  normalizeTurnEntry,
} from "./normalize.js";

describe("coerceTraceEntry", () => {
  it("returns null without trace or debug", () => {
    expect(coerceTraceEntry(null)).toBeNull();
    expect(coerceTraceEntry({ question: "x" })).toBeNull();
  });

  it("passes through a legacy trace card", () => {
    const raw = { question: "q", trace: { rounds: 1, steps: [] } };
    const out = coerceTraceEntry(raw);
    expect(out.trace.rounds).toBe(1);
    expect(out.question).toBe("q");
  });

  it("merges DebugBundle.to_dict() + public_trace", () => {
    const raw = {
      question: "q",
      debug: {
        turn_id: "t1",
        session_id: "s1",
        preferred_req_id: "r1",
        hops: [{ req_id: "r1", name: "search", status: 200 }],
        tokens: { prompt: 10, completion: 4, total: 14, ok: true },
        public_trace: { rounds: 2, steps: [], notes: ["semantic_cache.recall: blocks=1"] },
        detective: { diagnosis: { grade: "pass", headline: "ok" } },
      },
    };
    const out = coerceTraceEntry(raw);
    expect(out.trace.turn_id).toBe("t1");
    expect(out.trace.session_id).toBe("s1");
    expect(out.trace.preferred_req_id).toBe("r1");
    expect(out.trace.hops).toHaveLength(1);
    expect(out.trace.tokens.total).toBe(14);
    expect(out.trace.detective.diagnosis.grade).toBe("pass");
    expect(out.trace.notes[0]).toMatch(/semantic_cache/);
  });

  it("strips G2 keys and array business_rules_triggers", () => {
    const out = coerceTraceEntry({
      trace: {
        wish_i_knew: "secret",
        layer_a: {
          confidence: "high",
          wish_i_knew: "nope",
          jail_break_attempt: true,
          business_rules_triggers: ["legacy"],
        },
      },
    });
    expect(out.trace.wish_i_knew).toBeUndefined();
    expect(out.trace.layer_a.confidence).toBe("high");
    expect(out.trace.layer_a.wish_i_knew).toBeUndefined();
    expect(out.trace.layer_a.jail_break_attempt).toBeUndefined();
    expect(out.trace.layer_a.business_rules_triggers).toBeUndefined();
  });

  it("keeps object business_rules_triggers", () => {
    const out = coerceTraceEntry({
      trace: { layer_a: { business_rules_triggers: { alcohol: true } } },
    });
    expect(out.trace.layer_a.business_rules_triggers).toEqual({ alcohol: true });
  });
});

describe("detectiveGrade", () => {
  it("maps fail/warn/pass and playbooks", () => {
    expect(detectiveGrade({ diagnosis: { grade: "fail" } })).toBe("fail");
    expect(detectiveGrade({ diagnosis: { grade: "warn" } })).toBe("warn");
    expect(detectiveGrade({ diagnosis: { grade: "pass" } })).toBe("pass");
    expect(detectiveGrade({ playbooks: ["relax_filter"] })).toBe("warn");
  });
});

describe("normalizeHops", () => {
  it("uses hops[] when present", () => {
    const hops = normalizeHops(
      { hops: [{ req_id: "abc", verb: "search", status: 200, ms: 12, preferred: true }] },
      [],
      "abc"
    );
    expect(hops[0].verb).toBe("search");
    expect(hops[0].preferred).toBe(true);
  });

  it("falls back to tool steps", () => {
    const hops = normalizeHops({}, [{ type: "tool", name: "find", status: 200, ms: 9, req_id: "x" }], "x");
    expect(hops).toHaveLength(1);
    expect(hops[0].verb).toBe("find");
    expect(hops[0].preferred).toBe(true);
  });

  it("keeps explicit hop.bytes", () => {
    const hops = normalizeHops(
      { hops: [{ req_id: "r", name: "search", status: 200, bytes: 4096 }] },
      [],
      ""
    );
    expect(hops[0].bytes).toBe(4096);
  });

  it("accepts byte_size and result_bytes aliases", () => {
    expect(
      normalizeHops({ hops: [{ req_id: "a", name: "search", byte_size: 512 }] }, [], "")[0].bytes
    ).toBe(512);
    expect(
      normalizeHops({ hops: [{ req_id: "b", name: "search", result_bytes: 2048 }] }, [], "")[0].bytes
    ).toBe(2048);
  });

  it("preserves preformatted byte strings from sketches", () => {
    const hops = normalizeHops(
      { hops: [{ req_id: "r", name: "find", bytes: "6.1kB" }] },
      [],
      ""
    );
    expect(hops[0].bytes).toBe("6.1kB");
  });

  it("pulls bytes from a matching tool step when hops[] omits them", () => {
    const hops = normalizeHops(
      { hops: [{ req_id: "early", name: "search", status: 200, ms: 240 }] },
      [{ type: "tool", round: 1, name: "search", status: 200, ms: 240, bytes: 4096 }],
      ""
    );
    expect(hops[0].bytes).toBe(4096);
  });

  it("estimates bytes from 2.3.0 result_json when no size field is present", () => {
    const body = { result: { items: [{ id: "n1", name: "SFO" }, { id: "n2", name: "LAX" }] } };
    const hops = normalizeHops(
      { hops: [{ req_id: "h1", name: "find", status: 200, ms: 12, result_json: body }] },
      [],
      ""
    );
    expect(hops[0].bytes).toBeGreaterThan(20);
    expect(hops[0].res).toEqual(body);
  });

  it("does not treat result_size (row count) as bytes", () => {
    const hops = normalizeHops(
      { hops: [{ req_id: "r", name: "search", status: 200, result_size: 47 }] },
      [],
      ""
    );
    expect(hops[0].bytes).toBeNull();
  });

  it("estimates bytes from snippet when result_json is absent", () => {
    const snippet = '{"result":{"items":[{"id":"n1"}]}}';
    const hops = normalizeHops(
      { hops: [{ req_id: "r", name: "find", status: 200, snippet }] },
      [],
      ""
    );
    expect(hops[0].bytes).toBe(new TextEncoder().encode(snippet).length);
  });

  it("keeps explicit zero bytes", () => {
    expect(normalizeHops({ hops: [{ req_id: "r", name: "search", bytes: 0 }] }, [], "")[0].bytes).toBe(0);
  });

  it("fills req from the matching step when the hop has no request bag", () => {
    const hops = normalizeHops(
      { hops: [{ req_id: "r1", name: "search", status: 200 }] },
      [{ type: "tool", req_id: "r1", name: "search", args: { q: "IPA" } }],
      ""
    );
    expect(hops[0].req).toEqual({ q: "IPA" });
  });
});

describe("normalizeTurnEntry", () => {
  it("builds a view-model from a legacy fixture", () => {
    const vm = normalizeTurnEntry(
      {
        question: "Find hotels in Paris",
        session_id: "sess-1",
        api_version: "v2",
        target: "demo",
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
        },
      },
      0
    );
    expect(vm.question).toBe("Find hotels in Paris");
    expect(vm.session_id).toBe("sess-1");
    expect(vm.hops.length).toBe(1);
    expect(vm.metrics.total).toBe(500);
    expect(vm.spans.length).toBeGreaterThan(0);
    expect(vm.status).toBe("ok");
  });

  it("prefers public_trace.tokens rollup and semantic_cache notes", () => {
    const vm = normalizeTurnEntry(
      {
        question: "q",
        trace: {
          tokens: { prompt: 4102, completion: 388, total: 4490, cached: 512, ok: true },
          notes: ["semantic_cache.recall: blocks=2"],
          catalog: { has_mini_schema: true, has_scope_brief: true, base_id: "base-5.3", client_floor: "5" },
          hops: [{ req_id: "r", verb: "search", status: 200, ms: 10 }],
          steps: [],
        },
      },
      0
    );
    expect(vm.metrics.tokens).toBe(4490);
    expect(vm.metrics.tokensIn).toBe(4102);
    expect(vm.metrics.tokensOut).toBe(388);
    expect(vm.metrics.tokensCached).toBe(512);
    expect(vm.semanticCache[0]).toMatch(/recall/);
    expect(vm.catalog.base_id).toBe("base-5.3");
  });

  it("marks warn when detective grade is warn", () => {
    const vm = normalizeTurnEntry(
      {
        question: "q",
        trace: {
          detective: {
            diagnosis: { grade: "warn", headline: "0-row hop" },
            playbooks: [{ id: "relax_filter", title: "Relax filter" }],
          },
          hops: [{ req_id: "r", verb: "search", status: 200 }],
        },
      },
      0
    );
    expect(vm.grade).toBe("warn");
    expect(vm.status).toBe("warn");
    expect(vm.playbooks[0].id).toBe("relax_filter");
  });

  it("counts hop >=400 as errors", () => {
    const vm = normalizeTurnEntry(
      {
        question: "q",
        trace: { hops: [{ req_id: "r", verb: "search", status: 500, ms: 12 }] },
      },
      0
    );
    expect(vm.errCount).toBe(1);
    expect(vm.status).toBe("warn");
  });
});
