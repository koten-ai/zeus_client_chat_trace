/**
 * Turn-entry normalizer for Zeus Tracer v1.
 * Accepts legacy `{ question, trace }` cards and 2.3.0 `TurnResult.debug`
 * / `trace_payload` bags. G2 keys never enter the view-model chrome.
 */
import * as helpers from "./helpers.js";

const G2_KEYS = ["wish_i_knew", "jail_break_attempt", "hooks_jailbreak_score"];

const GATHER_KEYS = [
  "chat_id",
  "turn_id",
  "session_id",
  "req_ids",
  "zeus_url",
  "client_version",
  "target",
  "catalog",
  "contract_status",
  "tokens",
  "export_ref",
  "stamp",
];

function stripG2(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripG2);
  const out = {};
  Object.keys(value).forEach((k) => {
    if (G2_KEYS.includes(k)) return;
    out[k] = stripG2(value[k]);
  });
  return out;
}

function sanitizeLayerA(layerA) {
  if (!layerA || typeof layerA !== "object" || Array.isArray(layerA)) return layerA;
  const out = { ...layerA };
  G2_KEYS.forEach((k) => {
    delete out[k];
  });
  // V2.2+: object {id: bool} only. Arrays fail closed.
  if (Array.isArray(out.business_rules_triggers)) {
    delete out.business_rules_triggers;
  }
  return out;
}

function mergeDebug(debug) {
  if (!debug || typeof debug !== "object") return {};
  const pt = { ...(debug.public_trace && typeof debug.public_trace === "object" ? debug.public_trace : {}) };
  if (debug.detective != null) pt.detective = debug.detective;
  if (debug.preferred_req_id) {
    pt.preferred_req_id = debug.preferred_req_id;
    const sess = pt.session && typeof pt.session === "object" ? { ...pt.session } : {};
    sess.preferred_req_id = debug.preferred_req_id;
    pt.session = sess;
  }
  if (debug.hops != null && !pt.hops) {
    try {
      pt.hops = Array.from(debug.hops);
    } catch {
      pt.hops = debug.hops;
    }
  }
  if (debug.notes != null && !pt.notes) {
    try {
      pt.notes = Array.from(debug.notes);
    } catch {
      pt.notes = debug.notes;
    }
  }
  GATHER_KEYS.forEach((k) => {
    if (debug[k] != null && pt[k] == null) pt[k] = debug[k];
  });
  if (debug.rounds != null && pt.rounds == null) pt.rounds = debug.rounds;
  return pt;
}

export function coerceTraceEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  let entry = raw;
  if (!entry.trace && entry.debug) {
    entry = { ...entry, trace: mergeDebug(entry.debug) };
  }
  if (!entry.trace || typeof entry.trace !== "object") return null;
  const t = stripG2({ ...entry.trace });
  if (t.layer_a) t.layer_a = sanitizeLayerA(t.layer_a);
  if (entry.layer_a) entry = { ...entry, layer_a: sanitizeLayerA(entry.layer_a) };
  if (t.question == null && entry.question) {
    /* keep question on the card, not inside trace */
  }
  return { ...entry, trace: t };
}

export function detectiveGrade(d) {
  if (!d || typeof d !== "object") return "";
  const diag = d.diagnosis && typeof d.diagnosis === "object" ? d.diagnosis : d;
  const g = String(
    diag.grade || d.diagnosis_grade || diag.status || d.grade || ""
  ).toLowerCase();
  if (["fail", "error", "err", "failed"].includes(g)) return "fail";
  if (["warn", "warning"].includes(g)) return "warn";
  if (["pass", "ok", "healthy", "clear"].includes(g)) return "pass";
  const pbs = d.playbooks || diag.playbooks || [];
  if (Array.isArray(pbs) && pbs.length) return "warn";
  return "pass";
}

export function promptGrade(d) {
  if (!d || typeof d !== "object") return "";
  const p = d.prompt || d.prompt_check || {};
  return String(
    d.prompt_grade || p.grade || (p.ok === false ? "warn" : p.ok ? "pass" : "")
  ).toLowerCase();
}

