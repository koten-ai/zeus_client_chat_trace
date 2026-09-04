/**
 * Turn traces inspector panel (DaisyUI Detective IA).
 * Ported from zeus_client/static/trace_panel.js — queries scoped to a root
 * (Shadow DOM overlay or docked host).
 */
import * as helpers from "./helpers.js";
import { coerceTraceEntry, normalizeTurnEntry } from "./normalize.js";

const H = () => helpers;
const TRACE_MAX = 12;

export function createTracePanel(root) {
  if (!root) throw new Error("createTracePanel requires a root element");

  let opts = {
    getClientVersion: () => "",
    getHubBase: () => "",
    getChatId: () => null,
    getChartOrder: () => ({ v1: [], v2: [] }),
    showToast: (msg) => console.log(msg),
  };

  let entries = []; // raw entry objects newest last
  let selectedKey = null;
  let tab = "overview";
  let hopSel = 0;
  let llmRound = 0;
  let lastAutoTabKey = null;
  let inited = false;
  let jobMode = false;
  let unitSel = 0;

  function el(id) {
    return root.querySelector("#" + id);
  }

  function esc(s) {
    return (H().escapeHtml || ((x) => String(x)))(s);
  }

  const ICON_PATHS = {
    external:
      "M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25",
    star: "M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z",
    check: "M4.5 12.75 9 17.25 19.5 6.75",
  };

  function iconSvg(name) {
    const d = ICON_PATHS[name];
    if (!d) return "";
    return (
      '<span class="inline-block w-4 h-4 shrink-0" aria-hidden="true">' +
      '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="' +
      d +
      '" /></svg></span>'
    );
  }

  function badgeFor(st) {
    const s = String(st || "").toLowerCase();
    let tone = "badge-ghost";
    if (s === "ok" || s === "pass") tone = "badge-success";
    else if (s === "warn") tone = "badge-warning";
    else if (s === "err" || s === "fail" || s === "error" || s === "bad") tone = "badge-error";
    else if (s === "info") tone = "badge-info";
    return "badge badge-sm " + tone;
  }

  function copyChip(value, n) {
    if (!value) return "";
    return (
      '<button type="button" class="btn btn-ghost btn-xs font-mono tt-id" data-copy="' +
      esc(value) +
      '" title="Click to copy">' +
      esc(shortId(value, n || 14)) +
      "</button>"
    );
  }

  function isCopyableIdKey(key) {
    return [
      "req_id",
      "session_id",
      "chat_id",
      "turn_id",
      "call_id",
      "job_id",
      "preferred_req_id",
    ].includes(String(key || ""));
  }

  function valueCell(key, value) {
    if (isCopyableIdKey(key) && value) return copyChip(value, 40);
    return esc(value);
  }

  function sepDot() {
    return '<span class="tt-sep" aria-hidden="true">·</span>';
  }

  function fmtMs(ms) {
    return (H().fmtMs || ((m) => m + "ms"))(ms);
  }

  function fmtBytes(b) {
    return (H().fmtBytes || ((x) => x + "B"))(b);
  }

  function shortId(s, n) {
    return (H().shortId || ((x) => String(x || "")))(s, n);
  }

  function prettyJSON(x) {
    return (H().prettyJSON || JSON.stringify)(x, null, 2);
  }

  function tryParse(raw) {
    if (H().tryParseJSON) return H().tryParseJSON(raw);
    if (raw == null) return null;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function toast(msg, type) {
    try {
      opts.showToast(msg, type || "success");
    } catch (e) {
      /* ignore */
    }
  }

  function markCopied(el) {
    if (!el || !el.classList) return;
    el.classList.add("is-copied");
    clearTimeout(el._copiedTimer);
    el._copiedTimer = setTimeout(() => {
      try {
        el.classList.remove("is-copied");
      } catch (e) {
        /* ignore */
      }
    }, 1400);
  }

  function copyText(text, sourceEl) {
    const s = String(text == null ? "" : text);
    if (!s) {
      toast("Nothing to copy", "warning");
      return;
    }
    const run = H().copyToClipboard
      ? H().copyToClipboard(s)
      : Promise.resolve().then(() => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(s).then(
              () => true,
              () => false
            );
          }
          return false;
        });
    Promise.resolve(run).then(
      (ok) => {
        if (ok) {
          markCopied(sourceEl);
          toast("copied " + shortId(s, 28));
        } else {
          toast("Copy failed", "error");
        }
      },
      () => toast("Copy failed", "error")
    );
  }

  function jobEntry() {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      const t = (e && e.trace) || {};
      if (H().isMultiAgentTrace ? H().isMultiAgentTrace(t, e) : t.multi_agent) return e;
    }
    return null;
  }

  function jobUnits(entry) {
    const e = entry || jobEntry() || {};
    const fn = H().extractJobUnits;
    return fn ? fn(e.trace || {}, e) : [];
  }

  function selectedUnit(units) {
    const list = units || jobUnits();
    if (!list.length) return null;
    if (unitSel < 0 || unitSel >= list.length) unitSel = 0;
    return list[unitSel];
  }

  function applyJobChrome(on) {
    const title = root.querySelector(".tt-title");
    if (title) title.textContent = on ? "Job traces" : "Turn traces";
    const empty = el("tt-empty");
    if (empty && !entries.length) empty.textContent = on ? "No job run yet." : "No turn run yet.";
    const label = el("tt-turn-picker-label");
    if (label) label.textContent = on ? "Unit" : "Turn";
    const list = el("tt-turns");
    if (list) list.setAttribute("aria-label", on ? "Units" : "Turns");
    root.querySelectorAll(".tt-tab[data-job], .tt-tab[data-turn]").forEach((b) => {
      const jobOnly = b.hasAttribute("data-job") && !b.hasAttribute("data-turn");
      const turnOnly = b.hasAttribute("data-turn") && !b.hasAttribute("data-job");
      b.hidden = (jobOnly && !on) || (turnOnly && on);
    });
    const panelEl = el("tt-panel");
    if (panelEl) panelEl.classList.toggle("tt-job-mode", !!on);
  }

  function setJobMode(on) {
    const next = !!on;
    if (jobMode === next) {
      applyJobChrome(jobMode);
      return;
    }
    jobMode = next;
    unitSel = 0;
    hopSel = 0;
    llmRound = 0;
    lastAutoTabKey = null;
    tab = "overview";
    applyJobChrome(jobMode);
    wireOnce();
    render();
  }

  function viewModels() {
    // newest first for display
    const list = entries.map((e, i) => normalizeTurnEntry(e, i)).reverse();
    return list;
  }

  function selectedVm() {
    const vms = viewModels();
    if (!vms.length) return null;
    return vms.find((v) => v.key === selectedKey) || vms[0];
  }

  function closeTurnDropdown() {
    const d = el("tt-turn-dropdown");
    if (d) d.open = false;
    const s = el("tt-turn-summary");
    if (s) s.setAttribute("aria-expanded", "false");
  }

  function syncTurnTrigger(info) {
    const n = el("tt-pick-n");
    const q = el("tt-pick-q");
    const meta = el("tt-pick-meta");
    const dot = el("tt-pick-dot");
    const err = el("tt-pick-err");
    if (!info) {
      if (n) n.textContent = "";
      if (q) q.textContent = jobMode ? "Select a unit" : "Select a turn";
      if (meta) meta.textContent = "";
      if (dot) dot.className = "dot";
      if (err) err.hidden = true;
      return;
    }
    if (n) n.textContent = info.n || "";
    if (q) q.textContent = info.question || "";
    if (meta) meta.textContent = info.meta || "";
    const status = info.status || "ok";
    if (dot) dot.className = "dot" + (status === "ok" ? " ok" : " " + status);
    if (err) {
      err.hidden = !info.errLabel;
      err.textContent = info.errLabel || "";
      err.className =
        "badge badge-xs shrink-0 " + (status === "err" ? "badge-error" : "badge-warning");
    }
  }

  function hubBase() {
    try {
      const raw = String(opts.getHubBase() || "");
      const norm = H().normalizeHubBase;
      return norm ? norm(raw) : raw.replace(/\/$/, "");
    } catch (e) {
      return "";
    }
  }

  function hubSessionUrl(sid) {
    const build = H().hubDebugSessionUrl;
    if (build) {
      try {
        return build(opts.getHubBase() || "", sid);
      } catch (e) {
        return "";
      }
    }
    return "";
  }

  function hubReqUrl(rid) {
    const build = H().hubDebugReqUrl;
    if (build) {
      try {
        return build(opts.getHubBase() || "", rid);
      } catch (e) {
        return "";
      }
    }
    return "";
  }

  function openExternal(url) {
    if (!url) {
      toast("Set ZeusTraceConfig.hubBaseUrl to open Detective", "warning");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function setTab(name) {
    tab = name;
    root.querySelectorAll(".tt-tab").forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle("on", on);
      b.classList.toggle("tab-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    root.querySelectorAll(".tt-tab-panel").forEach((p) => {
      p.classList.toggle("on", p.id === "tt-panel-" + name);
    });
  }

  function renderHeader(count) {
    const n = jobMode ? jobUnits().length : count;
    const hasRequest = n > 0;
    const countEl = el("tt-turn-count");
    if (countEl) {
      if (jobMode) {
        countEl.textContent = n + " unit" + (n === 1 ? "" : "s");
      } else {
        countEl.textContent = n + " turn" + (n === 1 ? "" : "s");
      }
      countEl.hidden = !hasRequest;
    }
    const actions = root.querySelector("#tt-panel .tt-hdr-actions");
    if (actions) actions.hidden = !hasRequest;
  }

  function renderJobBar(entry, units) {
    const bar = el("tt-session");
    if (!bar) return;
    const e = entry || {};
    const t = e.trace || {};
    const jobId = t.job_id || e.job_id || "";
    const pack = t.pack || e.pack || "";
    const engine = t.engine || e.engine || "local_units";
    const status = t.status || e.status || "";
    const stCls = status === "ok" ? "ok" : status === "partial" ? "warn" : status ? "err" : "info";
    bar.hidden = false;
    bar.innerHTML =
      "<span>job</span>" +
      (jobId
        ? copyChip(jobId, 40)
        : '<span class="tt-muted">—</span>') +
      '<span class="tt-sep">·</span>' +
      (pack ? "<span>pack <strong>" + esc(pack) + "</strong></span>" : '<span class="tt-muted">no pack</span>') +
      '<span class="tt-sep">·</span><span>engine ' +
      esc(engine) +
      "</span>" +
      (status
        ? '<span class="tt-sep">·</span><span class="tt-badge ' + stCls + '">' + esc(status) + "</span>"
        : "") +
      '<span class="tt-sep">·</span><span>' +
      (units ? units.length : 0) +
      " units · isolated · no shared session</span>";
  }

  function renderSession(vm) {
    const bar = el("tt-session");
    if (!bar) return;
    if (
      !vm ||
      (!vm.session_id &&
        !vm.preferred_req_id &&
        !vm.contract_status &&
        !(vm.gather && vm.gather.length) &&
        !(vm.semanticCache && vm.semanticCache.length) &&
        !(vm.stamp && vm.stamp.user))
    ) {
      bar.hidden = true;
      bar.innerHTML = "";
      return;
    }
    bar.hidden = false;
    const cs = vm.contract_status || "";
    const csCls =
      cs === "match" ? "ok" : cs === "drift" ? "warn" : "info";
    const hub = hubSessionUrl(vm.session_id);
    const cacheNote = (vm.semanticCache && vm.semanticCache[0]) || "";
    const cacheKind = cacheNote.includes("recall")
      ? "recall"
      : cacheNote.includes("write")
        ? "write"
        : cacheNote.includes("probe")
          ? "probe"
          : cacheNote
            ? "on"
            : "";
    bar.innerHTML =
      "<span>Session</span>" +
      (vm.session_id
        ? copyChip(vm.session_id, 14)
        : "<span class=\"tt-muted\">—</span>") +
      '<span class="tt-sep">·</span>' +
      (vm.session_round != null
        ? "<span>round <strong>" + esc(String(vm.session_round)) + "</strong></span>"
        : "<span class=\"tt-muted\">round —</span>") +
      (cs
        ? '<span class="tt-sep">·</span><span class="tt-badge ' +
          csCls +
          '">contract:' +
          esc(cs) +
          "</span>"
        : "") +
      (vm.preferred_req_id
        ? '<span class="tt-sep">·</span><span>preferred</span>' +
          copyChip(vm.preferred_req_id, 14)
        : "") +
      (hub
        ? '<span class="tt-sep">·</span><a class="tt-link" href="' +
          esc(hub) +
          '" target="_blank" rel="noopener">Hub session</a>'
        : '<span class="tt-sep">·</span><button type="button" class="tt-linkish" data-action="hub-missing">Hub session</button>') +
      (vm.gather && vm.gather.length
        ? '<span class="tt-sep">·</span><span class="tt-badge info">gather 9</span>'
        : "") +
      (cacheKind
        ? '<span class="tt-sep">·</span><span class="tt-badge info" title="' +
          esc(cacheNote) +
          '">cache:' +
          esc(cacheKind) +
          "</span>"
        : "") +
      (vm.stamp && vm.stamp.user
        ? '<span class="tt-sep">·</span><span class="tt-muted">user ' +
          esc(String(vm.stamp.user)) +
          "</span>"
        : "");
  }

  function renderUnitList(units) {
    const host = el("tt-turns");
    if (!host) return;
    host.innerHTML = "";
    if (!units.length) {
      host.innerHTML = '<div class="tt-empty-inline">No units</div>';
      syncTurnTrigger(null);
      return;
    }
    units.forEach((u, i) => {
      const tags = [];
      tags.push('<span class="tt-turn-tag">' + esc(u.kind) + "</span>");
      if (u.synth) tags.push('<span class="tt-turn-tag synth">synth</span>');
      else tags.push('<span class="tt-turn-tag">isolated</span>');
      tags.push('<span class="tt-turn-tag">' + (u.req_ids || []).length + " req</span>");
      if (u.error_code) tags.push('<span class="tt-turn-tag err">' + esc(u.error_code) + "</span>");
      const div = document.createElement("button");
      div.type = "button";
      div.className = "tt-turn-item" + (i === unitSel ? " active" : "");
      div.setAttribute("role", "option");
      div.setAttribute("aria-selected", i === unitSel ? "true" : "false");
      div.innerHTML =
        '<div class="row1">' +
        '<span class="dot ' +
        esc(u.status) +
        '" aria-hidden="true"></span>' +
        '<span class="n">' +
        esc(u.unit_id) +
        "</span>" +
        '<span class="meta">w' +
        esc(String(u.wave)) +
        "</span></div>" +
        '<div class="q">' +
        esc(u.goal || u.answer || u.unit_id) +
        "</div>" +
        '<div class="row3">' +
        tags.join("") +
        "</div>";
      const select = () => {
        unitSel = i;
        hopSel = 0;
        llmRound = 0;
        closeTurnDropdown();
        render();
      };
      div.onclick = select;
      div.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      };
      host.appendChild(div);
    });
    const u = selectedUnit(units);
    if (u) {
      syncTurnTrigger({
        n: u.unit_id,
        question: u.goal || u.answer || u.unit_id,
        meta: "w" + String(u.wave) + " · " + (u.req_ids || []).length + " req",
        status: u.status === "ok" ? "ok" : u.status,
        errLabel: u.error_code || (u.status === "err" ? "err" : ""),
      });
    } else {
      syncTurnTrigger(null);
    }
  }

  function renderTurnList(vms) {
    const host = el("tt-turns");
    if (!host) return;
    host.innerHTML = "";
    if (!vms.length) {
      host.innerHTML = '<div class="tt-empty-inline">No turns</div>';
      syncTurnTrigger(null);
      return;
    }
    vms.forEach((vm) => {
      const num = vm.index + 1;
      const rounds = vm.llmRounds.length || vm.trace.rounds || 0;
      const statusCls = vm.status === "ok" ? "ok" : vm.status;
      const tags = [];
      if (vm.mode) {
        tags.push('<span class="tt-turn-tag">' + esc(vm.mode) + "</span>");
      }
      if (vm.target) {
        tags.push(
          '<span class="tt-turn-tag">' + esc(shortId(vm.target, 28)) + "</span>"
        );
      }
      if (vm.errCount) {
        tags.push(
          '<span class="tt-turn-tag err">' + vm.errCount + " err</span>"
        );
      }
      const active = vm.key === selectedKey;
      const div = document.createElement("button");
      div.type = "button";
      div.className = "tt-turn-item" + (active ? " active" : "");
      div.dataset.key = vm.key;
      div.setAttribute("role", "option");
      div.setAttribute("aria-selected", active ? "true" : "false");
      div.innerHTML =
        '<div class="row1">' +
        '<span class="dot ' +
        esc(statusCls) +
        '" aria-hidden="true"></span>' +
        '<span class="n">#' +
        num +
        "</span>" +
        '<span class="dur">' +
        esc(fmtMs(vm.metrics.total)) +
        "</span>" +
        '<span class="meta">' +
        rounds +
        "r · " +
        vm.toolsCount +
        " tools</span></div>" +
        '<div class="q">' +
        esc(vm.question) +
        "</div>" +
        (tags.length ? '<div class="row3">' + tags.join("") + "</div>" : "");
      const select = () => {
        selectedKey = vm.key;
        hopSel = 0;
        llmRound = 0;
        closeTurnDropdown();
        render();
      };
      div.onclick = select;
      div.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      };
      host.appendChild(div);
    });
    const sel = vms.find((v) => v.key === selectedKey) || vms[0];
    if (sel) {
      const rounds = sel.llmRounds.length || sel.trace.rounds || 0;
      syncTurnTrigger({
        n: "#" + (sel.index + 1),
        question: sel.question,
        meta: fmtMs(sel.metrics.total) + " · " + rounds + "r · " + sel.toolsCount + " tools",
        status: sel.status === "ok" ? "ok" : sel.status,
        errLabel: sel.errCount ? sel.errCount + " err" : "",
      });
    } else {
      syncTurnTrigger(null);
    }
  }

  function renderUnitHead(u) {
    const head = el("tt-detail-head");
    if (!head) return;
    if (!u) {
      head.innerHTML = "";
      return;
    }
    head.innerHTML =
      '<div class="tt-d-title">' +
      esc(u.goal || u.unit_id) +
      "</div>" +
      '<div class="tt-metrics">' +
      '<div class="metric"><div class="k">Unit</div><div class="v">' +
      esc(u.unit_id) +
      "</div></div>" +
      '<div class="metric"><div class="k">Hops</div><div class="v">' +
      (u.hops || []).length +
      '</div><div class="v sub">' +
      (u.req_ids || []).length +
      " req_id</div></div>" +
      '<div class="metric"><div class="k">LLM</div><div class="v">' +
      (u.llm || []).length +
      "r</div></div>" +
      '<div class="metric"><div class="k">Status</div><div class="v"><span class="tt-badge ' +
      (u.status === "ok" ? "ok" : "err") +
      '">' +
      esc(u.error_code || u.status) +
      "</span></div></div></div>";
    const hc = el("tt-hop-count");
    if (hc) hc.textContent = String((u.hops || []).length);
  }

  function catalogChipsHTML(vm) {
    const cat = vm.catalog || {};
    const inj = vm.inject || {};
    const chips = [];
    const mini = cat.has_mini_schema === true || inj.has_mini_schema === true;
    const brief = cat.has_scope_brief === true || inj.has_scope_brief === true;
    chips.push(
      '<span class="tt-turn-tag">' + (mini ? "MINI yes" : "MINI no") + "</span>"
    );
    chips.push(
      '<span class="tt-turn-tag">' + (brief ? "BRIEF yes" : "BRIEF no") + "</span>"
    );
    if (cat.base_id) chips.push('<span class="tt-turn-tag">' + esc(String(cat.base_id)) + "</span>");
    if (cat.client_floor) {
      chips.push('<span class="tt-turn-tag">floor-' + esc(String(cat.client_floor)) + "</span>");
    }
    if (!chips.length) return "";
    return '<div class="tt-chip-row">' + chips.join("") + "</div>";
  }

  function renderDetailHead(vm) {
    const head = el("tt-detail-head");
    if (!head || !vm) {
      if (head) head.innerHTML = "";
      return;
    }
    const m = vm.metrics;
    const sum = m.total || 1;
    head.innerHTML =
      '<div class="tt-d-title">' +
      esc(vm.question) +
      "</div>" +
      '<div class="tt-metrics">' +
      '<div class="metric"><div class="k">Wall</div><div class="v">' +
      esc(fmtMs(m.total)) +
      '</div><div class="mm-bar"><i class="ai" style="width:' +
      ((m.aiMs / sum) * 100).toFixed(1) +
      '%"></i><i class="zeus" style="width:' +
      ((m.zeusMs / sum) * 100).toFixed(1) +
      '%"></i><i class="other" style="width:' +
      ((m.other / sum) * 100).toFixed(1) +
      '%"></i></div></div>' +
      '<div class="metric"><div class="k">AI / Zeus</div><div class="v">' +
      esc(fmtMs(m.aiMs)) +
      ' <span class="sub">/ ' +
      esc(fmtMs(m.zeusMs)) +
      "</span></div></div>" +
      '<div class="metric"><div class="k">Tokens</div><div class="v">' +
      esc((H().fmtTokens || ((n) => (n ? Number(n).toLocaleString() : "?")))(m.tokens)) +
      '</div><div class="v sub" title="Sum of usage.total_tokens across all billed LLM calls (llm + force_final), not a single round">' +
      (function () {
        const calls = (vm.llmRounds && vm.llmRounds.length) || 0;
        const rounds = vm.trace.rounds || 0;
        const bits = [];
        if (m.hasIn || m.tokensIn) bits.push("in " + (H().fmtTokens ? H().fmtTokens(m.tokensIn) : m.tokensIn));
        if (m.hasOut || m.tokensOut) bits.push("out " + (H().fmtTokens ? H().fmtTokens(m.tokensOut) : m.tokensOut));
        if (m.tokensCached) bits.push("cached " + Number(m.tokensCached).toLocaleString());
        if (calls > 0) {
          bits.push(calls + (calls === 1 ? " LLM call" : " LLM calls"));
          if (rounds > 0 && rounds !== calls) bits.push(rounds + " rounds");
        } else {
          bits.push((rounds || 0) + " rounds");
        }
        return bits.join(" · ");
      })() +
      "</div></div>" +
      '<div class="metric"><div class="k">Turn ID</div><div class="v sub mono" data-copy="' +
      esc(vm.turn_id || "") +
      '" title="Click to copy">' +
      esc(vm.turn_id ? shortId(vm.turn_id, 16) : "—") +
      "</div></div></div>" +
      catalogChipsHTML(vm);
    const hc = el("tt-hop-count");
    if (hc) hc.textContent = String(vm.hops.length);
  }

  function needsDiagnosis(vm) {
    if (!vm) return false;
    if (vm.status !== "ok") return true;
    if (vm.grade === "warn" || vm.grade === "fail") return true;
    if (vm.errCount > 0) return true;
    if (vm.playbooks && vm.playbooks.length) return true;
    return false;
  }

  function supportPack(vm) {
    return (
      "# Support pack\n" +
      "**Headline:** " +
      (vm.headline || "(none)") +
      "\n" +
      "**Grade:** " +
      (vm.grade || vm.status) +
      "\n" +
      "**turn_id:** " +
      (vm.turn_id || "") +
      "\n" +
      "**session_id:** " +
      (vm.session_id || "") +
      "\n" +
      "**preferred_req_id:** " +
      (vm.preferred_req_id || "") +
      "\n" +
      "**Playbooks:** " +
      (vm.playbooks.map((p) => p.id).join(", ") || "none") +
      "\n" +
      "**Question:** " +
      (vm.question || "") +
      "\n"
    );
  }

  function renderDiagnosis(vm) {
    const box = el("tt-diagnosis");
    if (!box) return;
    if (!vm || !needsDiagnosis(vm)) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.className =
      "tt-diagnosis alert mx-3 mt-2 shrink-0 " +
      (vm.grade === "fail" || vm.status === "err"
        ? "alert-error fail"
        : "alert-warning warn");
    const grade = vm.grade || vm.status;
    // One inner wrapper: DaisyUI .alert is a column-grid (icon | copy | actions).
    // Four stacked children would stretch into a full-panel yellow slab.
    box.innerHTML =
      '<div class="tt-diagnosis-body">' +
      '<div class="eyebrow">' +
      '<span class="tt-badge ' +
      (grade === "fail" || grade === "err" ? "err" : "warn") +
      '">diagnosis ' +
      esc(grade) +
      "</span>" +
      "<span>" +
      vm.hops.length +
      " hops · " +
      (vm.llmRounds.length || 0) +
      " rounds</span></div>" +
      "<h3>" +
      esc(vm.headline || "Turn needs attention") +
      "</h3>" +
      (vm.overview
        ? '<p class="detail">' + esc(vm.overview) + "</p>"
        : "") +
      (vm.session_error
        ? '<p class="detail">Session error: ' +
          esc(String(vm.session_error).slice(0, 240)) +
          "</p>"
        : "") +
      '<div class="tt-diagnosis-actions">' +
      (vm.turn_id
        ? '<span class="idchip" data-copy="' +
          esc(vm.turn_id) +
          '" title="Click to copy"><b>turn</b> ' +
          esc(shortId(vm.turn_id, 14)) +
          "</span>"
        : "") +
      (vm.session_id
        ? '<span class="idchip" data-copy="' +
          esc(vm.session_id) +
          '" title="Click to copy"><b>session</b> ' +
          esc(shortId(vm.session_id, 14)) +
          "</span>"
        : "") +
      (vm.preferred_req_id
        ? '<span class="idchip" data-copy="' +
          esc(vm.preferred_req_id) +
          '" title="Click to copy"><b>preferred</b> ' +
          esc(shortId(vm.preferred_req_id, 14)) +
          "</span>"
        : "") +
      '<button type="button" class="btn btn-xs btn-primary" data-action="open-pref">Open preferred hop</button>' +
      '<button type="button" class="btn btn-xs" data-action="copy-pack" title="Click to copy">Copy support pack</button>' +
      "</div></div>";
  }

  function renderTimeline(vm) {
    const panel = el("tt-panel-timeline");
    if (!panel || !vm) return;
    const wf = (H().waterfallHTML || (() => ""))(
      vm.spans,
      vm.metrics && vm.metrics.total,
      vm.steps
    );
    const kpis = H().timelineSpeedKpiHTML ? H().timelineSpeedKpiHTML(vm) : "";
    const chart = (H().toolFrequencyChartHTML || (() => ""))(
      vm.steps,
      vm.api_version,
      opts.getChartOrder()
    );
    panel.innerHTML =
      '<div class="tt-waterfall-host">' +
      '<h2 class="text-base font-semibold m-0 mb-2">Spans waterfall</h2>' +
      kpis +
      (wf || '<div class="tt-empty-inline">No spans for this turn.</div>') +
      "</div>" +
      (chart
        ? '<details class="tt-fold"><summary>Tool-call frequency</summary>' +
          chart +
          "</details>"
        : "");
  }

  function renderHops(vm, host) {
    const panel = host || el("tt-tools-hops");
    if (!panel || !vm) return;
    if (!vm.hops.length) {
      panel.innerHTML = '<div class="tt-empty-inline">No hops recorded for this turn.</div>';
      return;
    }
    if (hopSel >= vm.hops.length) hopSel = 0;
    const hop = vm.hops[hopSel];
    const rows = vm.hops
      .map((h, i) => {
        const bad = (Number(h.status) || 0) >= 400;
        return (
          '<tr class="' +
          (i === hopSel ? "sel" : "") +
          '" data-i="' +
          i +
          '">' +
          "<td>" +
          (h.preferred
            ? '<span class="inline-flex items-center gap-1">' +
              iconSvg("star") +
              '<span class="sr-only">preferred</span></span>'
            : "") +
          '<button type="button" class="btn btn-xs btn-ghost font-mono" data-i="' +
          i +
          '"' +
          (h.req_id
            ? ' data-copy="' +
              esc(h.req_id) +
              '" title="Click to copy"'
            : "") +
          ">" +
          esc(shortId(h.req_id || "—", 12)) +
          "</button></td>" +
          "<td><strong>" +
          esc(h.verb) +
          "</strong></td>" +
          '<td><span class="' +
          badgeFor(bad ? "bad" : "ok") +
          '">' +
          esc(String(h.status)) +
          "</span></td>" +
          '<td class="mono">' +
          esc(fmtMs(h.ms)) +
          "</td>" +
          '<td class="mono">' +
          esc(
            h.bytes == null
              ? "—"
              : typeof h.bytes === "number"
                ? fmtBytes(h.bytes)
                : String(h.bytes)
          ) +
          "</td></tr>"
        );
      })
      .join("");
    panel.innerHTML =
      '<div class="overflow-x-auto"><table class="table table-zebra table-xs tt-table"><thead><tr><th>req_id</th><th>Verb</th><th>Status</th><th>ms</th><th>Bytes</th></tr></thead><tbody>' +
      rows +
      "</tbody></table></div>" +
      '<div class="tt-hop-actions flex gap-2 items-center my-2 text-sm"><strong>Hop detail</strong>' +
      (hop.req_id
        ? '<button type="button" class="btn btn-xs btn-ghost" data-copy="' +
          esc(hop.req_id) +
          '" title="Click to copy">Copy req_id</button>'
        : "") +
      '<button type="button" class="btn btn-xs btn-ghost gap-1" data-action="open-req" data-req="' +
      esc(hop.req_id || "") +
      '">Open in Hub ' +
      iconSvg("external") +
      "</button></div>" +
      '<div class="tt-split-io grid grid-cols-1 md:grid-cols-2 gap-2.5">' +
      '<div class="card bg-base-200 border border-base-300 io-card"><header class="flex items-center gap-1.5 px-2 py-1.5 border-b border-base-300 text-xs font-semibold"><span class="ai-lab">Request</span> <span class="badge badge-ghost badge-sm">' +
      esc(hop.verb) +
      '</span><button type="button" class="btn btn-xs btn-ghost ml-auto" data-copy-from="tt-hop-req" title="Click to copy">Copy</button></header><pre id="tt-hop-req"></pre></div>' +
      '<div class="card bg-base-200 border border-base-300 io-card"><header class="flex items-center gap-1.5 px-2 py-1.5 border-b border-base-300 text-xs font-semibold"><span class="zeus-lab">Response</span> <span class="' +
      badgeFor((Number(hop.status) || 0) >= 400 ? "bad" : "ok") +
      '">' +
      esc(String(hop.status)) +
      '</span><button type="button" class="btn btn-xs btn-ghost ml-auto" data-copy-from="tt-hop-res" title="Click to copy">Copy</button></header><pre id="tt-hop-res"></pre></div></div>';
    const preReq = el("tt-hop-req");
    const preRes = el("tt-hop-res");
    if (preReq) preReq.textContent = prettyJSON(hop.req);
    if (preRes) preRes.textContent = prettyJSON(hop.res);
    panel.querySelectorAll("tbody tr").forEach((tr) => {
      tr.onclick = (ev) => {
        if (ev.target.closest("[data-copy]")) return;
        hopSel = +tr.dataset.i;
        renderHops(vm, panel);
      };
    });
  }

  function renderLlm(vm, host) {
    const panel = host || el("tt-tools-llm");
    if (!panel || !vm) return;
    const info = H().extractDecomposition
      ? H().extractDecomposition(
          Object.assign({}, vm.raw || {}, {
            trace: vm.trace,
            hops: vm.hops,
            llmRounds: vm.llmRounds,
          })
        )
      : { decomposition: null, query_decomposition: null };
    const decompHtml = H().decompositionCardHTML
      ? H().decompositionCardHTML(info, esc)
      : "";
    function wireDecompCopy() {
      const pre = el("tt-decomp-json");
      if (pre) {
        pre.textContent = prettyJSON({
          query_decomposition: info.query_decomposition,
          decomposition: info.decomposition,
          summary: info.summary,
          confidence: info.confidence,
          policy_action: info.policy_action,
        });
      }
    }
    if (!vm.llmRounds.length) {
      panel.innerHTML =
        decompHtml +
        '<div class="tt-empty-inline">No LLM rounds recorded for this turn.</div>';
      wireDecompCopy();
      return;
    }
    if (llmRound >= vm.llmRounds.length) llmRound = 0;
    const r = vm.llmRounds[llmRound];
    panel.innerHTML =
      decompHtml +
      '<div class="round-pills">' +
      vm.llmRounds
        .map(
          (x, i) =>
            '<button type="button" class="btn btn-xs round-pill ' +
            (i === llmRound ? "btn-active on" : "") +
            '" data-i="' +
            i +
            '">' +
            esc(String(x.label || "Round " + x.round)) +
            " · " +
            esc(x.finish || "—") +
            "</button>"
        )
        .join("") +
      "</div>" +
      '<div class="tt-tokline">tokens in <strong>' +
      esc(String(r.tok_in != null ? r.tok_in : "?")) +
      "</strong> · out <strong>" +
      esc(String(r.tok_out != null ? r.tok_out : "?")) +
      "</strong>" +
      (r.tok_total != null
        ? " · total <strong>" + esc(String(r.tok_total)) + "</strong>"
        : "") +
      "</div>" +
      '<div class="tt-split-io grid grid-cols-1 md:grid-cols-2 gap-2.5">' +
      '<div class="card bg-base-200 border border-base-300 io-card"><header class="flex items-center gap-1.5 px-2 py-1.5 border-b border-base-300 text-xs font-semibold">AI request <button type="button" class="btn btn-xs btn-ghost ml-auto" id="tt-llm-copy-req" data-copy-from="tt-llm-req" title="Click to copy">Copy</button></header><pre id="tt-llm-req"></pre></div>' +
      '<div class="card bg-base-200 border border-base-300 io-card"><header class="flex items-center gap-1.5 px-2 py-1.5 border-b border-base-300 text-xs font-semibold">AI response <button type="button" class="btn btn-xs btn-ghost ml-auto" id="tt-llm-copy-res" data-copy-from="tt-llm-res" title="Click to copy">Copy</button></header><pre id="tt-llm-res"></pre></div></div>';
    el("tt-llm-req").textContent = prettyJSON(r.req);
    el("tt-llm-res").textContent = prettyJSON(r.res);
    panel.querySelectorAll(".round-pill").forEach((b) => {
      b.onclick = () => {
        llmRound = +b.dataset.i;
        renderLlm(vm, panel);
      };
    });
    wireDecompCopy();
  }

  function renderTurnInject(vm, host) {
    const panel = host || el("tt-prompt-inject");
    if (!panel) return;
    if (!vm) {
      panel.innerHTML = '<div class="tt-empty-inline">No inject data.</div>';
      return;
    }
    const inj = vm.inject || {};
    const cat = vm.catalog || {};
    const notes = vm.semanticCache || [];
    const bag = {
      inject: inj,
      catalog: {
        has_mini_schema: cat.has_mini_schema,
        has_scope_brief: cat.has_scope_brief,
        base_id: cat.base_id,
        client_floor: cat.client_floor,
        brief_sha12: cat.brief_sha12 || inj.brief_sha12,
        mini_sha12: cat.mini_sha12 || inj.mini_sha12,
      },
      semantic_cache: notes,
      semantic_memory: inj.semantic_memory || null,
    };
    const note = notes.length
      ? notes.join(" · ")
      : inj.has_scope_brief || inj.has_mini_schema
        ? "Catalog inject present (SCOPE BRIEF / MINI-SCHEMA)."
        : "No catalog inject flags on this turn.";
    panel.innerHTML =
      '<div class="tt-inject-note">' +
      esc(note) +
      "</div>" +
      '<div class="card bg-base-200 border border-base-300 io-card"><header class="flex items-center gap-1.5 px-2 py-1.5 border-b border-base-300 text-xs font-semibold"><span class="ai-lab">inject / catalog</span>' +
      '<button type="button" class="btn btn-xs btn-ghost ml-auto" id="tt-inj-copy-req" data-copy-from="tt-inj-req" title="Click to copy">Copy</button></header><pre id="tt-inj-req"></pre></div>';
    const preReq = el("tt-inj-req");
    if (preReq) preReq.textContent = prettyJSON(bag);
  }

  function renderInject(u, host) {
    const panel = host || el("tt-prompt-inject");
    if (!panel) return;
    if (!u) {
      panel.innerHTML = '<div class="tt-empty-inline">No unit selected.</div>';
      return;
    }
    const prompt = u.stuffed_goal || u.goal || "";
    const note = u.synth
      ? "Synth unit: no shared session. Goal is stuffed with prior artifacts only."
      : u.has_inject
        ? "Isolated agent unit. Catalog inject present (SCOPE BRIEF / MINI-SCHEMA)."
        : u.kind === "zeus_direct"
          ? "zeus_direct: no catalog inject (Mode 2 verb)."
          : "Isolated agent unit. Fail-closed without ## SCOPE BRIEF (130012).";
    panel.innerHTML =
      '<div class="tt-inject-note">' +
      esc(note) +
      "</div>" +
      '<div class="tt-split-io grid grid-cols-1 md:grid-cols-2 gap-2.5">' +
      '<div class="card bg-base-200 border border-base-300 io-card"><header class="flex items-center gap-1.5 px-2 py-1.5 border-b border-base-300 text-xs font-semibold"><span class="ai-lab">Unit goal + inject</span>' +
      '<button type="button" class="btn btn-xs btn-ghost ml-auto" id="tt-inj-copy-req" data-copy-from="tt-inj-req" title="Click to copy">Copy</button></header><pre id="tt-inj-req"></pre></div>' +
      '<div class="card bg-base-200 border border-base-300 io-card"><header class="flex items-center gap-1.5 px-2 py-1.5 border-b border-base-300 text-xs font-semibold"><span class="zeus-lab">Artifact / answer</span>' +
      (u.error_code ? '<span class="' + badgeFor("err") + '">' + esc(u.error_code) + "</span>" : "") +
      '<button type="button" class="btn btn-xs btn-ghost ml-auto" id="tt-inj-copy-res" data-copy-from="tt-inj-res" title="Click to copy">Copy</button></header><pre id="tt-inj-res"></pre></div></div>';
    const preReq = el("tt-inj-req");
    const preRes = el("tt-inj-res");
    if (preReq) preReq.textContent = prompt || "(empty goal)";
    if (preRes) preRes.textContent = u.answer || "(no artifact)";
  }

  function gradeBadgeClass(g) {
    const n = (H().gradeNorm || ((x) => x))(g);
    if (n === "fail") return "fail";
    if (n === "warn") return "warn";
    if (n === "pass") return "pass";
    if (n === "skip") return "skip";
    return "na";
  }

  function detCardHTML(card) {
    const cls = gradeBadgeClass(card.grade);
    const border =
      cls === "fail"
        ? "border-error/40"
        : cls === "warn"
          ? "border-warning/40"
          : cls === "pass"
            ? "border-success/40"
            : "border-base-300";
    let html =
      '<article class="card bg-base-100 border ' +
      border +
      ' shadow-sm det-diag-card ' +
      cls +
      '"><div class="card-body p-4"><h3 class="text-xs font-semibold uppercase tracking-wide text-base-content/50">' +
      esc(card.title) +
      "</h3>";
    if (card.items && card.items.length) {
      html +=
        '<ul class="text-sm list-disc ml-4 mt-1 space-y-1">' +
        card.items.map((it) => "<li>" + esc(it) + "</li>").join("") +
        "</ul>";
    }
    if (card.minis && card.minis.length) {
      html +=
        '<div class="kpi-mini">' +
        card.minis
          .map(
            (m) =>
              '<div class="km"><div class="l">' +
              esc(String(m.l)) +
              '</div><div class="v">' +
              esc(String(m.v)) +
              "</div></div>"
          )
          .join("") +
        "</div>";
    }
    if (card.muted) html += '<p class="text-xs text-base-content/50 font-mono mt-2">' + esc(card.muted) + "</p>";
    if (card.jump) {
      html +=
        '<button type="button" class="btn btn-xs btn-ghost w-fit" data-action="tt-tab" data-tab="' +
        esc(card.jump) +
        '">open ' +
        esc(card.jump) +
        "</button>";
    }
    return html + "</div></article>";
  }

  function renderDetOverview(vm) {
    const env = H().detectiveEnvelopeRows ? H().detectiveEnvelopeRows(vm) : [];
    const la = H().detectiveLayerA ? H().detectiveLayerA(vm) : {};
    const envDl = env.length
      ? '<dl class="det-env grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-2 text-sm mt-2">' +
        env
          .map(
            (r) =>
              '<dt class="text-base-content/50">' +
              esc(r.key) +
              '</dt><dd class="font-mono text-xs m-0">' +
              valueCell(r.key, r.value) +
              "</dd>"
          )
          .join("") +
        "</dl>"
      : '<div class="hint">Detective data not attached on this turn.</div>';
    const intent = la.intent
      ? '<div class="mt-3"><span class="badge badge-info badge-outline gap-1"><span class="text-[10px] font-bold uppercase">intent</span> ' +
        esc(String(la.intent)) +
        "</span></div>"
      : "";
    const layerBits = [
      la.via ? "via=" + la.via : "",
      la.confidence ? "conf=" + la.confidence : "",
      la.policy_action ? "policy=" + la.policy_action : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      '<div class="card bg-base-100 shadow-sm border border-base-300 det-card"><div class="card-body p-4">' +
      '<h2 class="card-title text-base">Envelope <span class="font-normal text-sm text-base-content/60">who / scope / mode / duration</span></h2>' +
      envDl +
      intent +
      (layerBits ? '<p class="text-xs text-base-content/50 mt-2">layer_a · ' + esc(layerBits) + "</p>" : "") +
      '<p class="text-sm text-base-content/70 mt-3">Cost / result KPIs live on <button type="button" class="btn btn-xs" data-action="tt-tab" data-tab="tools">Tools</button>. Envelope is facts only. Token IN is omitted when usage is missing (never painted as 0).</p>' +
      "</div></div>"
    );
  }

  function renderDetDiagnosis(vm) {
    const model = H().detectiveDiagnosisModel
      ? H().detectiveDiagnosisModel(vm)
      : { cards: [], grades: [], playbooks: [], headline: vm.headline || "" };
    const sum = vm.checkSummary || (H().detectiveCheckSummary ? H().detectiveCheckSummary(vm.promptChecks || []) : {});
    function gradeBadge(g) {
      const n = gradeBadgeClass(g);
      const tone =
        n === "fail"
          ? "badge-error"
          : n === "warn"
            ? "badge-warning"
            : n === "pass"
              ? "badge-success"
              : "badge-ghost";
      return "badge badge-sm " + tone;
    }
    let html =
      '<div class="flex flex-wrap items-start gap-2 mb-4"><h2 class="text-lg font-semibold flex-1 min-w-[12rem]">' +
      esc(model.headline);
    if (model.request_kind_label) {
      html +=
        ' <span class="' +
        gradeBadge(model.isDirect ? "na" : "pass") +
        '">' +
        esc(model.request_kind_label) +
        "</span>";
    }
    html += '</h2><div class="flex flex-wrap gap-1">';
    (model.grades || []).forEach((g) => {
      if (!g.value) return;
      html +=
        '<span class="' +
        gradeBadge(g.cls || g.value) +
        '">' +
        esc(g.id) +
        ":" +
        esc(g.value) +
        "</span>";
    });
    if (sum && sum.label) {
      html +=
        '<span class="' +
        (sum.tone === "ok" ? "badge badge-sm badge-success" : "badge badge-sm badge-error") +
        '">' +
        esc(sum.label) +
        "</span>";
    }
    html += "</div></div>";
    if (model.slowTop && model.slowTop.length) {
      html +=
        '<div class="alert mb-4 bg-warning/10 border border-warning/40"><div><h3 class="font-semibold text-sm">Why was this slow?</h3><ul class="text-sm mt-1 list-disc ml-4">';
      model.slowTop.forEach((t) => {
        html +=
          "<li><b>" +
          esc(t.label) +
          "</b> · " +
          esc(String(t.ms)) +
          "ms" +
          (t.share_pct ? " (" + t.share_pct + "%)" : "") +
          "</li>";
      });
      html += "</ul></div></div>";
    }
    html +=
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 diag-grid">' +
      (model.cards || []).map(detCardHTML).join("") +
      "</div>";
    const pbs = model.playbooks || [];
    if (pbs.length) {
      html +=
        '<div class="alert alert-info mt-4"><div><p class="font-semibold">Insight playbooks <span class="font-normal opacity-80">· auto-matched</span></p>' +
        '<p class="text-sm">Each card is a known failure pattern. Follow the actions, then return to Overview.</p></div></div>';
      pbs.forEach((pb) => {
        const sev = esc(pb.severity || "info");
        const edge =
          sev === "fail"
            ? "border-l-error"
            : sev === "warn"
              ? "border-l-warning"
              : "border-l-info";
        html +=
          '<article class="card bg-base-100 border-l-4 ' +
          edge +
          " border border-base-300 mt-3 pb " +
          sev +
          '"><div class="card-body p-4"><h3 class="font-semibold">' +
          esc(pb.title) +
          '</h3><p class="text-sm text-base-content/70">' +
          esc(pb.summary || "") +
          "</p>";
        if (pb.actions && pb.actions.length) {
          html +=
            '<ul class="text-sm list-disc ml-4 mt-1">' +
            pb.actions.map((a) => "<li>" + esc(a) + "</li>").join("") +
            "</ul>";
        }
        html += "</div></article>";
      });
    } else {
      html +=
        '<div class="playbook empty-ok flex items-center gap-1 text-success mt-4">' +
        iconSvg("check") +
        " No playbooks triggered</div>";
    }
    html +=
      '<div class="flex flex-wrap gap-2 mt-4">' +
      '<button type="button" class="btn btn-sm" data-action="copy-pack">Copy markdown pack</button>' +
      (vm.session_id
        ? '<a class="btn btn-sm btn-ghost gap-1" href="' +
          esc(hubSessionUrl(vm.session_id) || "#") +
          '" target="_blank" rel="noopener" data-action="hub-session">session ' +
          iconSvg("external") +
          "</a>"
        : "") +
      (vm.preferred_req_id
        ? '<a class="btn btn-sm btn-ghost gap-1" href="' +
          esc(hubReqUrl(vm.preferred_req_id) || "#") +
          '" target="_blank" rel="noopener" data-action="hub-req">preferred req ' +
          iconSvg("external") +
          "</a>"
        : "") +
      "</div>";
    return html;
  }

  function renderDetPrompt(vm) {
    const view = H().detectivePromptView
      ? H().detectivePromptView(vm)
      : { checks: vm.promptChecks || [], tiles: vm.promptChecks || [], verdict: vm.prompt_grade || "skip", summary: "", rounds: 0, checkSummary: vm.checkSummary };
    const sum = view.checkSummary || (H().detectiveCheckSummary ? H().detectiveCheckSummary(view.checks || []) : {});
    const v = view.verdict || "skip";
    const alertTone =
      v === "fail" ? "alert-error" : v === "warn" ? "alert-warning" : v === "pass" ? "alert-success" : "alert-info";
    let html =
      '<div class="pcl"><div class="alert ' +
      alertTone +
      ' mb-4 verdict ' +
      esc(v) +
      '"><span class="' +
      badgeFor(v) +
      ' vbadge">' +
      esc(v) +
      '</span><div><p class="font-medium vsum">' +
      esc(view.summary || "") +
      '</p><p class="text-xs font-mono opacity-70 vmeta">rounds checked: ' +
      esc(String(view.rounds || 0)) +
      (sum && sum.label ? " · " + esc(sum.label) : "") +
      " · fix fails first, then debug tools</p></div></div>";
    html +=
      '<p class="text-xs text-base-content/50 mb-3">SCOPE BRIEF / MINI-SCHEMA are status tiles. Live sent-vs-catalog compare is Hub Detective.</p>';
    html += '<div class="tiles">';
    (view.tiles || view.checks || []).forEach((c) => {
      const st = c.status || (c.ok ? "pass" : "fail");
      const border =
        st === "fail"
          ? "border-error/40"
          : st === "warn"
            ? "border-warning/40"
            : st === "pass"
              ? "border-success/40"
              : "border-base-300";
      html +=
        '<div class="card bg-base-100 border ' +
        border +
        " shadow-sm tile " +
        esc(st) +
        '" data-check-id="' +
        esc(c.id || "") +
        '"><div class="card-body p-3 gap-1"><div class="flex justify-between items-center top"><span class="text-[10px] uppercase font-mono text-base-content/50 grp">' +
        esc(c.group || "") +
        '</span><span class="' +
        badgeFor(st) +
        ' st ' +
        esc(st) +
        '">' +
        esc(st) +
        "</span></div><p class=\"font-semibold text-sm lab\">" +
        esc(c.lab) +
        "</p>";
      if (c.detail) html += '<p class="text-xs font-mono text-base-content/60 det">' + esc(c.detail) + "</p>";
      if (c.fix_hint) html += '<p class="text-xs text-primary fix">Fix: ' + esc(c.fix_hint) + "</p>";
      html += "</div></div>";
    });
    html += "</div></div>";
    return html;
  }

  function renderDetSession(vm) {
    const model = H().detectiveSessionModel
      ? H().detectiveSessionModel(vm)
      : { kv: [], hops: [] };
    let html =
      '<div class="card bg-base-100 shadow-sm border border-base-300 mb-4 det-card"><div class="card-body p-4">' +
      '<h2 class="card-title text-base">Session context <span class="font-normal text-sm text-base-content/60">zeus_client stamps</span></h2>' +
      (model.kv.length
        ? '<dl class="det-env grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-2 text-sm">' +
          model.kv
            .map(
              (r) =>
                '<dt class="text-base-content/50">' +
                esc(r.key) +
                '</dt><dd class="font-mono text-xs m-0">' +
                valueCell(r.key, r.value) +
                "</dd>"
            )
            .join("") +
          "</dl>"
        : '<div class="hint">No session conversation attached to this turn.</div>') +
      "</div></div>";
    if (model.hops.length) {
      html +=
        '<div class="card bg-base-100 shadow-sm border border-base-300 det-card"><div class="card-body p-4"><h2 class="card-title text-base">Related hops <span class="font-normal text-sm text-base-content/60">same chat_id</span></h2><div class="session-strip flex flex-wrap gap-2">' +
        model.hops
          .map(
            (h) =>
              '<button type="button" class="btn btn-xs font-mono pill' +
              (h.preferred ? " btn-primary cur" : "") +
              '" data-copy="' +
              esc(h.req_id) +
              '">' +
              esc(h.verb || "hop") +
              " · " +
              esc(shortId(h.req_id, 10)) +
              "</button>"
          )
          .join("") +
        "</div></div></div>";
    }
    html +=
      '<div class="flex flex-wrap gap-2 mt-3">' +
      (vm.session_id
        ? '<a class="tt-link" href="' +
          esc(hubSessionUrl(vm.session_id) || "#") +
          '" target="_blank" rel="noopener" data-action="hub-session">session</a>'
        : "<span class=\"tt-muted\">session</span>") +
      " · " +
      (vm.preferred_req_id
        ? '<a class="tt-link" href="' +
          esc(hubReqUrl(vm.preferred_req_id) || "#") +
          '" target="_blank" rel="noopener" data-action="hub-req">preferred req</a>'
        : "<span class=\"tt-muted\">preferred req</span>") +
      "</div>";
    return html;
  }

  function paintPanel(id, html) {
    const panel = el(id);
    if (!panel) return;
    panel.innerHTML = html || "";
  }

  function kpiGridHTML(tiles, title) {
    if (!tiles || !tiles.length) {
      return '<div class="hint">No cost / result KPIs on this turn.</div>';
    }
    let html = title
      ? '<p class="text-xs uppercase tracking-wide text-base-content/50 mb-2">' +
        esc(title) +
        "</p>"
      : "";
    html += '<div class="grid grid-cols-2 md:grid-cols-3 gap-2 env-kpi">';
    tiles.forEach((t) => {
      html +=
        '<div class="stat bg-base-200 rounded-box border border-base-300 p-3 kpi-tile min-w-0">' +
        '<div class="stat-title kpi-lbl">' +
        esc(t.label) +
        '</div><div class="stat-value text-xl kpi-val">' +
        esc(t.value) +
        "</div></div>";
    });
    html += "</div>";
    return html;
  }

  function updateTabPills(vm) {
    const spec = H().detectiveShellSpec
      ? H().detectiveShellSpec(vm, tab)
      : { tabs: [] };
    const hopEl = el("tt-hop-count");
    const promptEl = el("tt-prompt-count");
    const diagEl = el("tt-diag-count");
    (spec.tabs || []).forEach((t) => {
      if (t.id === "tools" && hopEl) {
        hopEl.textContent = t.pill || String((vm && vm.hops && vm.hops.length) || 0);
        hopEl.classList.toggle("badge-error", t.pillKind === "err");
      }
      if (t.id === "prompt" && promptEl) {
        promptEl.hidden = !t.pill;
        promptEl.textContent = t.pill || "";
        promptEl.classList.toggle("badge-error", t.pillKind === "err");
        promptEl.classList.toggle("badge-success", t.pillKind === "ok");
      }
      if (t.id === "diagnosis" && diagEl) {
        diagEl.hidden = !t.pill;
        diagEl.textContent = t.pill || "";
        diagEl.classList.toggle("badge-warning", t.pillKind === "warn");
        diagEl.classList.toggle("badge-error", t.pillKind === "err");
      }
    });
  }

  function renderOverview(vm) {
    paintPanel("tt-panel-overview", vm ? renderDetOverview(vm) : "");
  }

  function renderDiagnosisTab(vm) {
    paintPanel("tt-panel-diagnosis", vm ? renderDetDiagnosis(vm) : "");
  }

  function renderPromptTab(vm, jobUnit) {
    const panel = el("tt-panel-prompt");
    if (!panel) return;
    if (!vm && !jobUnit) {
      panel.innerHTML = "";
      return;
    }
    let html = vm ? renderDetPrompt(vm) : "";
    html += '<div id="tt-prompt-inject" class="mt-3"></div>';
    panel.innerHTML = html || '<div class="tt-empty-inline">No prompt checklist on this turn.</div>';
    if (jobMode) renderInject(jobUnit, el("tt-prompt-inject"));
    else if (vm) renderTurnInject(vm, el("tt-prompt-inject"));
  }

  function renderTools(vm) {
    const panel = el("tt-panel-tools");
    if (!panel) return;
    if (!vm) {
      panel.innerHTML = "";
      return;
    }
    const kpis = H().detectiveCostResultKpis
      ? H().detectiveCostResultKpis(vm)
      : H().detectiveTokenTiles
        ? H().detectiveTokenTiles(vm)
        : [];
    panel.innerHTML =
      '<div class="card bg-base-100 shadow-sm border border-base-300 mb-4 det-card"><div class="card-body p-4">' +
      '<h2 class="card-title text-base">Cost / result <span class="font-normal text-sm text-base-content/60">tokens · HTTP · records</span></h2>' +
      kpiGridHTML(kpis, "Provider tokens and result") +
      "</div></div>" +
      '<div class="card bg-base-100 shadow-sm border border-base-300 mb-4 det-card"><div class="card-body p-4">' +
      '<h2 class="card-title text-base">AI request <span class="font-normal text-sm text-base-content/60">LLM round · req∥res</span></h2>' +
      '<div id="tt-tools-llm"></div></div></div>' +
      '<div class="card bg-base-100 shadow-sm border border-base-300 det-card"><div class="card-body p-4">' +
      '<h2 class="card-title text-base">Tool calls <span class="font-normal text-sm text-base-content/60">this turn · table then req∥res</span></h2>' +
      '<div id="tt-tools-hops"></div></div></div>';
    renderLlm(vm, el("tt-tools-llm"));
    renderHops(vm, el("tt-tools-hops"));
  }

  function renderSessionTab(vm) {
    paintPanel("tt-panel-session", vm ? renderDetSession(vm) : "");
  }

  function renderDetailTabs(vm, jobUnit) {
    updateTabPills(vm);
    renderOverview(vm);
    renderDiagnosisTab(vm);
    renderPromptTab(vm, jobUnit);
    renderTimeline(vm);
    renderTools(vm);
    renderSessionTab(vm);
    renderRaw(vm);
  }

  function renderRaw(vm) {
    const panel = el("tt-panel-raw");
    if (!panel || !vm) return;
    const bundle = {
      question: vm.question,
      answer: vm.answer,
      target: vm.target,
      mode: vm.mode,
      api_version: vm.api_version,
      provider: vm.provider,
      model: vm.model,
      session_id: vm.session_id,
      session_round: vm.session_round,
      contract_status: vm.contract_status,
      preferred_req_id: vm.preferred_req_id,
      turn_id: vm.turn_id,
      gather: vm.gather,
      status: vm.status,
      detective: vm.detective,
      hops: vm.hops,
      spans: vm.spans,
      trace: vm.trace,
    };
    panel.innerHTML =
      '<div class="card bg-base-100 shadow-sm border border-base-300 io-card raw-card"><div class="card-body p-4">' +
      '<div class="flex items-center gap-2"><h2 class="card-title text-base">Raw bundle</h2>' +
      '<button type="button" class="btn btn-xs btn-ghost ml-auto" id="tt-raw-copy" data-copy-from="tt-raw-json" title="Click to copy">Copy JSON</button></div>' +
      '<pre id="tt-raw-json" hidden></pre>' +
      '<div class="trace-dump-viewer mt-2" id="tt-raw-host"></div></div></div>';
    const jsonEl = el("tt-raw-json");
    if (jsonEl) jsonEl.textContent = prettyJSON(bundle);
    const host = el("tt-raw-host");
    if (H().mountJsnviewViewer) H().mountJsnviewViewer(host, bundle, false);
    else {
      const pre = document.createElement("pre");
      pre.textContent = prettyJSON(bundle);
      host.appendChild(pre);
    }
  }

  function getBundle() {
    const shown = (entries || []).slice(-TRACE_MAX);
    return {
      copied_at: new Date().toISOString(),
      chat_id: opts.getChatId ? opts.getChatId() : null,
      shown_turns: shown.length,
      max_shown_turns: TRACE_MAX,
      traces: shown,
    };
  }

  function render() {
    const empty = el("tt-empty");
    const body = el("tt-body");
    applyJobChrome(jobMode);

    if (jobMode) {
      const entry = jobEntry();
      const units = jobUnits(entry);
      renderHeader(units.length);
      if (!entry) {
        if (empty) {
          empty.hidden = false;
          empty.textContent = "No job run yet.";
        }
        if (body) body.hidden = true;
        renderSession(null);
        return;
      }
      if (empty) empty.hidden = true;
      if (body) body.hidden = false;
      if (unitSel >= units.length) unitSel = 0;
      const u = selectedUnit(units);
      const unitVm = u
        ? {
            hops: u.hops || [],
            llmRounds: u.llm || [],
            question: u.goal,
            status: u.status,
            grade: u.status === "err" ? "fail" : "pass",
            playbooks: [],
            errCount: u.status === "err" ? 1 : 0,
            preferred_req_id: (u.req_ids && u.req_ids[0]) || "",
            session_id: "",
            turn_id: u.unit_id,
            raw: entry,
            trace: (entry && entry.trace) || {},
            detective: null,
            headline: "",
            overview: "",
            promptChecks: [],
            checkSummary: { label: "", tone: "" },
            gather: [],
          }
        : null;
      renderUnitList(units);
      renderJobBar(entry, units);
      renderUnitHead(u);
      const box = el("tt-diagnosis");
      if (box) {
        box.hidden = !(u && u.status === "err");
        if (u && u.status === "err") {
          box.className = "tt-diagnosis alert alert-error fail mx-3 mt-2 shrink-0";
          box.innerHTML =
            '<div class="tt-diagnosis-body">' +
            '<div class="eyebrow"><span class="tt-badge err">' +
            esc(u.error_code || u.status) +
            "</span></div><h3>" +
            esc(u.unit_id + " failed") +
            "</h3><p class=\"detail\">" +
            esc((u.answer || "").slice(0, 280)) +
            "</p></div>";
        } else {
          box.innerHTML = "";
        }
      }
      if (["hops", "llm", "inject", "detective"].includes(tab)) tab = "overview";
      if (u && u.status === "err" && lastAutoTabKey !== u.unit_id) {
        lastAutoTabKey = u.unit_id;
        tab = "diagnosis";
      }
      setTab(tab);
      renderDetailTabs(unitVm, u);
      return;
    }

    const vms = viewModels();
    renderHeader(vms.length);

    if (!vms.length) {
      if (empty) empty.hidden = false;
      if (body) body.hidden = true;
      renderSession(null);
      return;
    }
    if (empty) empty.hidden = true;
    if (body) body.hidden = false;

    // ensure selection
    if (!selectedKey || !vms.some((v) => v.key === selectedKey)) {
      selectedKey = vms[0].key;
      hopSel = 0;
      llmRound = 0;
      lastAutoTabKey = null;
    }

    const vm = vms.find((v) => v.key === selectedKey) || vms[0];

    // default hop to preferred
    if (vm && hopSel === 0 && vm.hops.length) {
      const pi = vm.hops.findIndex((h) => h.preferred);
      if (pi > 0 && !vm._hopTouched) hopSel = pi;
    }

    renderTurnList(vms);
    renderSession(vm);
    renderDetailHead(vm);
    renderDiagnosis(vm);

    if (["hops", "llm", "inject", "detective"].includes(tab)) tab = "overview";
    if (vm && needsDiagnosis(vm) && lastAutoTabKey !== vm.key) {
      lastAutoTabKey = vm.key;
      tab = "diagnosis";
    }
    setTab(tab);
    renderDetailTabs(vm, null);
  }

  function eventEl(e) {
    let t = e.target;
    if (t && t.nodeType !== 1) t = t.parentElement;
    if (t && typeof t.closest === "function") return t;
    if (typeof e.composedPath === "function") {
      const n = e.composedPath().find(
        (x) => x && x.nodeType === 1 && typeof x.closest === "function"
      );
      if (n) return n;
    }
    return null;
  }

  function onRootClick(e) {
    const t = eventEl(e);
    if (!t) return;

    const copyEl = t.closest("[data-copy]");
    if (copyEl && copyEl.getAttribute("data-copy") != null) {
      e.preventDefault();
      copyText(copyEl.getAttribute("data-copy"), copyEl);
      return;
    }
    const fromEl = t.closest("[data-copy-from]");
    if (fromEl) {
      e.preventDefault();
      const src = el(fromEl.getAttribute("data-copy-from") || "");
      copyText(src ? src.textContent : "", fromEl);
      return;
    }
    const act = t.closest("[data-action]");
    if (!act) return;
    const action = act.dataset.action;
    const vm = selectedVm();
    if (action === "copy-all") {
      e.preventDefault();
      const bundle = getBundle();
      if (!bundle.traces.length) {
        toast("No trace to copy yet", "warning");
        return;
      }
      copyText(prettyJSON(bundle), act);
      return;
    }
    if (action === "hub-missing") {
      toast("Set ZeusTraceConfig.hubBaseUrl to open Detective", "warning");
      return;
    }
    if (action === "copy-pack" && vm) {
      copyText(supportPack(vm), act);
      return;
    }
    if (action === "tt-tab") {
      const next = act.dataset.tab || "overview";
      tab = next;
      if (selectedKey) lastAutoTabKey = selectedKey;
      setTab(tab);
      return;
    }
    if (action === "open-pref" && vm) {
      const pi = vm.hops.findIndex((h) => h.preferred);
      hopSel = pi >= 0 ? pi : 0;
      tab = "tools";
      if (vm) vm._hopTouched = true;
      render();
      toast("Jumped to preferred hop");
      return;
    }
    if (action === "open-req") {
      const rid = act.dataset.req || (vm && vm.preferred_req_id);
      const url = hubReqUrl(rid);
      if (!url && rid) {
        copyText(rid);
        toast("Hub URL unknown — copied req_id", "warning");
      } else openExternal(url);
      return;
    }
    if (action === "hub-session" && !hubBase()) {
      e.preventDefault();
      toast("Set ZeusTraceConfig.hubBaseUrl to open Detective", "warning");
    }
    if (action === "hub-req" && !hubBase()) {
      e.preventDefault();
      toast("Set ZeusTraceConfig.hubBaseUrl to open Detective", "warning");
    }
  }

  function wireOnce() {
    if (inited) return;
    inited = true;
    root.addEventListener("click", onRootClick);

    const drop = el("tt-turn-dropdown");
    if (drop) {
      drop.addEventListener("toggle", () => {
        const s = el("tt-turn-summary");
        if (s) s.setAttribute("aria-expanded", drop.open ? "true" : "false");
      });
    }

    root.querySelectorAll(".tt-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        tab = btn.dataset.tab || "overview";
        // user chose tab — don't auto-override until selection changes
        if (selectedKey) lastAutoTabKey = selectedKey;
        setTab(tab);
      });
    });

    el("tt-export")?.addEventListener("click", () => {
      const bundle = getBundle();
      if (!bundle.traces.length) {
        toast("No trace to export yet", "warning");
        return;
      }
      const blob = new Blob([prettyJSON(bundle)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const cid = bundle.chat_id || "local";
      a.download = "zeus-traces-" + cid + "-" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
      toast("exported");
    });

    el("tt-detective")?.addEventListener("click", () => {
      const vm = selectedVm();
      if (!vm) {
        toast("No turn selected", "warning");
        return;
      }
      const rid = vm.preferred_req_id;
      const url = rid ? hubReqUrl(rid) : hubSessionUrl(vm.session_id);
      if (!url) {
        const id = rid || vm.session_id || "";
        if (id) copyText(id);
        toast("Set ZeusTraceConfig.hubBaseUrl to open Detective", "warning");
        return;
      }
      openExternal(url);
    });
  }

  function setEntries(list) {
    entries = (Array.isArray(list) ? list : []).map(coerceTraceEntry).filter((e) => e && e.trace);
    if (entries.length > TRACE_MAX) entries = entries.slice(-TRACE_MAX);
    jobMode = entries.some((e) => H().isMultiAgentTrace && H().isMultiAgentTrace(e.trace, e));
    selectedKey = null;
    hopSel = 0;
    llmRound = 0;
    lastAutoTabKey = null;
    wireOnce();
    render();
  }

  function pushEntry(raw) {
    const entry = coerceTraceEntry(raw);
    if (!entry || !entry.trace) return;
    // avoid double-push same object
    if (!entries.includes(entry)) entries.push(entry);
    if (entries.length > TRACE_MAX) entries = entries.slice(-TRACE_MAX);
    const vm = normalizeTurnEntry(entry, entries.length - 1);
    if (H().isMultiAgentTrace && H().isMultiAgentTrace(entry.trace, entry)) {
      jobMode = true;
    }
    selectedKey = vm.key;
    hopSel = 0;
    llmRound = 0;
    lastAutoTabKey = null;
    wireOnce();
    render();
  }

  function clear() {
    entries = [];
    selectedKey = null;
    lastAutoTabKey = null;
    jobMode = false;
    unitSel = 0;
    wireOnce();
    render();
  }

  function init(options) {
    opts = Object.assign({}, opts, options || {});
    wireOnce();
    render();
  }

  return {
    init,
    setEntries,
    pushEntry,
    clear,
    getBundle,
    setJobMode,
    TRACE_MAX_CARDS: TRACE_MAX,
  };
}
