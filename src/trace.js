import { detectiveUrl, getWidgetVersion, parseToolOrder, zeusFetch } from "./config.js";
import { loadJsnview } from "./jsnview-loader.js";

export function initZeusTrace(root, config = {}) {
  const $ = (id) => root.querySelector(`#${id}`);

  const TRACE_MAX_CARDS = 12;
  let CHART_ORDER = parseToolOrder(config.toolOrder) ?? { v1: [], v2: [] };
  let activeTraceEntries = [];
  let traceTurn = 0;
  const traceTotals = [];
  let chatId = null;
  let latestSessionId = null;

  function openDebugPanel() {
    const panel = $("debug-panel");
    const toggle = $("debug-toggle");
    panel.classList.remove("is-hidden");
    panel.setAttribute("aria-hidden", "false");
    toggle?.setAttribute("aria-expanded", "true");
  }

  function closeDebugPanel() {
    const panel = $("debug-panel");
    const toggle = $("debug-toggle");
    panel.classList.add("is-hidden");
    panel.setAttribute("aria-hidden", "true");
    toggle?.setAttribute("aria-expanded", "false");
  }

  function toggleDebugPanel() {
    const panel = $("debug-panel");
    if (panel.classList.contains("is-hidden")) openDebugPanel();
    else closeDebugPanel();
  }

  function showToast(msg, kind) {
    const toast = $("toast");
    const alert = toast?.querySelector(".alert");
    const msgEl = $("toast-msg");
    if (!toast || !msgEl) return;
    msgEl.textContent = msg;
    alert.className = "alert text-sm py-2 " + (kind === "warning" ? "alert-warning" : "alert-success");
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 2200);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  function fmtMs(ms) {
    return ms >= 1000 ? (ms / 1000).toFixed(2) + "s" : ms + "ms";
  }

  function fmtBytes(b) {
    if (b < 1024) return b + "B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + "kB";
    return (b / (1024 * 1024)).toFixed(1) + "MB";
  }

  function shortId(s, n) {
    n = n || 10;
    if (!s) return "";
    const str = String(s);
    return str.length > n ? str.slice(0, n) + "…" : str;
  }

  function extractSessionId(j) {
    if (!j || typeof j !== "object") return "";
    const t = j.trace && typeof j.trace === "object" ? j.trace : null;
    const sess = t?.session && typeof t.session === "object" ? t.session : null;
    return String(
      j.session_id ||
      t?.session_id ||
      sess?.id ||
      sess?.session_id ||
      j.session?.id ||
      ""
    ).trim();
  }

  function updateDebugTitle(sessionId) {
    const titleEl = $("debug-panel-title");
    const linkEl = $("debug-detective-link");
    const sid = (sessionId || "").trim();

    if (titleEl) {
      // Product title stays fixed; session identity lives on the Detective link.
      titleEl.textContent = "Zeus Tracer";
      if (sid) titleEl.setAttribute("title", `session ${sid}`);
      else titleEl.removeAttribute("title");
    }

    if (!linkEl) return;

    const href = detectiveUrl(config.hubBaseUrl, sid);
    if (href) {
      linkEl.href = href;
      linkEl.hidden = false;
      linkEl.classList.remove("is-disabled");
      linkEl.setAttribute("aria-disabled", "false");
      linkEl.setAttribute("title", `Open Hub Detective for session ${sid}`);
    } else {
      linkEl.href = "#";
      linkEl.hidden = true;
      linkEl.classList.add("is-disabled");
      linkEl.setAttribute("aria-disabled", "true");
      linkEl.setAttribute("title", "Open Hub Detective for this session");
    }
  }

  function apiValue(v) {
    // Default v2 to match card-header display and modern Zeus hosts.
    return String(v || "v2").toLowerCase() === "v1" ? "v1" : "v2";
  }

  function applyToolOrder(raw) {
    const order = parseToolOrder(raw);
    if (order) CHART_ORDER = order;
  }

  async function loadToolOrder() {
    const injected = parseToolOrder(config.toolOrder);
    if (injected) {
      CHART_ORDER = injected;
      return;
    }
    if (!config.zeusApiUrl) {
      return;
    }
    const timeoutMs = Number(config.toolOrderTimeoutMs);
    const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 3000;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => {
          try {
            controller.abort();
          } catch {
            /* ignore */
          }
        }, ms)
      : null;
    try {
      const res = await zeusFetch("/api/tool-order", config, controller ? { signal: controller.signal } : {});
      const fetched = parseToolOrder(await res.json());
      if (fetched) CHART_ORDER = fetched;
    } catch {
      /* keep sync fallback — network/CORS/abort must not affect the widget */
    } finally {
      if (timer != null) clearTimeout(timer);
    }
  }

  function badgePill(kind, main, tail) {
    const tailHtml = tail
      ? `<span class="bp-tail">${escapeHtml(String(tail))}</span>`
      : "";
    return (
      `<div class="badge-pill bp-${kind}">`
      + `<span>${escapeHtml(String(main))}</span>`
      + tailHtml
      + `</div>`
    );
  }

  function contractSessionBadges(j, t) {
    const sess = (t && t.session) || {};
    const sid = j.session_id || sess.id;
    const sround = j.session_round || sess.round;
    const cstatus = j.contract_status || sess.contract_status || (t && t.contract_status);
    const cid = (t && t.contract && t.contract.id) || j.contract_id;
    const serr = j.session_error || sess.error || (t && t.session_error);
    const sdisabled = !!(sess && sess.disabled);
    let html = "";
    if (cstatus) {
      const kind = cstatus === "match" ? "success" : cstatus === "drift" ? "warning" : "ghost";
      html += badgePill(kind, `contract:${cstatus}`);
    }
    if (cid) html += badgePill("info", shortId(cid, 14), "");
    if (sdisabled) html += badgePill("ghost", "sessions: off", "");
    else if (serr) html += badgePill("error", "session: failed", "");
    else if (sid) {
      html += badgePill("ghost", `sess:${shortId(sid)}`, sround ? `r${sround}` : "");
    }
    return html;
  }

  function traceMetrics(t) {
    let aiMs = 0, zeusMs = 0, tokens = 0, tokensIn = 0, tokensOut = 0, bytes = 0;
    let hasTokens = false, hasIn = false, hasOut = false;
    (t.steps || []).forEach((s) => {
      if (s.type === "llm" || s.type === "llm_error") aiMs += s.ms || 0;
      if (s.type === "tool") {
        zeusMs += s.ms || 0;
        bytes += s.bytes || 0;
      }
      const u = s.usage;
      if (!u) return;
      if (u.total_tokens != null) {
        tokens += Number(u.total_tokens) || 0;
        hasTokens = true;
      }
      if (u.prompt_tokens != null) {
        tokensIn += Number(u.prompt_tokens) || 0;
        hasIn = true;
      }
      if (u.completion_tokens != null) {
        tokensOut += Number(u.completion_tokens) || 0;
        hasOut = true;
      }
    });
    if (!hasTokens && (hasIn || hasOut)) {
      tokens = tokensIn + tokensOut;
      hasTokens = true;
    }
    const total = t.total_ms || aiMs + zeusMs;
    const other = Math.max(0, total - aiMs - zeusMs);
    return {
      total, aiMs, zeusMs, other, bytes,
      tokens, tokensIn, tokensOut, hasTokens, hasIn, hasOut,
    };
  }

  function fmtTok(n, has) {
    if (!has) return "?";
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n);
    return Math.round(num).toLocaleString("en-US");
  }

  /** Token In / Out / Total as three colored dashboard tiles. */
  function tokensStatsHTML(m) {
    return `<div id="tokens-total" class="trace-total token-stats-grid" title="Token usage (prompt / completion / total)">`
      + `<div class="stats shadow">`
      + `<div class="stat place-items-center token-stat-card token-in">`
      + `<div class="stat-title">Token In</div>`
      + `<div class="stat-value text-primary">${fmtTok(m.tokensIn, m.hasIn)}</div>`
      + `</div>`
      + `<div class="stat place-items-center token-stat-card token-out">`
      + `<div class="stat-title">Token Out</div>`
      + `<div class="stat-value text-secondary">${fmtTok(m.tokensOut, m.hasOut)}</div>`
      + `</div>`
      + `<div class="stat place-items-center token-stat-card token-all">`
      + `<div class="stat-title">Total Tokens</div>`
      + `<div class="stat-value text-success">${fmtTok(m.tokens, m.hasTokens)}</div>`
      + `</div>`
      + `</div>`
      + `</div>`;
  }

  function buildMetricsRow(t) {
    const m = traceMetrics(t);
    const sum = m.total || 1;
    const pct = (n) => Math.round(n / sum * 100);
    const el = document.createElement("div");
    el.className = "msg-metrics";
    el.innerHTML =
      `<div class="mm-bar">`
      + `<i class="mm-ai" style="width:${(m.aiMs / sum * 100).toFixed(1)}%"></i>`
      + `<i class="mm-zeus" style="width:${(m.zeusMs / sum * 100).toFixed(1)}%"></i>`
      + `<i class="mm-other" style="width:${(m.other / sum * 100).toFixed(1)}%"></i>`
      + `</div>`
      + `<div class="mm-row">`
      + `<span class="mm-ai">${fmtMs(m.aiMs)}/${pct(m.aiMs)}% AI</span>`
      + `<div class="mm-legend">`
      + `<span class="mm-zeus">${fmtMs(m.zeusMs)}/${pct(m.zeusMs)}% Zeus</span>`
      + `<span class="mm-other">${fmtMs(m.other)}/${pct(m.other)}% Other</span>`
      + `<span class="mm-meta">Bytes: ${fmtBytes(m.bytes)}</span>`
      + `</div>`
      + `</div>`;
    return el;
  }

  /** System / catalog text used for inject flags + edges_total parse. */
  function systemTextFromTrace(t) {
    if (!t || typeof t !== "object") return "";
    const cat = t.catalog && typeof t.catalog === "object" ? t.catalog : null;
    const sm = cat?.system_message;
    if (sm && typeof sm === "object" && sm.content != null) return String(sm.content);
    if (typeof sm === "string") return sm;
    if (cat?.system_message_content != null) return String(cat.system_message_content);
    const det = t.detective && typeof t.detective === "object" ? t.detective : null;
    const inj = det?.prompt?.inject;
    if (inj && typeof inj === "object") {
      if (inj.system_preview) return String(inj.system_preview);
      if (inj.brief_preview) return String(inj.brief_preview);
    }
    // First AI request system message (when catalog omitted).
    for (const req of t.ai_requests || []) {
      const msgs = req?.messages || req?.body?.messages || [];
      if (!Array.isArray(msgs)) continue;
      for (const m of msgs) {
        if (m && m.role === "system" && m.content != null) return String(m.content);
      }
    }
    return "";
  }

  function parseEdgesTotal(text) {
    if (!text) return null;
    const m = /edges_total:\s*(\d+)/i.exec(text);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Head KPI strip: inject presence + turn shape (Hub Detective kpi-mini parity).
   * Labels fixed: MINI-SCHEMA, SCOPE BRIEF, LLM Rounds, Tool Calls, Avg / round, Edges.
   */
  function cardHeadStats(t) {
    const catalog = t?.catalog && typeof t.catalog === "object" ? t.catalog : {};
    const detInj =
      t?.detective?.prompt?.inject && typeof t.detective.prompt.inject === "object"
        ? t.detective.prompt.inject
        : {};
    const sys = systemTextFromTrace(t);

    const hasMini =
      catalog.has_mini_schema === true ||
      detInj.has_mini_schema === true ||
      /##\s*MINI-SCHEMA\b/i.test(sys);
    const hasBrief =
      catalog.has_scope_brief === true ||
      detInj.has_scope_brief === true ||
      /##\s*SCOPE BRIEF\b/i.test(sys);

    let llmRounds = Number(t?.rounds);
    if (!Number.isFinite(llmRounds) || llmRounds <= 0) {
      const fromSteps = (t?.steps || []).filter((s) => s && (s.type === "llm" || s.type === "llm_error")).length;
      const fromReqs = Array.isArray(t?.ai_requests) ? t.ai_requests.length : 0;
      llmRounds = fromSteps || fromReqs || 0;
    }

    let toolCalls = Array.isArray(t?.tool_calls) ? t.tool_calls.length : 0;
    if (!toolCalls) {
      toolCalls = (t?.steps || []).filter((s) => s && s.type === "tool").length;
    }

    const totalMs = Number(t?.total_ms);
    const wall = Number.isFinite(totalMs) && totalMs > 0
      ? totalMs
      : (t?.steps || []).reduce((a, s) => a + (Number(s?.ms) || 0), 0);
    let avgRoundSec = null;
    if (llmRounds > 0 && wall > 0) {
      avgRoundSec = wall / llmRounds / 1000;
    }

    const edges = parseEdgesTotal(sys);

    return {
      hasMiniSchema: hasMini,
      hasScopeBrief: hasBrief,
      llmRounds,
      toolCalls,
      avgRoundSec,
      edges,
    };
  }

  function fmtAvgRoundSec(sec) {
    if (sec == null || !Number.isFinite(sec)) return "—";
    if (sec < 0.01) return `${(sec * 1000).toFixed(0)}ms`;
    if (sec < 10) return `${sec.toFixed(2)}s`;
    return `${sec.toFixed(1)}s`;
  }

  function buildCardHeadStatsEl(t) {
    const s = cardHeadStats(t);
    const tips = {
      mini: "MINI-SCHEMA section present in system / catalog inject",
      brief: "SCOPE BRIEF section present in system / catalog inject",
      rounds: "Upstream LLM completion rounds this turn",
      tools: "Total Zeus tool invocations this turn",
      avg: "Wall time ÷ LLM rounds (seconds)",
      edges: "edges_total parsed from SCOPE BRIEF (scope inventory, not this-turn graph rows)",
    };
    /** Compact DaisyUI stat cell (smaller than #tokens-total). */
    const tile = (lbl, val, tip) =>
      `<div class="stat place-items-center" title="${escapeHtml(tip)}">`
      + `<div class="stat-title">${escapeHtml(lbl)}</div>`
      + `<div class="stat-value">${escapeHtml(String(val))}</div>`
      + `</div>`;

    const edgesVal = s.edges != null ? Number(s.edges).toLocaleString("en-US") : "—";
    const el = document.createElement("div");
    el.className = "stats shadow tc-kpi-mini";
    el.setAttribute("aria-label", "Turn inject and shape stats");
    el.innerHTML =
      tile("MINI-SCHEMA", s.hasMiniSchema ? "Yes" : "No", tips.mini)
      + tile("SCOPE BRIEF", s.hasScopeBrief ? "Yes" : "No", tips.brief)
      + tile("LLM Rounds", String(s.llmRounds), tips.rounds)
      + tile("Tool Calls", String(s.toolCalls), tips.tools)
      + tile("Avg / round", fmtAvgRoundSec(s.avgRoundSec), tips.avg)
      + tile("Edges", edgesVal, tips.edges);
    return el;
  }

  /** True when obj looks like a base-5 Layer A terminate bag. */
  function looksLikeLayerA(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    return (
      obj.summary != null ||
      obj.query_decomposition != null ||
      obj.decomposition != null ||
      obj.confidence != null ||
      obj.policy_action != null
    );
  }

  function layerABagFromArgs(args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) return null;
    if (
      args.summary != null ||
      args.query_decomposition != null ||
      args.decomposition != null ||
      args.confidence != null ||
      args.policy_action != null ||
      args.turn_complete === true
    ) {
      return args;
    }
    return null;
  }

  /**
   * Harvest Layer A from response envelope + trace terminate steps.
   * Priority matches client/Detective: explicit bag → structured_response →
   * return/return_result/pipeline steps → tool_calls → flat top-level keys.
   */
  function extractLayerA(j, t) {
    const jObj = j && typeof j === "object" ? j : {};
    const tObj = t && typeof t === "object" ? t : {};

    const take = (src, via) => {
      if (!looksLikeLayerA(src) && !(src && typeof src === "object" && src.turn_complete === true)) {
        return null;
      }
      return { ...src, via: src.via || via };
    };

    if (jObj.layer_a && typeof jObj.layer_a === "object") {
      const hit = take(jObj.layer_a, "response.layer_a");
      if (hit) return hit;
    }

    const sr = jObj.structured_response;
    if (sr && typeof sr === "object") {
      if (sr.layer_a && typeof sr.layer_a === "object") {
        const hit = take(sr.layer_a, "structured_response.layer_a");
        if (hit) return hit;
      }
      const hit = take(sr, "structured_response");
      if (hit) return hit;
    }

    const steps = Array.isArray(tObj.steps) ? tObj.steps : [];
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (!s || typeof s !== "object") continue;
      const stype = String(s.type || "").toLowerCase();
      const name = String(s.name || "").toLowerCase();
      const args = s.args && typeof s.args === "object" ? s.args : null;

      if (stype === "return" || stype === "return_result") {
        const bag = layerABagFromArgs(args);
        if (bag) return { ...bag, via: bag.via || stype };
      }
      if (stype === "tool" && name === "pipeline") {
        const bag = layerABagFromArgs(args);
        if (bag) return { ...bag, via: bag.via || "pipeline" };
        const pipe = s.pipeline_json && typeof s.pipeline_json === "object" ? s.pipeline_json : null;
        const fromPipe = layerABagFromArgs(pipe);
        if (fromPipe) return { ...fromPipe, via: fromPipe.via || "pipeline_json" };
      }
    }

    const toolCalls = Array.isArray(tObj.tool_calls) ? tObj.tool_calls : [];
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      const tc = toolCalls[i];
      if (!tc || typeof tc !== "object") continue;
      if (String(tc.name || "").toLowerCase() !== "pipeline") continue;
      const bag = layerABagFromArgs(tc.args);
      if (bag) return { ...bag, via: bag.via || "tool_calls.pipeline" };
    }

    // Flat top-level keys on the search response (some hosts hoist Layer A).
    if (looksLikeLayerA(jObj)) {
      return {
        summary: jObj.summary,
        query_decomposition: jObj.query_decomposition,
        decomposition: jObj.decomposition,
        confidence: jObj.confidence,
        policy_action: jObj.policy_action,
        business_rules_triggers: jObj.business_rules_triggers,
        app_output: jObj.app_output,
        jail_break_attempt: jObj.jail_break_attempt,
        via: "response",
      };
    }

    return null;
  }

  function formatLayerAValue(v) {
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      if (v.every((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean")) {
        return v.join(", ");
      }
    }
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  function layerAStat(title, value, opts = {}) {
    if (value == null || value === "") return "";
    const valStr = formatLayerAValue(value);
    if (!valStr) return "";
    const valueCls = opts.valueClass ? ` ${opts.valueClass}` : "";
    const extraStatCls = opts.statClass ? ` ${opts.statClass}` : "";
    const desc = opts.desc
      ? `<div class="stat-desc">${escapeHtml(opts.desc)}</div>`
      : "";
    const tip = opts.titleAttr
      ? ` title="${escapeHtml(opts.titleAttr)}"`
      : ` title="${escapeHtml(title)}: ${escapeHtml(valStr)}"`;
    return (
      `<div class="stat place-items-center${extraStatCls}"${tip}>`
      + `<div class="stat-title">${escapeHtml(title)}</div>`
      + `<div class="stat-value${valueCls}">${escapeHtml(valStr)}</div>`
      + desc
      + `</div>`
    );
  }

  /** Pretty-print a Layer A object/array for the code-block view. */
  function formatLayerACode(obj) {
    if (obj == null) return "";
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  function layerAStatsRow(statsHtml, extraClass = "") {
    if (!statsHtml) return "";
    const cls = extraClass ? ` stats shadow la-stats ${extraClass}` : " stats shadow la-stats";
    return `<div class="${cls.trim()}">${statsHtml}</div>`;
  }

  function confidenceValueClass(c) {
    const s = String(c || "").toLowerCase();
    if (s === "high") return "text-success";
    if (s === "med" || s === "medium") return "text-warning";
    if (s === "low") return "text-error";
    return "text-success";
  }

  function policyValueClass(p) {
    const s = String(p || "").toLowerCase();
    if (s === "answer") return "text-success";
    if (s === "clarify") return "text-warning";
    if (s === "refuse" || s === "error") return "text-error";
    return "text-warning";
  }

  /**
   * Layer A terminate: primary key|value pills + code blocks for
   * query_decomposition / decomposition (mockup dashboard layout).
   */
  function buildLayerAEl(la) {
    if (!la || typeof la !== "object") return null;

    const qd = la.query_decomposition && typeof la.query_decomposition === "object"
      ? la.query_decomposition
      : null;
    const dd = la.decomposition && typeof la.decomposition === "object"
      ? la.decomposition
      : null;

    let intent = la.intent;
    if (intent == null && qd && qd.intent != null) intent = qd.intent;
    if (intent && typeof intent === "object" && intent.goal != null) intent = intent.goal;

    const predicates = dd && dd.predicates != null ? dd.predicates : la.predicates;
    const output = dd && dd.output != null ? dd.output : la.output;
    const targets = dd && Array.isArray(dd.targets) ? dd.targets : null;

    // Primary KPI row — scannable pill strip
    let primary = "";
    primary += layerAStat("Confidence", la.confidence, {
      valueClass: confidenceValueClass(la.confidence),
    });
    primary += layerAStat("Policy", la.policy_action, {
      valueClass: policyValueClass(la.policy_action),
      titleAttr: "policy_action",
    });
    primary += layerAStat("Intent", intent, {
      valueClass: "text-primary",
      titleAttr: "query_decomposition.intent",
    });
    primary += layerAStat("Output", output, {
      valueClass: "text-secondary",
      titleAttr: "decomposition.output",
    });
    if (la.ok === true) {
      primary += layerAStat("OK", "true", {
        valueClass: "text-success",
        statClass: "la-ok",
      });
    } else if (la.ok === false) {
      primary += layerAStat("OK", "false", {
        valueClass: "text-error",
        statClass: "la-ok-false",
      });
    }

    // Code blocks for QD + decomposition (dashboard mockup)
    let codeSections = "";
    if (qd && Object.keys(qd).length) {
      codeSections +=
        `<div class="la-code-section">`
        + `<h4>query_decomposition</h4>`
        + `<pre class="code-font">${escapeHtml(formatLayerACode(qd))}</pre>`
        + `</div>`;
    }

    // Build a decomp view that always surfaces Targets / Predicates labels for operators + tests
    if (dd || targets || predicates != null) {
      const decompView = {};
      if (targets && targets.length) decompView.Targets = targets;
      if (predicates != null) decompView.Predicates = predicates;
      if (dd) {
        Object.keys(dd).forEach((k) => {
          if (k === "targets" || k === "predicates") return;
          decompView[k] = dd[k];
        });
      }
      if (Object.keys(decompView).length) {
        codeSections +=
          `<div class="la-code-section">`
          + `<h4>decomposition</h4>`
          + `<pre class="code-font">${escapeHtml(formatLayerACode(decompView))}</pre>`
          + `</div>`;
      }
    }

    // business_rules_triggers as compact stats tiles
    let triggerStats = "";
    if (la.business_rules_triggers && typeof la.business_rules_triggers === "object"
        && !Array.isArray(la.business_rules_triggers)) {
      Object.keys(la.business_rules_triggers).forEach((tk) => {
        const on = !!la.business_rules_triggers[tk];
        triggerStats += layerAStat(tk, on ? "true" : "false", {
          valueClass: on ? "text-success text-sm la-stat-sm" : "text-sm la-stat-sm",
          titleAttr: `business_rules_triggers.${tk}`,
        });
      });
    }

    // summary is kept on the harvested bag / JSON dump only — not rendered in the panel
    if (!primary && !codeSections && !triggerStats) return null;

    const via = la.via ? String(la.via) : "";
    const el = document.createElement("div");
    el.className = "layer-a-panel";
    el.setAttribute("aria-label", "Layer A terminate");
    el.innerHTML =
      `<div class="la-heading">`
      + `<span class="la-title">Layer A</span>`
      + (via ? `<span class="la-via" title="source">${escapeHtml(via)}</span>` : "")
      + `</div>`
      + layerAStatsRow(primary, "la-stats-primary")
      + (codeSections ? `<div class="la-code-block">${codeSections}</div>` : "")
      + (triggerStats
        ? `<div class="la-section-label">business_rules_triggers</div>${layerAStatsRow(triggerStats, "la-stats-triggers")}`
        : "");
    return el;
  }

  function renderTraceTotal() {
    const el = $("trace-total-wrapper");
    if (!traceTotals.length) {
      el.style.display = "none";
      return;
    }
    const a = traceTotals.reduce(
      (acc, m) => ({
        total: acc.total + m.total,
        aiMs: acc.aiMs + m.aiMs,
        zeusMs: acc.zeusMs + m.zeusMs,
        other: acc.other + m.other,
        tokens: acc.tokens + m.tokens,
        tokensIn: acc.tokensIn + m.tokensIn,
        tokensOut: acc.tokensOut + m.tokensOut,
        hasTokens: acc.hasTokens || m.hasTokens,
        hasIn: acc.hasIn || m.hasIn,
        hasOut: acc.hasOut || m.hasOut,
        bytes: acc.bytes + m.bytes,
      }),
      {
        total: 0, aiMs: 0, zeusMs: 0, other: 0, bytes: 0,
        tokens: 0, tokensIn: 0, tokensOut: 0,
        hasTokens: false, hasIn: false, hasOut: false,
      }
    );
    const sum = a.total || 1;
    const pct = (n) => Math.round((n / sum) * 100);
    el.style.display = "flex";
    el.innerHTML =
      tokensStatsHTML(a)
      + `<div id="trace-total" class="trace-total total-progress" style="display:flex;">`
      + `<div class="tt-label">Total · ${traceTotals.length} Turn${traceTotals.length === 1 ? "" : "s"} · ${fmtMs(a.total)}</div>`
      + `<div class="mm-bar">`
      + `<i class="mm-ai" style="width:${(a.aiMs / sum * 100).toFixed(1)}%"></i>`
      + `<i class="mm-zeus" style="width:${(a.zeusMs / sum * 100).toFixed(1)}%"></i>`
      + `<i class="mm-other" style="width:${(a.other / sum * 100).toFixed(1)}%"></i>`
      + `</div>`
      + `<div class="total-progress-meta">`
      + `<div><span class="mm-ai">${fmtMs(a.aiMs)}</span>/${pct(a.aiMs)}% AI</div>`
      + `<div class="total-progress-right">`
      + `<div><span class="mm-zeus">${fmtMs(a.zeusMs)}</span>/${pct(a.zeusMs)}% Zeus</div>`
      + `<div><span class="mm-other">${fmtMs(a.other)}</span>/${pct(a.other)}% Other</div>`
      + `</div>`
      + `</div>`
      + `</div>`;
  }

  function pipelineSpansFromStep(at, ms, step) {
    let costs = step?.pipeline_step_costs;
    if (!costs?.length) {
      try {
        costs = JSON.parse(step?.result_full || step?.result || "{}")?.meta?.step_costs;
      } catch {
        costs = null;
      }
    }
    if (!Array.isArray(costs) || !costs.length) return null;
    const verbs = {};
    (step?.args?.steps || step?.pipeline_json?.steps || []).forEach((s) => {
      if (s?.name) verbs[s.name] = s.verb || "";
    });
    const spans = [];
    let offset = 0;
    costs.forEach((sc) => {
      const stepName = sc.as || sc.name || "step";
      const verb = verbs[stepName] || "";
      spans.push({
        name: `pipeline.${stepName}` + (verb ? `.${verb}` : ""),
        cls: "tool",
        at: (at || 0) + offset,
        ms: sc.ms || 0,
        detail: sc.status || null,
        pipeline: true,
      });
      offset += sc.ms || 0;
    });
    return spans;
  }

  function expandTraceSpans(spans, steps) {
    const pipelineTools = (steps || []).filter((s) => s.type === "tool" && s.name === "pipeline");
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

  function waterfallHTML(spans, totalMs, steps) {
    const rows = expandTraceSpans(spans, steps);
    if (!rows.length) return "";
    const sum = totalMs || rows.reduce((a, s) => Math.max(a, (s.at || 0) + (s.ms || 0)), 0) || 1;
    let html = `<div class="trace-waterfall">`;
    rows.forEach((s) => {
      const left = Math.max(0, Math.min(100, (s.at || 0) / sum * 100));
      const w = Math.max(0.5, Math.min(100 - left, (s.ms || 0) / sum * 100));
      const labCls = s.pipeline ? "tw-lab tw-lab-pipeline" : "tw-lab";
      const durLabel = s.ms >= 1000
        ? `${(s.ms / 1000).toFixed(2)}s`
        : `${s.ms || 0}ms`;
      html +=
        `<div class="tw-row">`
        + `<div class="${labCls}" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>`
        + `<div class="tw-track"><i class="${s.cls}" style="left:${left.toFixed(2)}%;width:${w.toFixed(2)}%"></i></div>`
        + `<div class="tw-dur">${durLabel}</div>`
        + `</div>`;
    });
    html += `</div>`;
    return html;
  }

  function tallyToolCalls(steps) {
    const counts = {}, errs = {};
    const bump = (name, step) => {
      counts[name] = (counts[name] || 0) + 1;
      const st = step?.status;
      if (st === 0 || (typeof st === "number" && st >= 400)) errs[name] = (errs[name] || 0) + 1;
    };
    (steps || []).forEach((s) => {
      if (s.type !== "tool") return;
      if (s.name === "pipeline") {
        (s.args?.steps || s.pipeline_json?.steps || []).forEach((p) => {
          if (p?.verb) bump(p.verb, s);
        });
        return;
      }
      bump(s.name || "?", s);
    });
    return { counts, errs };
  }

  function toolFrequencyChartHTML(steps, apiVersion) {
    const { counts, errs } = tallyToolCalls(steps);
    const names = Object.keys(counts);
    if (!names.length) return "";
    const api = apiValue(apiVersion);
    const canon = CHART_ORDER[api] || [];
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
    let bars = "", labels = "";
    slots.forEach((name) => {
      const n = counts[name] || 0;
      const h = maxN > 0 && n > 0 ? Math.max(2, Math.round((n / maxN) * BAR_MAX)) : 0;
      const cls = errs[name] ? "b err" : !canonSet.has(name) ? "b unknown" : "b";
      bars += `<div class="vbar-col"><div class="${n > 0 ? "n" : "n zero"}">${n > 0 ? n : ""}</div>`
        + `<div class="${cls}" style="height:${h}px"></div></div>`;
      labels += `<div class="${n > 0 ? "l" : "l zero"}">${escapeHtml(name)}</div>`;
    });
    return `<div class="trace-vbar mt-3"><h3 class="trace-vbar-title">Tool-call frequency</h3>`
      + `<div class="vbar-wrap">${bars}</div><div class="vbar-labels">${labels}</div></div>`;
  }

  function traceText(t) {
    const lines = [];
    (t.notes || []).forEach((n) => lines.push("• " + n));
    (t.steps || []).forEach((s) => {
      const rnd = s.round != null ? s.round : "?";
      if (s.type === "llm") {
        const u = s.usage || {};
        const tok = u.total_tokens
          ? `  tok=${u.total_tokens} (in ${u.prompt_tokens || "?"}/out ${u.completion_tokens || "?"})`
          : "";
        lines.push(
          `[r${rnd}] LLM ${s.ms || 0}ms → ${s.finish_reason || ""}  calls=[${(s.tool_calls || []).join(", ")}]${tok}`
        );
      } else if (s.type === "tool") {
        if (s.name === "pipeline") {
          const expanded = pipelineSpansFromStep(0, s.ms, s);
          lines.push(`[r${rnd}] PIPELINE ${s.ms || 0}ms → ${s.status} ${fmtBytes(s.bytes || 0)}`);
          if (expanded) {
            expanded.forEach((sp) => {
              lines.push(`  · ${sp.name} ${sp.ms || 0}ms${sp.detail != null ? " → " + sp.detail : ""}`);
            });
          }
        } else {
          lines.push(`[r${rnd}] TOOL ${s.name} → ${s.status} ${s.ms || 0}ms`);
        }
      } else if (s.type === "llm_error") {
        lines.push(`[r${rnd}] LLM_ERROR ${s.ms || 0}ms ${s.detail || ""}`);
      }
    });
    // Fallback: tool_calls records when steps are missing/empty (still show rounds).
    if (!lines.some((l) => l.startsWith("[r")) && (t.tool_calls || []).length) {
      (t.tool_calls || []).forEach((tc) => {
        const rnd = tc.round != null ? tc.round : "?";
        lines.push(`[r${rnd}] TOOL ${tc.name || "?"} → ${tc.status} ${tc.ms || 0}ms`);
      });
    }
    return lines.join("\n");
  }

  function prettyJSON(x) {
    try {
      return JSON.stringify(x, null, 2);
    } catch {
      return String(x);
    }
  }

  async function mountJsnviewViewer(host, obj, open) {
    try {
      const Jsnview = await loadJsnview();
      const viewer = new Jsnview(obj, { showType: true, collapsed: !open, maxDepth: Infinity });
      host.appendChild(viewer.getElement());
    } catch {
      const pre = document.createElement("pre");
      pre.className = "trace-pre";
      pre.textContent = prettyJSON(obj);
      host.appendChild(pre);
    }
  }

  function appendTextDetails(parent, title, text, open = false) {
    const root = document.createElement("div");
    root.className = "collapse collapse-plus trace-dump bg-base-200 rounded border border-base-300";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.setAttribute("aria-label", title);
    if (open) toggle.checked = true;
    const titleEl = document.createElement("div");
    titleEl.className = "collapse-title text-xs font-bold py-2 min-h-0";
    titleEl.textContent = title;
    const content = document.createElement("div");
    content.className = "collapse-content";
    const pre = document.createElement("pre");
    pre.className = "trace-pre bg-base-300 rounded p-2 mt-1";
    pre.textContent = text;
    content.appendChild(pre);
    root.append(toggle, titleEl, content);
    parent.appendChild(root);
  }

  async function appendJSONDetails(parent, title, obj, open) {
    // Prefer checkbox collapse-plus (DaisyUI-recommended). details+open is unreliable
    // with collapse-plus when DaisyUI CSS loads after content is mounted.
    const root = document.createElement("div");
    root.className = "collapse collapse-plus trace-dump bg-base-200 rounded border border-base-300";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.setAttribute("aria-label", title);
    if (open) toggle.checked = true;

    const titleEl = document.createElement("div");
    titleEl.className = "collapse-title text-xs font-bold py-2 min-h-0";
    titleEl.textContent = title;

    const content = document.createElement("div");
    content.className = "collapse-content";
    const viewerHost = document.createElement("div");
    viewerHost.className = "trace-dump-viewer";
    content.appendChild(viewerHost);

    root.append(toggle, titleEl, content);
    parent.appendChild(root);
    await mountJsnviewViewer(viewerHost, obj, open);
  }

  function roundLabel(n) {
    const count = Array.isArray(n) ? n.length : Number(n) || 0;
    return `${count} round${count === 1 ? "" : "s"}`;
  }

  async function appendTraceDump(card, question, j, t, layerA) {
    const wrap = document.createElement("div");
    wrap.className = "trace-dump-wrap";
    // Attach immediately so dump titles stay visible even if jsnview hangs/fails.
    card.appendChild(wrap);

    const aiReqs = t.ai_requests || [];
    const aiResps = t.ai_responses || [];
    const toolCalls = t.tool_calls || [];
    const dumps = [
      appendJSONDetails(wrap, `AI requests · ${roundLabel(aiReqs)}`, aiReqs),
      appendJSONDetails(wrap, `AI responses · ${roundLabel(aiResps)}`, aiResps),
      appendJSONDetails(wrap, `Tool calls · ${toolCalls.length}`, toolCalls, toolCalls.length > 0),
    ];
    if (layerA) {
      dumps.push(appendJSONDetails(wrap, "Layer A", layerA, true));
    }
    dumps.push(
      appendJSONDetails(wrap, "Raw turn bundle", {
        question,
        answer: j.answer,
        target: j.target,
        api_version: j.api_version || t.api_version,
        session_id: j.session_id,
        session_round: j.session_round,
        contract_status: j.contract_status,
        layer_a: layerA || j.layer_a || j.structured_response?.layer_a || undefined,
        trace: t,
      })
    );

    // Mount dumps in parallel; each section already has a sync title + fallback pre.
    await Promise.all(dumps);
  }

  function appendTraceCard(question, j) {
    const t = j.trace;
    if (!t) return;
    applyToolOrder(j.tool_order);
    chatId = j.chat_id || chatId;
    const sid = extractSessionId(j);
    if (sid) {
      latestSessionId = sid;
      updateDebugTitle(sid);
    }
    if (!activeTraceEntries.includes(j)) activeTraceEntries.push(j);
    const list = $("trace-list");
    const empty = $("trace-empty");
    if (empty) empty.remove();
    traceTurn++;

    const card = document.createElement("div");
    card.className = "trace-card";
    const bodyId = `trace-card-body-${traceTurn}`;
    const head = document.createElement("button");
    head.type = "button";
    head.className = "trace-card-head";
    head.setAttribute("aria-expanded", "true");
    head.setAttribute("aria-controls", bodyId);
    const apiLabel = apiValue(j.api_version || t.api_version);
    head.innerHTML =
      `<div class="trace-card-head-main">`
      + `<div class="tc-title-line">`
      + `<span class="tc-n">#${traceTurn}</span>`
      + `<span class="tc-q" title="${escapeHtml(question)}">${escapeHtml(question)}</span>`
      + `</div>`
      + `<div class="tc-meta">${escapeHtml(apiLabel.toUpperCase())} · ${escapeHtml(j.target || "")} · ${t.rounds || 0} rounds</div>`
      + `</div>`
      + `<span class="tc-chevron" aria-hidden="true"></span>`;
    card.appendChild(head);

    const body = document.createElement("div");
    body.className = "trace-card-body";
    body.id = bodyId;

    const badgesHtml = contractSessionBadges(j, t);
    if (badgesHtml) {
      const badges = document.createElement("div");
      badges.className = "tc-badges";
      badges.innerHTML = badgesHtml;
      body.appendChild(badges);
    }

    body.appendChild(buildCardHeadStatsEl(t));

    const layerA = extractLayerA(j, t);
    const layerAEl = buildLayerAEl(layerA);
    if (layerAEl) body.appendChild(layerAEl);

    body.appendChild(buildMetricsRow(t));

    const wf = document.createElement("div");
    wf.innerHTML = waterfallHTML(t.spans, t.total_ms, t.steps);
    if (wf.firstChild) body.appendChild(wf.firstChild);

    const vbar = document.createElement("div");
    vbar.innerHTML = toolFrequencyChartHTML(t.steps, j.api_version || t.api_version || "v2");
    if (vbar.firstChild) body.appendChild(vbar.firstChild);

    const detailText = traceText(t);
    if (detailText) appendTextDetails(body, "Hash Traces", detailText);

    appendTraceDump(body, question, j, t, layerA);
    card.appendChild(body);

    head.addEventListener("click", () => {
      const collapsed = card.classList.toggle("is-collapsed");
      head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
    list.prepend(card);
    traceTotals.push(traceMetrics(t));
    while (list.children.length > TRACE_MAX_CARDS) {
      list.removeChild(list.lastChild);
      traceTotals.shift();
    }
    renderTraceTotal();
  }

  $("debug-toggle")?.addEventListener("click", toggleDebugPanel);
  $("debug-close")?.addEventListener("click", closeDebugPanel);
  $("trace-copy-full")?.addEventListener("click", () => {
    const shown = activeTraceEntries.slice(-TRACE_MAX_CARDS);
    if (!shown.length) {
      showToast("No trace to copy yet", "warning");
      return;
    }
    navigator.clipboard.writeText(prettyJSON({ chat_id: chatId, traces: shown })).then(() => showToast("Trace copied"));
  });

  updateDebugTitle(latestSessionId);

  const versionEl = $("debug-panel-version");
  if (versionEl) {
    const ver = getWidgetVersion();
    versionEl.textContent = ver.startsWith("v") ? ver : `v${ver}`;
    versionEl.setAttribute("title", `zeus_client_chat_trace ${ver}`);
  }

  const readyToolOrder = loadToolOrder();

  return {
    appendTraceCard,
    openDebugPanel,
    closeDebugPanel,
    setToolOrder: applyToolOrder,
    readyToolOrder,
    version: getWidgetVersion(),
  };
}