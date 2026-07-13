import { parseToolOrder, zeusFetch } from "./config.js";
import { loadJsnview } from "./jsnview-loader.js";

export function initZeusTrace(root, config = {}) {
  const $ = (id) => root.querySelector(`#${id}`);

  const TRACE_MAX_CARDS = 12;
  let CHART_ORDER = parseToolOrder(config.toolOrder) ?? { v1: [], v2: [] };
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

  async function appendTraceDump(card, question, j, t) {
    const wrap = document.createElement("div");
    wrap.className = "trace-dump-wrap";
    // Attach immediately so dump titles stay visible even if jsnview hangs/fails.
    card.appendChild(wrap);

    const aiReqs = t.ai_requests || [];
    const aiResps = t.ai_responses || [];
    const toolCalls = t.tool_calls || [];

    // Mount dumps in parallel; each section already has a sync title + fallback pre.
    await Promise.all([
      appendJSONDetails(wrap, `AI requests · ${roundLabel(aiReqs)}`, aiReqs),
      appendJSONDetails(wrap, `AI responses · ${roundLabel(aiResps)}`, aiResps),
      appendJSONDetails(wrap, `Tool calls · ${toolCalls.length}`, toolCalls, toolCalls.length > 0),
      appendJSONDetails(wrap, "Raw turn bundle", {
        question,
        answer: j.answer,
        target: j.target,
        api_version: j.api_version || t.api_version,
        session_id: j.session_id,
        session_round: j.session_round,
        contract_status: j.contract_status,
        trace: t,
      }),
    ]);
  }

  function appendTraceCard(question, j) {
    const t = j.trace;
    if (!t) return;
    applyToolOrder(j.tool_order);
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
      + `<span class="tc-meta">${escapeHtml(apiValue(j.api_version || t.api_version).toUpperCase())} · ${escapeHtml(j.target || "")} · ${t.rounds || 0} rounds</span>`
      + (contractSessionBadges(j, t) ? `<span class="tc-badges">${contractSessionBadges(j, t)}</span>` : "");
    card.appendChild(head);
    card.appendChild(buildMetricsRow(t));

    const wf = document.createElement("div");
    wf.innerHTML = waterfallHTML(t.spans, t.total_ms, t.steps);
    if (wf.firstChild) card.appendChild(wf.firstChild);

    const vbar = document.createElement("div");
    vbar.innerHTML = toolFrequencyChartHTML(t.steps, j.api_version || t.api_version || "v2");
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

  const readyToolOrder = loadToolOrder();

  return {
    appendTraceCard,
    openDebugPanel,
    closeDebugPanel,
    setToolOrder: applyToolOrder,
    readyToolOrder,
  };
}