export function detectiveHeadline(d) {
  if (!d) return "";
  const diag = d.diagnosis && typeof d.diagnosis === "object" ? d.diagnosis : d;
  const raw =
    diag.headline || d.headline || diag.summary || d.summary || diag.title || "";
  if (helpers.asDisplayText) return helpers.asDisplayText(raw);
  return typeof raw === "string" ? raw : "";
}

export function detectiveOverview(d) {
  if (helpers.formatDetectiveOverview) return helpers.formatDetectiveOverview(d) || "";
  if (!d) return "";
  const diag = d.diagnosis && typeof d.diagnosis === "object" ? d.diagnosis : d;
  const raw = diag.overview || d.overview || diag.detail || d.detail || "";
  return typeof raw === "string" ? raw : "";
}

export function detectivePlaybooks(d) {
  if (!d) return [];
  const diag = d.diagnosis && typeof d.diagnosis === "object" ? d.diagnosis : d;
  const pbs = d.playbooks || diag.playbooks || [];
  if (!Array.isArray(pbs)) return [];
  return pbs.map((p, i) => {
    if (typeof p === "string") return { id: p, title: p, body: p, tip: p };
    return {
      id: p.id || p.name || "pb_" + (i + 1),
      title: p.title || p.name || p.id || "Playbook",
      body: p.body || p.tip || p.message || p.description || "",
      tip: p.tip || p.body || "",
    };
  });
}

function hopRequest(h, step) {
  if (h && h.req != null) return h.req;
  if (h && h.request != null) return h.request;
  if (h && h.args != null) return h.args;
  if (step && step.args != null) return step.args;
  if (step && step.pipeline_json != null) return step.pipeline_json;
  return {};
}

function hopResponse(h, step) {
  if (h && h.res != null) return h.res;
  if (h && h.response != null) return h.response;
  if (h && h.result_json != null) return h.result_json;
  if (h && h.result != null) return h.result;
  if (h && h.body != null) return h.body;
  if (step) {
    const parsed = helpers.tryParseJSON(step.result_full || step.result);
    if (parsed) return parsed;
    if (step.result != null) return { preview: String(step.result).slice(0, 2000) };
  }
  if (h && h.snippet) {
    const parsed = helpers.tryParseJSON(h.snippet);
    if (parsed) return parsed;
  }
  return {};
}

function hopBytesOf(h, step, res) {
  if (helpers.resolveHopBytes) return helpers.resolveHopBytes(h, step, res);
  if (h && h.bytes != null) return h.bytes;
  if (h && h.byte_size != null) return h.byte_size;
  if (step && step.bytes != null) return step.bytes;
  return null;
}

export function normalizeHops(t, steps, preferred) {
  const toolSteps = (steps || []).filter((s) => s && s.type === "tool");
  if (Array.isArray(t.hops) && t.hops.length) {
    return t.hops.map((h, i) => {
      const step = helpers.matchingToolStep ? helpers.matchingToolStep(toolSteps, h, i) : null;
      const req = hopRequest(h, step);
      const res = hopResponse(h, step);
      return {
        req_id: h.req_id || h.id || "",
        verb: h.verb || h.name || h.tool || "?",
        status: h.status != null ? h.status : h.http_status != null ? h.http_status : 0,
        ms: h.ms != null ? h.ms : h.duration_ms != null ? h.duration_ms : 0,
        bytes: hopBytesOf(h, step, res),
        preferred: !!(h.preferred || (preferred && (h.req_id === preferred || h.id === preferred))),
        req,
        res,
        snippet: h.snippet || "",
        step_costs: Array.isArray(h.step_costs) ? h.step_costs : null,
        body: h.body != null ? h.body : null,
        url: h.url || "",
        error: h.error || "",
        path_class: h.path_class || h.name || h.verb || "",
      };
    });
  }
  return toolSteps.map((s) => {
    const parsed = helpers.tryParseJSON(s.result_full || s.result);
    const res =
      parsed || (s.result != null ? { preview: String(s.result).slice(0, 2000) } : {});
    return {
      req_id: s.req_id || "",
      verb: s.name || "?",
      status: s.status != null ? s.status : 0,
      ms: s.ms || 0,
      bytes: hopBytesOf(s, null, res),
      preferred: !!(preferred && s.req_id === preferred),
      req: s.args || s.pipeline_json || {},
      res,
    };
  });
}

