/**
 * Shared Turn-trace helpers (ported from zeus_client/static/trace_helpers.js).
 */
import { loadJsnview } from "./jsnview-loader.js";


  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  /** Scalars only — objects must not leak as String(obj) → "[object Object]". */
  function asDisplayText(x) {
    if (x == null || x === "") return "";
    const t = typeof x;
    if (t === "string") return x;
    if (t === "number" && isFinite(x)) return String(x);
    if (t === "boolean") return x ? "true" : "false";
    return "";
  }

  function formatOverviewObject(ov) {
    if (!ov || typeof ov !== "object" || Array.isArray(ov)) return "";
    const bits = [];
    if (ov.hop_count != null && ov.hop_count !== "") {
      const n = Number(ov.hop_count);
      if (isFinite(n)) bits.push(n + " hop" + (n === 1 ? "" : "s"));
    }
    if (ov.rounds != null && ov.rounds !== "") {
      const n = Number(ov.rounds);
      if (isFinite(n)) bits.push(n + " round" + (n === 1 ? "" : "s"));
    }
    if (ov.total_ms != null && ov.total_ms !== "") bits.push(fmtMs(ov.total_ms));
    const tok = tokenTotal(ov.tokens);
    if (tok > 0) bits.push("tokens " + tok.toLocaleString());
    return bits.join(" · ");
  }

  function formatDetectiveOverview(d) {
    if (!d) return "";
    const diag = d.diagnosis && typeof d.diagnosis === "object" ? d.diagnosis : d;
    const raw = diag.overview || d.overview || diag.detail || d.detail || "";
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object") return formatOverviewObject(raw);
    return asDisplayText(raw);
  }

  function checkItemOk(c) {
    if (!c || typeof c !== "object") return true;
    const st = String(c.status || "").toLowerCase();
    if (st) {
      if (["fail", "error", "err", "failed", "warn", "warning"].includes(st)) {
        return false;
      }
      if (["pass", "ok", "healthy", "clear"].includes(st)) return true;
    }
    if (c.ok === false || c.pass === false) return false;
    return true;
  }

  function normalizePromptCheck(c) {
    if (typeof c === "string") return { ok: true, lab: c, status: "pass" };
    const status = asDisplayText(c && c.status).toLowerCase();
    return {
      ok: checkItemOk(c),
      lab: asDisplayText((c && (c.lab || c.label || c.name)) || "?") || "?",
      status: status,
    };
  }

  function detectivePromptChecks(d) {
    if (!d) return [];
    const p = d.prompt || d.prompt_check || d.checklist;
    if (Array.isArray(p)) return p.map(normalizePromptCheck);
    if (p && Array.isArray(p.items)) return p.items.map(normalizePromptCheck);
    return [];
  }

  function detectiveCheckSummary(checks) {
    const list = Array.isArray(checks) ? checks : [];
    const total = list.length;
    const passed = list.filter((c) => c && c.ok).length;
    if (!total) return { passed: 0, total: 0, label: "", tone: "" };
    const allOk = passed === total;
    return {
      passed: passed,
      total: total,
      label: passed + "/" + total + (allOk ? " PASSED" : " FAILED"),
      tone: allOk ? "ok" : "err",
    };
  }

  function fmtMs(ms) {
    const n = Number(ms) || 0;
    return n >= 1000 ? (n / 1000).toFixed(2) + "s" : n + "ms";
  }

  function fmtBytes(b) {
    const n = Number(b) || 0;
    if (n < 1024) return n + "B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + "kB";
    return (n / (1024 * 1024)).toFixed(1) + "MB";
  }

  /** Hop/step keys that mean payload size. Never `result_size` (row count). */
  const HOP_BYTE_KEYS = [
    "bytes",
    "byte_size",
    "result_bytes",
    "content_length",
    "contentLength",
    "body_bytes",
    "size_bytes",
  ];

  const HOP_PAYLOAD_KEYS = [
    "result_json",
    "result_full",
    "res",
    "response",
    "result",
    "body",
    "snippet",
    "result_text",
  ];

  function coerceByteValue(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) && v >= 0 ? v : null;
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (!trimmed) return null;
      if (/[a-zA-Z]/.test(trimmed)) return trimmed;
      const n = Number(trimmed);
      return isFinite(n) && n >= 0 ? n : null;
    }
    return null;
  }

  function hopByteField(obj) {
    if (!obj || typeof obj !== "object") return null;
    for (let i = 0; i < HOP_BYTE_KEYS.length; i++) {
      const v = coerceByteValue(obj[HOP_BYTE_KEYS[i]]);
      if (v != null) return v;
    }
    return null;
  }

  function utf8ByteLength(s) {
    if (s == null || s === "") return 0;
    const str = String(s);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str).length;
    let n = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) {
        n += 4;
        i++;
      } else n += 3;
    }
    return n;
  }

  function isEmptyPayload(payload) {
    if (payload == null || payload === "") return true;
    if (typeof payload === "string") {
      const t = payload.trim();
      return !t || t === "{}" || t === "[]";
    }
    if (typeof payload !== "object") return false;
    if (Array.isArray(payload)) return payload.length === 0;
    return Object.keys(payload).length === 0;
  }

  function hopPayload(obj) {
    if (!obj || typeof obj !== "object") return null;
    for (let i = 0; i < HOP_PAYLOAD_KEYS.length; i++) {
      const v = obj[HOP_PAYLOAD_KEYS[i]];
      if (v != null && v !== "" && !isEmptyPayload(v)) return v;
    }
    return null;
  }

  function estimatePayloadBytes(payload) {
    if (isEmptyPayload(payload)) return null;
    if (typeof payload === "string") {
      const n = utf8ByteLength(payload);
      return n > 0 ? n : null;
    }
    if (typeof payload === "object") {
      try {
        const s = JSON.stringify(payload);
        if (!s || s === "{}" || s === "[]") return null;
        const n = utf8ByteLength(s);
        return n > 0 ? n : null;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function matchingToolStep(steps, hop, hopIndex) {
    const list = (steps || []).filter(
      (s) => s && typeof s === "object" && (s.type == null || s.type === "tool")
    );
    if (!list.length || !hop || typeof hop !== "object") return null;
    const rid = hop.req_id || hop.id;
    if (rid) {
      const byId = list.find((s) => String(s.req_id || "") === String(rid));
      if (byId) return byId;
    }
    const verb = hop.verb || hop.name || hop.tool;
    if (verb) {
      const named = list.find((s) => (s.name || s.verb || s.tool) === verb);
      if (named) return named;
    }
    if (hopIndex != null && hopIndex >= 0 && hopIndex < list.length) return list[hopIndex];
    return null;
  }

  /**
   * Resolve Hops-tab Bytes. Prefer explicit size fields, then a matching
   * tool step, then UTF-8 of result_json / res / snippet. `result_size` is
   * a row count and must not be used.
   */
  function resolveHopBytes(hop, step, mappedRes) {
    const direct = hopByteField(hop);
    if (direct != null) return direct;
    const fromStep = hopByteField(step);
    if (fromStep != null) return fromStep;
    const est =
      estimatePayloadBytes(hopPayload(hop)) ??
      estimatePayloadBytes(mappedRes) ??
      estimatePayloadBytes(hopPayload(step));
    return est != null ? est : null;
  }

  function shortId(s, n) {
    n = n == null ? 10 : n;
    if (!s) return "";
    const str = String(s);
    return str.length > n ? str.slice(0, n) + "…" : str;
  }

  function prettyJSON(x) {
    try {
      const out = JSON.stringify(x === undefined ? null : x, null, 2);
      return out == null ? "null" : out;
    } catch (e) {
      return String(x);
    }
  }

  /**
   * Copy text from a Shadow DOM click. `clipboard.writeText` is async and
   * often rejects (no secure context, lost user activation). Run
   * execCommand on a light-DOM textarea **during the click**, then also
   * try the Clipboard API. Never throw.
   */
  function execCommandCopy(text) {
    const s = String(text == null ? "" : text);
    if (!s) return false;
    const mount = document.body || document.documentElement;
    if (!mount) return false;
    const ta = document.createElement("textarea");
    ta.value = s;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.tabIndex = -1;
    ta.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;";
    mount.appendChild(ta);
    const prev = typeof document.activeElement !== "undefined" ? document.activeElement : null;
    let ok = false;
    try {
      ta.focus();
      ta.select();
      try {
        ta.setSelectionRange(0, s.length);
      } catch (e) {
        /* ignore */
      }
      ok = typeof document.execCommand === "function" && !!document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    try {
      ta.remove();
    } catch (e) {
      /* ignore */
    }
    try {
      if (prev && typeof prev.focus === "function") prev.focus();
    } catch (e) {
      /* ignore */
    }
    return ok;
  }

  function copyToClipboard(text) {
    const s = String(text == null ? "" : text);
    if (!s) return Promise.resolve(false);
    // Sync copy first so we still have the user gesture if writeText rejects.
    const syncOk = execCommandCopy(s);
    try {
      const clip = typeof navigator !== "undefined" ? navigator.clipboard : null;
      if (clip && typeof clip.writeText === "function") {
        return Promise.resolve(clip.writeText(s)).then(
          () => true,
          () => syncOk
        );
      }
    } catch (e) {
      /* ignore */
    }
    return Promise.resolve(syncOk);
  }

  function tryParseJSON(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * Coerce provider/Hub token fields to a single total count.
   * Accepts a bare number, OpenAI usage ({total_tokens|prompt_tokens…}),
   * or Hub rollup ({total|prompt|completion…}). Objects must not leak into
   * the UI (String(obj) → "[object Object]").
   */
  function tokenTotal(tok) {
    if (tok == null || tok === "") return 0;
    if (typeof tok === "number") return isFinite(tok) ? tok : 0;
    if (typeof tok === "string") {
      const n = Number(tok);
      return isFinite(n) ? n : 0;
    }
    if (typeof tok !== "object") return 0;
    const direct = tok.total != null ? tok.total : tok.total_tokens;
    if (direct != null && direct !== "") {
      const n = Number(direct);
      if (isFinite(n) && n > 0) return n;
    }
    const prompt = Number(tok.prompt != null ? tok.prompt : tok.prompt_tokens) || 0;
    const completion =
      Number(tok.completion != null ? tok.completion : tok.completion_tokens) || 0;
    if (prompt || completion) return prompt + completion;
    const n = Number(direct);
    return isFinite(n) ? n : 0;
  }

  function fmtTokens(n) {
    const x = tokenTotal(n);
    return x > 0 ? x.toLocaleString() : "?";
  }

  function traceMetrics(t) {
    t = t || {};
    let aiMs = 0,
      zeusMs = 0,
      tokens = 0,
      bytes = 0;
    (t.steps || []).forEach((s) => {
      if (s.type === "llm" || s.type === "llm_error") aiMs += s.ms || 0;
      if (s.type === "tool") {
        zeusMs += s.ms || 0;
        bytes += s.bytes || 0;
      }
      if (s.usage) tokens += tokenTotal(s.usage);
    });
    // Prefer explicit rollups when present
    if (t.ai_ms != null) aiMs = t.ai_ms;
    if (t.zeus_ms != null || t.tool_ms != null) zeusMs = t.zeus_ms != null ? t.zeus_ms : t.tool_ms;
    // trace.tokens is Hub-shaped {prompt,completion,total,…} after attach_trace_tokens
    if (t.tokens != null) tokens = tokenTotal(t.tokens);
    const total = t.total_ms || traceWallMs(t) || aiMs + zeusMs;
    const other = Math.max(0, total - aiMs - zeusMs);
    return { total, aiMs, zeusMs, other, tokens, bytes };
  }

  function pipelineSpansFromStep(at, ms, step) {
    let costs = step && step.pipeline_step_costs;
    let meta = {};
    if (!costs || !costs.length) {
      const raw = (step && (step.result_full || step.result)) || "";
      try {
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        meta = (data && data.meta) || {};
        costs = meta.step_costs;
      } catch (e) {
        costs = null;
      }
    }
    if (!Array.isArray(costs) || !costs.length) return null;

    const verbs = {};
    const plan =
      (step && step.args && step.args.steps) ||
      (step && step.pipeline_json && step.pipeline_json.steps) ||
      [];
    plan.forEach((s) => {
      if (s && (s.name || s.as)) verbs[s.name || s.as] = s.verb || "";
    });

    const spans = [];
    let offset = 0;
    costs.forEach((sc) => {
      const stepName = sc.as || sc.name || "step";
      const verb = verbs[stepName] || "";
      const stepMs = sc.ms || 0;
      let label = "pipeline." + stepName;
      if (verb) label += "." + verb;
      const detailBits = [];
      if (sc.cost != null) detailBits.push("cost " + sc.cost);
      if (sc.result_size != null) detailBits.push(sc.result_size + " rows");
      if (sc.status) detailBits.push(sc.status);
      spans.push({
        name: label,
        cls: "tool",
        at: (at || 0) + offset,
        ms: stepMs,
        detail: detailBits.join(" · ") || null,
        pipeline: true,
      });
      offset += stepMs;
    });
    const overhead = (ms || 0) - offset;
    if (overhead > 0) {
      spans.push({
        name: "pipeline.overhead",
        cls: "tool",
        at: (at || 0) + offset,
        ms: overhead,
        detail: "HTTP / orchestration",
        pipeline: true,
      });
    }
    return spans;
  }

  function expandTraceSpans(spans, steps) {
    const pipelineTools = (steps || []).filter(
      (s) => s.type === "tool" && s.name === "pipeline"
    );
    let pipeIdx = 0;
    const out = [];
    (spans || []).forEach((sp) => {
      if (sp.name !== "tool.pipeline") {
        out.push(sp);
        return;
      }
      const expanded = pipelineSpansFromStep(sp.at, sp.ms, pipelineTools[pipeIdx++]);
      if (expanded) out.push(...expanded);
      else out.push(sp);
    });
    return out;
  }

  function parseJsonArraySlice(s, start) {
    if (!s || start < 0 || start >= s.length || s[start] !== "[") return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === "\"") inStr = false;
        continue;
      }
      if (ch === "\"") {
        inStr = true;
        continue;
      }
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(s.slice(start, i + 1));
            return Array.isArray(parsed) ? parsed : null;
          } catch (e) {
            return null;
          }
        }
      }
    }
    return null;
  }

  /** Pull Zeus meta.step_costs from a hop body, even when the 500-char snippet is truncated. */
  function extractStepCosts(raw) {
    if (raw == null || raw === "") return null;
    if (Array.isArray(raw)) return raw.length ? raw : null;
    if (typeof raw === "object") {
      if (Array.isArray(raw.step_costs) && raw.step_costs.length) return raw.step_costs;
      const meta = raw.meta || (raw.data && raw.data.meta) || {};
      if (Array.isArray(meta.step_costs) && meta.step_costs.length) return meta.step_costs;
      const nested = raw.data && typeof raw.data === "object" ? extractStepCosts(raw.data) : null;
      if (nested) return nested;
      return null;
    }
    const s = String(raw);
    try {
      return extractStepCosts(JSON.parse(s));
    } catch (e) {
      /* truncated hop snippet — scan for the array */
    }
    const key = s.search(/"step_costs"\s*:/);
    if (key < 0) return null;
    const start = s.indexOf("[", key);
    return parseJsonArraySlice(s, start);
  }

  function hopVerb(h) {
    return (h && (h.verb || h.name || h.tool)) || "hop";
  }

  function attachPipelineCostsToSteps(steps, hops) {
    const list = (steps || []).map((s) =>
      s && typeof s === "object" ? Object.assign({}, s) : s
    );
    const byReq = {};
    const pipeHops = [];
    (hops || []).forEach((h) => {
      if (!h || typeof h !== "object") return;
      if (h.req_id) byReq[String(h.req_id)] = h;
      if (hopVerb(h) === "pipeline") pipeHops.push(h);
    });
    let pipeIdx = 0;
    list.forEach((s) => {
      if (!s || s.type !== "tool" || s.name !== "pipeline") return;
      if (Array.isArray(s.pipeline_step_costs) && s.pipeline_step_costs.length) return;
      const hop = (s.req_id && byReq[String(s.req_id)]) || pipeHops[pipeIdx] || null;
      if (hopVerb(s) === "pipeline") pipeIdx++;
      const costs =
        extractStepCosts(s.pipeline_step_costs) ||
        extractStepCosts(s.result_full || s.result) ||
        (hop &&
          (extractStepCosts(hop.step_costs) ||
            extractStepCosts(hop.snippet) ||
            extractStepCosts(hop.res) ||
            extractStepCosts(hop.body)));
      if (costs && costs.length) s.pipeline_step_costs = costs;
    });
    return list;
  }

  function spanMs(x) {
    const n = Number(x);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function traceWallMs(trace) {
    const t = trace || {};
    const direct = spanMs(t.total_ms);
    if (direct) return direct;
    const d = t.detective && typeof t.detective === "object" ? t.detective : {};
    const ov = d.overview && typeof d.overview === "object" ? d.overview : {};
    const fromOv = spanMs(ov.total_ms);
    if (fromOv) return fromOv;
    const slow = d.diagnosis && d.diagnosis.slow;
    return spanMs(slow && slow.total_ms);
  }

  function zeusMsFrom(hops, steps) {
    let z = 0;
    (hops || []).forEach((h) => {
      if (!h || typeof h !== "object") return;
      z += spanMs(h.ms != null ? h.ms : h.duration_ms);
    });
    if (z) return z;
    (steps || []).forEach((s) => {
      if (s && s.type === "tool") z += spanMs(s.ms);
    });
    return z;
  }

  function shiftSpans(spans, delta) {
    const d = Number(delta) || 0;
    if (!d) return spans || [];
    return (spans || []).map((s) =>
      s && typeof s === "object" ? Object.assign({}, s, { at: (s.at || 0) + d }) : s
    );
  }

  function isLlmStep(s) {
    return (
      s &&
      (s.type === "llm" || s.type === "llm_error" || s.type === "force_final")
    );
  }

  function llmSpansFromSteps(steps) {
    const spans = [];
    let at = 0;
    (steps || []).forEach((s) => {
      if (!isLlmStep(s)) return;
      const ms = spanMs(s.ms);
      if (!ms) return;
      const name =
        s.type === "force_final"
          ? "llm.force_final"
          : "ai.chat.round." + (s.round != null ? s.round : spans.length + 1);
      spans.push({ name: name, cls: "ai", at: at, ms: ms });
      at += ms;
    });
    return spans;
  }

  function spansFromSteps(steps) {
    const spans = [];
    let at = 0;
    (steps || []).forEach((s) => {
      if (!s || typeof s !== "object") return;
      if (s.type !== "tool") return;
      const verb = s.name || "tool";
      const ms = spanMs(s.ms);
      if (!ms && verb !== "pipeline") return;
      const name = verb === "pipeline" ? "tool.pipeline" : "tool." + verb;
      spans.push({ name: name, cls: "tool", at: at, ms: ms });
      at += ms;
    });
    return spans;
  }

  function spansFromHops(hops) {
    const spans = [];
    let at = 0;
    (hops || []).forEach((h) => {
      if (!h || typeof h !== "object") return;
      const verb = hopVerb(h);
      const ms = spanMs(h.ms != null ? h.ms : h.duration_ms);
      const name = verb === "pipeline" ? "tool.pipeline" : "tool." + verb;
      spans.push({ name: name, cls: "tool", at: at, ms: ms });
      at += ms;
    });
    return spans;
  }

  /**
   * V2 public_trace omits spans. Prefer Hub Gantt: ai.chat.round.N on the
   * turn wall clock, then Zeus/pipeline bars as slivers at the end.
   * Wall comes from trace.total_ms or detective.overview.total_ms.
   */
  function synthesizeTraceSpans(trace, hops, steps) {
    const existing = trace && Array.isArray(trace.spans) ? trace.spans : [];
    if (existing.length) return existing;
    const tools = (() => {
      const fromSteps = spansFromSteps(steps);
      return fromSteps.length ? fromSteps : spansFromHops(hops);
    })();
    const timedLlm = llmSpansFromSteps(steps);
    if (timedLlm.length) {
      const aiEnd = timedLlm.reduce(
        (a, s) => Math.max(a, (s.at || 0) + (s.ms || 0)),
        0
      );
      return timedLlm.concat(shiftSpans(tools, aiEnd));
    }
    const wall = traceWallMs(trace);
    const zeus = zeusMsFrom(hops, steps);
    const aiBudget = wall > zeus ? wall - zeus : 0;
    const hasLlm = (steps || []).some(isLlmStep);
    if (aiBudget > 0 && (hasLlm || wall >= 500)) {
      return [
        { name: "ai.chat.round.1", cls: "ai", at: 0, ms: aiBudget },
      ].concat(shiftSpans(tools, aiBudget));
    }
    return tools;
  }

  function waterfallHTML(spans, totalMs, steps) {
    const rows = expandTraceSpans(spans, steps);
    if (!rows.length) return "";
    const spanEnd = rows.reduce((a, s) => Math.max(a, (s.at || 0) + (s.ms || 0)), 0);
    const sum = Math.max(Number(totalMs) || 0, spanEnd) || 1;
    let html = '<div class="trace-waterfall">';
    rows.forEach((s) => {
      const left = Math.max(0, Math.min(100, ((s.at || 0) / sum) * 100));
      const w = Math.max(0.5, Math.min(100 - left, ((s.ms || 0) / sum) * 100));
      const labCls = s.pipeline ? "tw-lab tw-lab-pipeline" : "tw-lab";
      const dur =
        (s.ms || 0) +
        " ms" +
        (s.detail
          ? ' <span class="tw-detail">· ' + escapeHtml(s.detail) + "</span>"
          : "");
      html +=
        '<div class="' +
        labCls +
        '" title="' +
        escapeHtml(s.name) +
        '">' +
        escapeHtml(s.name) +
        "</div>" +
        '<div class="tw-track"><i class="' +
        escapeHtml(s.cls || "other") +
        '" style="left:' +
        left.toFixed(2) +
        "%;width:" +
        w.toFixed(2) +
        '%"></i></div>' +
        '<div class="tw-dur">' +
        dur +
        "</div>";
    });
    html +=
      '<div class="tw-legend" style="grid-column:1/-1">' +
      '<span><i class="sw ai"></i>ai · external LLM</span>' +
      '<span><i class="sw tool"></i>tool · zeus / pipeline step</span>' +
      '<span><i class="sw other"></i>other · dispatch / auth / rate / storage</span></div></div>';
    return html;
  }

  function tallyToolCalls(steps) {
    const counts = {},
      errs = {};
    const bump = (name, step) => {
      counts[name] = (counts[name] || 0) + 1;
      const st = step && step.status;
      if (st === 0 || (typeof st === "number" && st >= 400)) {
        errs[name] = (errs[name] || 0) + 1;
      }
    };
    (steps || []).forEach((s) => {
      if (s.type !== "tool") return;
      if (s.name === "pipeline") {
        const plan =
          (s.args && s.args.steps) || (s.pipeline_json && s.pipeline_json.steps) || [];
        const byName = {};
        plan.forEach((p) => {
          if (p && (p.name || p.as)) byName[p.name || p.as] = p;
        });
        let costs = s.pipeline_step_costs;
        if (!costs || !costs.length) {
          try {
            const data = tryParseJSON(s.result_full || s.result || "{}") || {};
            costs = data.meta && data.meta.step_costs;
          } catch (e) {
            costs = null;
          }
        }
        if (costs && costs.length) {
          costs.forEach((sc) => {
            const key = sc.as || sc.name;
            const verb = (byName[key] && byName[key].verb) || key;
            if (verb) bump(verb, s);
          });
        } else {
          plan.forEach((p) => {
            if (p && p.verb) bump(p.verb, s);
          });
        }
        return;
      }
      bump(s.name || "?", s);
    });
    return { counts, errs };
  }

  function toolFrequencyChartHTML(steps, apiVersion, chartOrder) {
    const { counts, errs } = tallyToolCalls(steps);
    const names = Object.keys(counts);
    if (!names.length) return "";

    const order = chartOrder || { v1: [], v2: [] };
    const api =
      String(apiVersion || "v2").toLowerCase() === "v1" ? "v1" : "v2";
    const canon = order[api] || order.v1 || [];
    const canonSet = new Set(canon);
    const slots = canon.slice();
    names.forEach((n) => {
      if (!canonSet.has(n)) slots.push(n);
    });

    let maxN = 0;
    slots.forEach((n) => {
      maxN = Math.max(maxN, counts[n] || 0);
    });
    const BAR_MAX = 78;
    let bars = "",
      labels = "";
    slots.forEach((name) => {
      const n = counts[name] || 0;
      const e = errs[name] || 0;
      const h =
        maxN > 0 && n > 0 ? Math.max(2, Math.round((n / maxN) * BAR_MAX)) : 0;
      const isUnknown = !canonSet.has(name);
      const cls = e > 0 ? "b err" : isUnknown ? "b unknown" : "b";
      const title =
        name +
        " · " +
        n +
        " call" +
        (n === 1 ? "" : "s") +
        (e > 0 ? " (" + e + " error" + (e === 1 ? "" : "s") + ")" : "") +
        (isUnknown ? " · off-catalog" : "");
      bars +=
        '<div class="vbar-col" title="' +
        escapeHtml(title) +
        '">' +
        '<div class="' +
        (n > 0 ? "n" : "n zero") +
        '">' +
        (n > 0 ? n : "") +
        "</div>" +
        '<div class="' +
        cls +
        '" style="height:' +
        h +
        'px"></div></div>';
      labels +=
        '<div class="' +
        (n > 0 ? "l" : "l zero") +
        '" title="' +
        escapeHtml(name) +
        '">' +
        escapeHtml(name) +
        "</div>";
    });

    return (
      '<div class="trace-vbar mt-3">' +
      '<h3 class="trace-vbar-title">Tool-call frequency vs. canonical order</h3>' +
      '<div class="vbar-wrap">' +
      bars +
      "</div>" +
      '<div class="vbar-labels">' +
      labels +
      "</div>" +
      '<div class="trace-vbar-hint">' +
      (api === "v2"
        ? "x-axis = Zeus docs/API/V2 verbs (cheap left → expensive right) · grey = off-catalog"
        : "x-axis = V1 tools from chat history · grey = off-catalog") +
      "</div></div>"
    );
  }

  function jsnviewOptions(open) {
    return {
      showType: true,
      showFoldmarker: true,
      showLen: true,
      collapsed: !open,
      maxDepth: Infinity,
    };
  }

  async function mountJsnviewViewer(host, obj, open) {
    if (!host) return;
    host.innerHTML = "";
    try {
      const Jsnview = await loadJsnview();
      const viewer = new Jsnview(obj, jsnviewOptions(!!open));
      const el = viewer.getElement();
      el.addEventListener(
        "click",
        (e) => {
          const toggle = e.target.closest(".jsv-toggle");
          if (!toggle) return;
          e.stopPropagation();
          const li = toggle.closest("li");
          if (!li) return;
          const content = [...li.children].find((c) =>
            c.classList && c.classList.contains("jsv-content")
          );
          if (!content) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          toggle.classList.toggle("-rotate-90");
          content.classList.toggle("hidden");
        },
        true
      );
      host.appendChild(el);
    } catch {
      const pre = document.createElement("pre");
      pre.className = "trace-pre";
      pre.textContent = prettyJSON(obj);
      host.appendChild(pre);
    }
  }

  function emptyDecompInfo() {
    return {
      decomposition: null,
      query_decomposition: null,
      summary: "",
      confidence: "",
      policy_action: "",
      source: "",
    };
  }

  function isPlainObj(x) {
    return !!x && typeof x === "object" && !Array.isArray(x);
  }

  function isDecompObj(x) {
    return (
      isPlainObj(x) &&
      (Array.isArray(x.targets) || x.predicates != null || x.output != null)
    );
  }

  function isQueryDecompObj(x) {
    return (
      isPlainObj(x) &&
      (x.intent != null ||
        x.entity != null ||
        x.entity_type != null ||
        x.geo != null ||
        x.theme != null ||
        x.audience != null)
    );
  }

  function takeDecompBag(bag, info, source) {
    if (!isPlainObj(bag)) return;
    if (!info.decomposition && isDecompObj(bag.decomposition)) {
      info.decomposition = bag.decomposition;
      if (!info.source) info.source = source;
    }
    if (!info.decomposition && isDecompObj(bag.query_understanding)) {
      info.decomposition = bag.query_understanding;
      if (!info.source) info.source = source;
    }
    if (!info.query_decomposition && isQueryDecompObj(bag.query_decomposition)) {
      info.query_decomposition = bag.query_decomposition;
      if (!info.source) info.source = source;
    }
    if (!info.summary && typeof bag.summary === "string" && bag.summary.trim()) {
      info.summary = bag.summary.trim();
    }
    if (!info.confidence && typeof bag.confidence === "string") {
      info.confidence = bag.confidence;
    }
    if (!info.policy_action && typeof bag.policy_action === "string") {
      info.policy_action = bag.policy_action;
    }
  }

  function parseMaybeJson(x) {
    if (x == null) return null;
    if (typeof x === "string") return tryParseJSON(x);
    if (typeof x === "object") return x;
    return null;
  }

  function walkToolPayloads(obj, visit) {
    if (!obj) return;
    const list = Array.isArray(obj) ? obj : [obj];
    list.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const msg = item.message || (item.choices && item.choices[0] && item.choices[0].message);
      const calls = item.tool_calls || (msg && msg.tool_calls) || [];
      (Array.isArray(calls) ? calls : []).forEach((tc) => {
        const fn = (tc && (tc.function || tc)) || {};
        const args = parseMaybeJson(
          fn.arguments != null ? fn.arguments : tc && tc.arguments
        );
        if (args) visit(args);
      });
      if (item.decomposition || item.query_decomposition) visit(item);
    });
  }

  /**
   * Pull terminate-bag decomposition from layer_a, steps, hops, or LLM tool args.
   * Does not surface G2 (wish_i_knew / jail_break).
   */
  function extractDecomposition(entry) {
    const info = emptyDecompInfo();
    const t = (entry && entry.trace) || {};
    const structured = (entry && entry.structured) || t.structured || {};
    takeDecompBag(t.layer_a, info, "layer_a");
    takeDecompBag(entry && entry.layer_a, info, "layer_a");
    takeDecompBag(t, info, "trace");
    takeDecompBag(structured.artifacts, info, "artifacts");
    takeDecompBag(structured.layer_a, info, "layer_a");

    (t.steps || []).forEach((s) => {
      takeDecompBag(s && s.args, info, "steps");
      takeDecompBag(parseMaybeJson(s && (s.result_full || s.result)), info, "steps");
    });
    (t.hops || (entry && entry.hops) || []).forEach((h) => {
      takeDecompBag(h && (h.req || h.args || h.request), info, "hops");
      takeDecompBag(h && (h.res || h.result || h.body || h.response), info, "hops");
    });
    walkToolPayloads([].concat(t.ai_requests || [], t.ai_responses || []), (bag) =>
      takeDecompBag(bag, info, "llm")
    );
    (entry && entry.llmRounds ? entry.llmRounds : []).forEach((r) => {
      walkToolPayloads(r && r.req, (bag) => takeDecompBag(bag, info, "llm"));
      walkToolPayloads(r && r.res, (bag) => takeDecompBag(bag, info, "llm"));
    });
    return info;
  }

  function decompChip(label, esc) {
    return '<span class="tt-decomp-chip">' + esc(String(label)) + "</span>";
  }

  function decompositionCardHTML(info, escFn) {
    const esc = escFn || escapeHtml;
    info = info || emptyDecompInfo();
    if (!info.decomposition && !info.query_decomposition) {
      return '<div class="tt-decomp empty">No decomposition on this turn.</div>';
    }
    const d = info.decomposition || {};
    const qd = info.query_decomposition || {};
    const targets = Array.isArray(d.targets) ? d.targets : [];
    const preds = d.predicates;
    const output = d.output != null ? String(d.output) : "";

    let badges = "";
    if (info.confidence) {
      badges +=
        '<span class="tt-badge info">confidence:' + esc(info.confidence) + "</span>";
    }
    if (output) {
      badges += '<span class="tt-badge">output:' + esc(output) + "</span>";
    }
    if (info.policy_action) {
      badges += '<span class="tt-badge">' + esc(info.policy_action) + "</span>";
    }

    const qdBits = [];
    if (qd.intent != null) qdBits.push(decompChip(qd.intent, esc));
    ["entity", "entity_type", "geo", "audience", "theme", "occasion", "price"].forEach(
      (k) => {
        if (qd[k] != null && qd[k] !== "") {
          qdBits.push(
            '<span class="tt-decomp-kv"><span class="k">' +
              esc(k) +
              "</span> " +
              esc(String(qd[k])) +
              "</span>"
          );
        }
      }
    );
    const qdRow = qdBits.length
      ? '<div class="tt-decomp-row"><div class="lab">Query</div><div class="val">' +
        qdBits.join("") +
        "</div></div>"
      : "";

    const targetRows = targets
      .map((tgt) => {
        if (!tgt || typeof tgt !== "object") return "";
        const et = tgt.entity_type || tgt.entity || "?";
        const fields = tgt.focus || tgt.fields || [];
        const chips = Array.isArray(fields)
          ? fields.map((f) => decompChip(f, esc)).join("")
          : "";
        return (
          '<div class="tt-decomp-row"><div class="lab">Target</div><div class="val"><strong>' +
          esc(String(et)) +
          "</strong> " +
          chips +
          "</div></div>"
        );
      })
      .join("");

    let predBits = "";
    if (Array.isArray(preds)) {
      predBits = preds
        .map((p) => {
          if (!p || typeof p !== "object") return decompChip(p, esc);
          const field = p.field || p.path || "";
          const op = p.op || "=";
          const val = p.value != null ? p.value : "";
          return (
            '<span class="tt-decomp-kv"><span class="k">' +
            esc(String(field)) +
            "</span> " +
            esc(String(op)) +
            " " +
            esc(String(val)) +
            "</span>"
          );
        })
        .join("");
    } else if (isPlainObj(preds)) {
      predBits = Object.keys(preds)
        .map(
          (k) =>
            '<span class="tt-decomp-kv"><span class="k">' +
            esc(k) +
            "</span> = " +
            esc(String(preds[k])) +
            "</span>"
        )
        .join("");
    }
    const predRow = predBits
      ? '<div class="tt-decomp-row"><div class="lab">Where</div><div class="val">' +
        predBits +
        "</div></div>"
      : "";
    const outRow = output
      ? '<div class="tt-decomp-row"><div class="lab">Output</div><div class="val">' +
        decompChip(output, esc) +
        "</div></div>"
      : "";

    return (
      '<div class="tt-decomp">' +
      "<header><span>Decomposition</span><span class=\"tt-decomp-badges\">" +
      badges +
      "</span>" +
      '<button type="button" class="tt-btn ghost ml-auto" id="tt-decomp-copy" data-copy-from="tt-decomp-json" title="Click to copy">Copy</button></header>' +
      '<pre id="tt-decomp-json" hidden></pre>' +
      (info.summary
        ? '<p class="tt-decomp-summary">' + esc(info.summary) + "</p>"
        : "") +
      qdRow +
      targetRows +
      predRow +
      outRow +
      "</div>"
    );
  }

  /**
   * Workbench is stored as `{origin}/hub/#/workbench`. Detective SPA lives at
   * `{origin}/hub/#/debug/req/{req_id}` — strip any hash + trailing /hub, then
   * rebuild the Debug hash route. Never append under /#/workbench.
   */
  function normalizeHubBase(raw) {
    let s = String(raw || "").trim();
    if (!s) return "";
    const hash = s.indexOf("#");
    if (hash >= 0) s = s.slice(0, hash);
    s = s.replace(/\/+$/, "");
    s = s.replace(/\/hub$/i, "");
    return s.replace(/\/+$/, "");
  }

  function hubDebugReqUrl(base, rid) {
    const origin = normalizeHubBase(base);
    if (!origin || !rid) return "";
    return origin + "/hub/#/debug/req/" + encodeURIComponent(String(rid));
  }

  function hubDebugSessionUrl(base, sid) {
  const origin = normalizeHubBase(base);
  if (!origin || !sid) return "";
  return origin + "/hub/debug/session/" + encodeURIComponent(String(sid));
  }

  function extractGather(t, entry) {
  t = t && typeof t === "object" ? t : {};
  entry = entry && typeof entry === "object" ? entry : {};
  const sess = t.session && typeof t.session === "object" ? t.session : {};
  const det = t.detective && typeof t.detective === "object" ? t.detective : {};
  const inj =
    t.inject && typeof t.inject === "object"
      ? t.inject
      : det.prompt && det.prompt.inject && typeof det.prompt.inject === "object"
        ? det.prompt.inject
        : {};
  const cat = t.catalog && typeof t.catalog === "object" ? t.catalog : {};
  const tgt = t.target && typeof t.target === "object" ? t.target : {};
  const la = t.layer_a && typeof t.layer_a === "object" ? t.layer_a : {};
  const hops = Array.isArray(t.hops) ? t.hops : [];
  const chat = t.chat_id || sess.chat_id || entry.chat_id || "—";
  const turn = t.turn_id || sess.turn_id || "—";
  const sid = t.session_id || sess.id || sess.session_id || entry.session_id || "—";
  const pref = t.preferred_req_id || sess.preferred_req_id || "—";
  const rids = Array.isArray(t.req_ids)
    ? t.req_ids
    : Array.isArray(sess.req_ids)
      ? sess.req_ids
      : hops.map((h) => h && (h.req_id || "")).filter(Boolean);
  const hopBits = hops.map((h) => {
    const name = (h && (h.name || h.verb || h.path_class)) || "?";
    const st = h && h.status != null ? h.status : "";
    const err = h && h.error ? " err" : "";
    return name + (st !== "" ? ":" + st : "") + err;
  });
  const bucket = tgt.bucket || "—";
  const scope = tgt.scope || "—";
  const coll = tgt.collection || "—";
  const mode = tgt.mode || entry.mode || "—";
  const zurl = t.zeus_url || "—";
  const cver = t.client_version || "—";
  const toolsN = cat.tools_count != null ? cat.tools_count : "—";
  const cst = t.contract_status || sess.contract_status || entry.contract_status || "—";
  const brief = inj.brief_sha12 || cat.brief_sha12 || "—";
  const mini = inj.mini_sha12 || cat.mini_sha12 || "—";
  const via = la.via || "—";
  const conf = la.confidence || "—";
  const pol = la.policy_action || "—";
  const tok = t.tokens && typeof t.tokens === "object" ? t.tokens : {};
  const xref = t.export_ref || t.turn_id || "—";
  return [
    { id: "ids", label: "1. Ids", value: "chat " + chat + " · turn " + turn + " · sess " + sid },
    {
      id: "hops",
      label: "2. Hops",
      value:
        "preferred " +
        pref +
        (rids.length ? " · " + rids.join(", ") : "") +
        (hopBits.length ? " · " + hopBits.join(" · ") : ""),
    },
    {
      id: "target",
      label: "3. Target",
      value: zurl + " · " + bucket + "/" + scope + "/" + coll + " · " + mode + " · client " + cver,
    },
    {
      id: "catalog",
      label: "4. Catalog",
      value:
        "brief=" +
        (cat.has_scope_brief === true ? "yes" : cat.has_scope_brief === false ? "no" : "—") +
        " · mini=" +
        (cat.has_mini_schema === true ? "yes" : cat.has_mini_schema === false ? "no" : "—") +
        " · tools=" +
        toolsN +
        " · contract=" +
        cst,
    },
    { id: "inject", label: "5. Inject", value: "brief_sha " + brief + " · mini_sha " + mini },
    {
      id: "hoperr",
      label: "6. Hop table",
      value: hopBits.length ? hopBits.join(" · ") : "(no hops)",
    },
    {
      id: "layer",
      label: "7. Layer A",
      value: "via=" + via + " · conf=" + conf + " · policy=" + pol,
    },
    {
      id: "tokens",
      label: "8. Tokens",
      value:
        (tok.prompt != null ? tok.prompt : "?") +
        " / " +
        (tok.completion != null ? tok.completion : "?") +
        " / " +
        (tok.total != null ? tok.total : tokenTotal(tok) || "?") +
        (tok.ok === false ? " · ok=false" : ""),
    },
    { id: "export", label: "9. Journal", value: String(xref) },
  ];
  }

  function isMultiAgentTrace(trace, entry) {
    const t = trace && typeof trace === "object" ? trace : {};
    const e = entry && typeof entry === "object" ? entry : {};
    if (t.multi_agent === true || e.multi_agent === true) return true;
    const eng = t.engine || e.engine || "";
    if (eng === "local_units" || eng === "sidecar") return true;
    const units = t.units || t.unit_summaries || e.units;
    return Array.isArray(units) && units.length > 0;
  }

  function extractJobUnits(trace, entry) {
    const t = trace && typeof trace === "object" ? trace : {};
    const e = entry && typeof entry === "object" ? entry : {};
    const raw = t.units || t.unit_summaries || e.units || [];
    if (!Array.isArray(raw)) return [];
    return raw.map((u, i) => {
      const row = u && typeof u === "object" ? u : {};
      const reqIds = Array.isArray(row.req_ids) ? row.req_ids.filter(Boolean).map(String) : [];
      const hops = Array.isArray(row.hops)
        ? row.hops.map((h) => {
            const hop = h && typeof h === "object" ? h : {};
            const bytes = resolveHopBytes(hop);
            return bytes != null && hop.bytes == null ? Object.assign({}, hop, { bytes: bytes }) : hop;
          })
        : reqIds.map((rid, hi) => ({
            req_id: rid,
            verb: row.kind === "zeus_direct" ? "find" : "unit",
            status: row.status === "error" || row.status === "err" ? 500 : 200,
            ms: row.ms || 0,
            bytes: null,
            preferred: hi === 0,
            req: row.call || {},
            res: {},
          }));
      const status = String(row.status || "ok");
      const err = status === "error" || status === "err" || !!row.error_code;
      return {
        unit_id: String(row.unit_id || "u" + (i + 1)),
        status: err ? "err" : status === "partial" || status === "warn" ? "warn" : "ok",
        kind: row.kind || "agent_turn",
        goal: row.goal || "",
        stuffed_goal: row.stuffed_goal || "",
        synth: !!row.synth,
        wave: Number(row.wave) || (row.synth ? 2 : 1),
        catalog_mode: row.catalog_mode || "",
        has_inject: !!row.has_inject,
        answer: row.answer || "",
        req_ids: reqIds,
        error_code: row.error_code || "",
        hops,
        llm: Array.isArray(row.llm) ? row.llm : Array.isArray(row.llmRounds) ? row.llmRounds : [],
      };
    });
  }

export {
    escapeHtml,
    asDisplayText,
    formatDetectiveOverview,
    detectivePromptChecks,
    detectiveCheckSummary,
    normalizeHubBase,
    hubDebugReqUrl,
    hubDebugSessionUrl,
    fmtMs,
    fmtBytes,
    resolveHopBytes,
    matchingToolStep,
    estimatePayloadBytes,
    fmtTokens,
    tokenTotal,
    shortId,
    prettyJSON,
    copyToClipboard,
    tryParseJSON,
    traceMetrics,
    pipelineSpansFromStep,
    expandTraceSpans,
    extractStepCosts,
    attachPipelineCostsToSteps,
    synthesizeTraceSpans,
    traceWallMs,
    waterfallHTML,
    tallyToolCalls,
    toolFrequencyChartHTML,
    jsnviewOptions,
    mountJsnviewViewer,
    extractDecomposition,
    decompositionCardHTML,
    extractGather,
    isMultiAgentTrace,
    extractJobUnits,
  };

