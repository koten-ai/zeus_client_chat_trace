import { zeusFetch } from "./config.js";
import { loadJsnview } from "./jsnview-loader.js";

export function initZeusTrace(root, config = {}) {
  const $ = (id) => root.querySelector(`#${id}`);

  const TRACE_MAX_CARDS = 12;
  let CHART_ORDER = { v1: [], v2: [] };
  let activeTraceEntries = [];
  let traceTurn = 0;
  const traceTotals = [];
  let chatId = null;

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

  function apiValue(v) {
    return String(v || "v1").toLowerCase() === "v2" ? "v2" : "v1";
  }

  async function loadToolOrder() {
    if (!config.zeusApiUrl) {
      CHART_ORDER = { v1: [], v2: [] };
      return;
    }
    try {
      CHART_ORDER = await (await zeusFetch("/api/tool-order", config)).json();
    } catch {
      CHART_ORDER = { v1: [], v2: [] };
    }
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
      const cls = cstatus === "match" ? "badge-success" : cstatus === "drift" ? "badge-warning" : "badge-ghost";
      html += `<span class="badge badge-sm ${cls}">contract:${escapeHtml(cstatus)}</span>`;
    }
    if (cid) html += `<span class="badge badge-sm badge-info">${escapeHtml(shortId(cid, 14))}</span>`;
    if (sdisabled) html += `<span class="badge badge-sm badge-ghost">sessions: off</span>`;
    else if (serr) html += `<span class="badge badge-sm badge-error">session: failed</span>`;
    else if (sid) {
      const r = sround ? ` r${sround}` : "";
      html += `<span class="badge badge-sm badge-ghost">sess:${escapeHtml(shortId(sid))}${r}</span>`;
    }
    return html;
  }

  function traceMetrics(t) {
    let aiMs = 0, zeusMs = 0, tokens = 0, bytes = 0;
    (t.steps || []).forEach((s) => {
      if (s.type === "llm" || s.type === "llm_error") aiMs += s.ms || 0;
      if (s.type === "tool") {
        zeusMs += s.ms || 0;
        bytes += s.bytes || 0;
      }
      if (s.usage && s.usage.total_tokens) tokens += s.usage.total_tokens;
    });
    const total = t.total_ms || aiMs + zeusMs;
    const other = Math.max(0, total - aiMs - zeusMs);
    return { total, aiMs, zeusMs, other, tokens, bytes };
  }

  function buildMetricsRow(t) {
    const m = traceMetrics(t);
    const sum = m.total || 1;
    const pct = (n) => Math.round(n / sum * 100);
    const el = document.createElement("div");
    el.className = "msg-metrics";
    el.innerHTML =
      `<span class="mm-bar">`
      + `<i class="mm-ai" style="width:${(m.aiMs / sum * 100).toFixed(1)}%"></i>`
      + `<i class="mm-zeus" style="width:${(m.zeusMs / sum * 100).toFixed(1)}%"></i>`
      + `<i class="mm-other" style="width:${(m.other / sum * 100).toFixed(1)}%"></i>`
      + `</span>`
      + `<span class="mm-total">${fmtMs(m.total)}</span><span class="mm-sep">=</span>`
      + `<span class="mm-ai">${fmtMs(m.aiMs)}/${pct(m.aiMs)}% AI</span><span class="mm-sep">+</span>`
      + `<span class="mm-zeus">${fmtMs(m.zeusMs)}/${pct(m.zeusMs)}% Zeus</span><span class="mm-sep">+</span>`
      + `<span class="mm-other">${fmtMs(m.other)}/${pct(m.other)}% Other</span>`
      + `<span class="mm-sep">·</span><span class="mm-meta">Tokens: ${m.tokens || "?"}</span>`
      + `<span class="mm-sep">·</span><span class="mm-meta">Bytes: ${fmtBytes(m.bytes)}</span>`;
    return el;
  }

  function renderTraceTotal() {
    const el = $("trace-total");
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
        bytes: acc.bytes + m.bytes,
      }),
      { total: 0, aiMs: 0, zeusMs: 0, other: 0, tokens: 0, bytes: 0 }
    );
    const sum = a.total || 1;
    el.style.display = "flex";
    el.innerHTML =
      `<span class="tt-label">TOTAL · ${traceTotals.length} turn${traceTotals.length === 1 ? "" : "s"}</span>`
      + `<span class="mm-bar">`
      + `<i class="mm-ai" style="width:${(a.aiMs / sum * 100).toFixed(1)}%"></i>`
      + `<i class="mm-zeus" style="width:${(a.zeusMs / sum * 100).toFixed(1)}%"></i>`
      + `<i class="mm-other" style="width:${(a.other / sum * 100).toFixed(1)}%"></i>`
      + `</span>`
      + `<span class="mm-total">${fmtMs(a.total)}</span>`;
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
      html +=
        `<div class="${labCls}" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>`
        + `<div class="tw-track"><i class="${s.cls}" style="left:${left.toFixed(2)}%;width:${w.toFixed(2)}%"></i></div>`
        + `<div class="tw-dur">${s.ms || 0} ms</div>`;
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
      if (s.type === "llm") {
        lines.push(`[r${s.round}] LLM ${s.ms || 0}ms → ${s.finish_reason || ""} calls=[${(s.tool_calls || []).join(", ")}]`);
      } else if (s.type === "tool") {
        lines.push(`[r${s.round}] TOOL ${s.name} → ${s.status} ${s.ms}ms`);
      }
    });
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

  function appendTextDetails(parent, title, text) {
    const root = document.createElement("details");
    root.className = "collapse collapse-plus trace-dump bg-base-200 rounded border border-base-300";
    const titleEl = document.createElement("summary");
    titleEl.className = "collapse-title text-xs font-bold py-2";
    titleEl.textContent = title;
    const content = document.createElement("div");
    content.className = "collapse-content";
    const pre = document.createElement("pre");
    pre.className = "trace-pre bg-base-300 rounded p-2 mt-1";
    pre.textContent = text;
    content.appendChild(pre);
    root.append(titleEl, content);
    parent.appendChild(root);
  }

  async function appendJSONDetails(parent, title, obj, open) {
    const root = document.createElement("details");
    root.className = "collapse collapse-plus trace-dump bg-base-200 rounded border border-base-300";
    if (open) root.open = true;
    const titleEl = document.createElement("summary");
    titleEl.className = "collapse-title text-xs font-bold py-2";
    titleEl.textContent = title;
    const content = document.createElement("div");
    content.className = "collapse-content";
    const viewerHost = document.createElement("div");
    viewerHost.className = "trace-dump-viewer";
    content.appendChild(viewerHost);
    root.append(titleEl, content);
    parent.appendChild(root);
    await mountJsnviewViewer(viewerHost, obj, open);
  }

  async function appendTraceDump(card, question, j, t) {
    const wrap = document.createElement("div");
    wrap.className = "trace-dump-wrap";
    await appendJSONDetails(wrap, `AI requests · ${(t.ai_requests || []).length}`, t.ai_requests || []);
    await appendJSONDetails(wrap, `Tool calls · ${(t.tool_calls || []).length}`, t.tool_calls || [], true);
    await appendJSONDetails(wrap, "Raw turn bundle", { question, answer: j.answer, trace: t });
    card.appendChild(wrap);
  }

  function appendTraceCard(question, j) {
    const t = j.trace;
    if (!t) return;
    chatId = j.chat_id || chatId;
    if (!activeTraceEntries.includes(j)) activeTraceEntries.push(j);
    const list = $("trace-list");
    const empty = $("trace-empty");
    if (empty) empty.remove();
    traceTurn++;

    const card = document.createElement("div");
    card.className = "trace-card";
    const head = document.createElement("div");
    head.className = "trace-card-head";
    head.innerHTML =
      `<span class="tc-n">#${traceTurn}</span>`
      + `<span class="tc-q" title="${escapeHtml(question)}">${escapeHtml(question)}</span>`
      + `<span class="tc-meta">${escapeHtml((j.api_version || "v2").toUpperCase())} · ${escapeHtml(j.target || "")} · ${t.rounds || 0} rounds</span>`
      + (contractSessionBadges(j, t) ? `<span class="tc-badges">${contractSessionBadges(j, t)}</span>` : "");
    card.appendChild(head);
    card.appendChild(buildMetricsRow(t));

    const wf = document.createElement("div");
    wf.innerHTML = waterfallHTML(t.spans, t.total_ms, t.steps);
    if (wf.firstChild) card.appendChild(wf.firstChild);

    const vbar = document.createElement("div");
    vbar.innerHTML = toolFrequencyChartHTML(t.steps, j.api_version || t.api_version);
    if (vbar.firstChild) card.appendChild(vbar.firstChild);

    const detailText = traceText(t);
    if (detailText) appendTextDetails(card, "Hash Traces", detailText);

    appendTraceDump(card, question, j, t);
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

  loadToolOrder();

  return { appendTraceCard, openDebugPanel, closeDebugPanel };
}