export function normalizeLlmRounds(t, steps) {
  const reqs = t.ai_requests || [];
  const resps = t.ai_responses || [];
  const n = Math.max(reqs.length, resps.length);
  if (n) {
    return Array.from({ length: n }, (_, i) => ({
      round: i + 1,
      call: i + 1,
      kind: "llm",
      label: "Round " + (i + 1),
      finish: (resps[i] && (resps[i].finish_reason || resps[i].finish)) || "",
      tok_in:
        (reqs[i] && reqs[i].usage && reqs[i].usage.prompt_tokens) ||
        (resps[i] && resps[i].usage && resps[i].usage.prompt_tokens),
      tok_out: resps[i] && resps[i].usage && resps[i].usage.completion_tokens,
      tok_total:
        (resps[i] && resps[i].usage && resps[i].usage.total_tokens) ||
        (reqs[i] && reqs[i].usage && reqs[i].usage.total_tokens),
      req: reqs[i] || {},
      res: resps[i] || {},
    }));
  }
  return (steps || [])
    .filter(
      (s) => s && (s.type === "llm" || s.type === "llm_error" || s.type === "force_final")
    )
    .map((s, i) => {
      const kind = s.type || "llm";
      const isFinal = kind === "force_final";
      const isErr = kind === "llm_error";
      const round = s.round != null ? s.round : i + 1;
      return {
        round,
        call: i + 1,
        kind,
        label: isFinal ? "force_final" : "Round " + round,
        finish: isFinal
          ? s.cause || s.finish_reason || "force_final"
          : s.finish_reason || (isErr ? "error" : ""),
        tok_in: s.usage && s.usage.prompt_tokens,
        tok_out: s.usage && s.usage.completion_tokens,
        tok_total: s.usage && s.usage.total_tokens,
        req: isFinal
          ? { type: "force_final", cause: s.cause, content_len: s.content_len, ms: s.ms, model: s.model }
          : { tool_calls: s.tool_calls, ms: s.ms, model: s.model },
        res: isErr
          ? { error: s.detail }
          : isFinal
            ? {
                type: "force_final",
                cause: s.cause,
                content_len: s.content_len,
                finish_reason: s.finish_reason,
                usage: s.usage,
              }
            : {
                tool_calls: s.tool_calls,
                finish_reason: s.finish_reason,
                usage: s.usage,
              },
      };
    });
}

export function entryKey(entry, index) {
  if (entry && entry.created != null) return "c:" + entry.created + ":" + index;
  if (entry && entry.trace && entry.trace.turn_id) return "t:" + entry.trace.turn_id;
  return "i:" + index;
}

function enrichTokenMetrics(t, metrics) {
  const m = { ...metrics };
  const tok = t.tokens && typeof t.tokens === "object" ? t.tokens : null;
  if (tok) {
    m.tokensIn = Number(tok.prompt) || 0;
    m.tokensOut = Number(tok.completion) || 0;
    m.tokensCached = Number(tok.cached) || 0;
    m.hasIn = tok.prompt != null;
    m.hasOut = tok.completion != null;
    m.hasTokens = !!(tok.ok || tok.total != null || tok.prompt != null || tok.completion != null);
    if (tok.total != null) m.tokens = Number(tok.total) || m.tokens;
  } else {
    let tin = 0;
    let tout = 0;
    let hasIn = false;
    let hasOut = false;
    (t.steps || []).forEach((s) => {
      const u = s && s.usage;
      if (!u) return;
      if (u.prompt_tokens != null) {
        tin += Number(u.prompt_tokens) || 0;
        hasIn = true;
      }
      if (u.completion_tokens != null) {
        tout += Number(u.completion_tokens) || 0;
        hasOut = true;
      }
    });
    m.tokensIn = tin;
    m.tokensOut = tout;
    m.tokensCached = 0;
    m.hasIn = hasIn;
    m.hasOut = hasOut;
    m.hasTokens = m.tokens > 0 || hasIn || hasOut;
  }
  return m;
}

function semanticCacheNotes(t) {
  const notes = Array.isArray(t.notes) ? t.notes : [];
  return notes.map(String).filter((n) => n.startsWith("semantic_cache."));
}

export function normalizeTurnEntry(raw, index) {
  const entry = coerceTraceEntry(raw) || raw || {};
  const t = entry.trace || {};
  const rawSteps = Array.isArray(t.steps) ? t.steps : [];
  const sess = t.session && typeof t.session === "object" ? t.session : {};
  const sessionId = entry.session_id || t.session_id || sess.id || sess.session_id || "";
  const preferred =
    t.preferred_req_id || sess.preferred_req_id || entry.preferred_req_id || "";
  const detective = t.detective && typeof t.detective === "object" ? t.detective : null;
  const baseMetrics = helpers.traceMetrics(t) || {
    total: 0,
    aiMs: 0,
    zeusMs: 0,
    other: 0,
    tokens: 0,
    bytes: 0,
  };
  const metrics = enrichTokenMetrics(t, baseMetrics);
  const hops = normalizeHops(t, rawSteps, preferred);
  const costHops = Array.isArray(t.hops) && t.hops.length ? t.hops : hops;
  const steps = helpers.attachPipelineCostsToSteps
    ? helpers.attachPipelineCostsToSteps(rawSteps, costHops)
    : rawSteps;
  const hopFails = hops.filter((h) => (Number(h.status) || 0) >= 400).length;
  const grade = detectiveGrade(detective);
  const promptChecks = helpers.detectivePromptChecks
    ? helpers.detectivePromptChecks(detective)
    : [];
  let status = "ok";
  if (entry.session_error || grade === "fail") status = "err";
  else if (hopFails || grade === "warn") status = "warn";
  if (entry.session_error) status = "err";

  const catalog = t.catalog && typeof t.catalog === "object" ? t.catalog : {};
  const inject = t.inject && typeof t.inject === "object" ? t.inject : {};
  const stamp = t.stamp && typeof t.stamp === "object" ? t.stamp : {};

  return {
    key: entryKey(entry, index),
    index,
    question: entry.question || t.question || "(loaded turn)",
    answer: entry.answer || t.answer || "",
    status,
    api_version: entry.api_version || t.api_version || "v2",
    mode: entry.mode || (catalog && catalog.source) || (t.target && t.target.mode) || "",
    target:
      typeof entry.target === "string"
        ? entry.target
        : t.target && typeof t.target === "object"
          ? [t.target.bucket, t.target.scope, t.target.collection].filter(Boolean).join("/")
          : typeof t.target === "string"
            ? t.target
            : "",
    provider: entry.provider || "",
    model: entry.model || "",
    session_id: sessionId,
    session_round:
      entry.session_round != null
        ? entry.session_round
        : sess.round != null
          ? sess.round
          : null,
    contract_status: entry.contract_status || sess.contract_status || t.contract_status || "",
    preferred_req_id: preferred,
    turn_id: t.turn_id || sess.turn_id || "",
    metrics,
    spans: helpers.synthesizeTraceSpans
      ? helpers.synthesizeTraceSpans(t, hops, steps)
      : Array.isArray(t.spans)
        ? t.spans
        : [],
    steps,
    hops,
    llmRounds: normalizeLlmRounds(t, steps),
    detective,
    grade,
    prompt_grade: promptGrade(detective),
    headline: detectiveHeadline(detective),
    overview: detectiveOverview(detective),
    playbooks: detectivePlaybooks(detective),
    promptChecks,
    checkSummary: helpers.detectiveCheckSummary
      ? helpers.detectiveCheckSummary(promptChecks)
      : { passed: 0, total: 0, label: "", tone: "" },
    gather: helpers.extractGather ? helpers.extractGather(t, entry) : [],
    toolsCount: hops.length,
    errCount: hopFails,
    session_error: entry.session_error || sess.error || t.session_error || "",
    catalog,
    inject,
    stamp,
    semanticCache: semanticCacheNotes(t),
    layer_a: t.layer_a || entry.layer_a || null,
    raw: entry,
    trace: t,
  };
}
