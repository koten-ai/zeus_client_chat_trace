/**
 * Turn traces inspector panel (sketches hybrid: 001 shell + 003 strip + 002 Story).
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
  let filter = "all";
  let search = "";
  let tab = "timeline";
  let hopSel = 0;
  let llmRound = 0;
  let storyMode = false;
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
          toast("✓ copied " + shortId(s, 28));
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
    if (title) title.textContent = on ? "Job traces" : "Zeus Tracer";
    const search = el("tt-search");
    if (search) search.placeholder = on ? "Filter unit, req_id…" : "Filter turns, tools, req_id…";
    const empty = el("tt-empty");
    if (empty && !entries.length) empty.textContent = on ? "No job run yet." : "No turn run yet.";
    const nav = root.querySelector(".tt-turn-list");
    if (nav) nav.setAttribute("aria-label", on ? "Units" : "Turns");
    root.querySelectorAll(".tt-tab[data-job], .tt-tab[data-turn]").forEach((b) => {
      const jobOnly = b.hasAttribute("data-job") && !b.hasAttribute("data-turn");
      const turnOnly = b.hasAttribute("data-turn") && !b.hasAttribute("data-job");
      b.hidden = (jobOnly && !on) || (turnOnly && on);
    });
    const filters = el("tt-filters");
    if (filters) {
      const tools = filters.querySelector('[data-filter="tools"]');
      const agent = filters.querySelector('[data-filter="agent"]');
      if (tools) tools.hidden = !!on;
      if (agent) agent.hidden = !on;
    }
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
    filter = "all";
    const filters = el("tt-filters");
    if (filters) {
      filters.querySelectorAll(".tt-chip").forEach((c) =>
        c.classList.toggle("on", c.dataset.filter === "all")
      );
    }
    tab = jobMode ? "hops" : "timeline";
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

  function matchesFilter(vm) {
    if (filter === "error" && vm.status === "ok" && vm.errCount === 0) return false;
    if (filter === "tools" && vm.toolsCount === 0) return false;
    const q = (search || "").toLowerCase().trim();
    if (!q) return true;
    const hay = [
      vm.question,
      vm.mode,
      vm.target,
      String(vm.index + 1),
      vm.turn_id,
      vm.preferred_req_id,
      vm.session_id,
      ...vm.hops.map((h) => h.verb + " " + h.req_id),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
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
      b.classList.toggle("on", b.dataset.tab === name);
    });
    root.querySelectorAll(".tt-tab-panel").forEach((p) => {
      p.classList.toggle("on", p.id === "tt-panel-" + name);
    });
  }

  function renderHeader(count) {
    const countEl = el("tt-turn-count");
    if (countEl) {
      if (jobMode) {
        const n = jobUnits().length;
        countEl.textContent = n + " unit" + (n === 1 ? "" : "s");
      } else {
        countEl.textContent = count + " turn" + (count === 1 ? "" : "s");
      }
    }
    const verEl = el("tt-client-ver");
    if (verEl) {
      let v = "";
      try {
        v = opts.getClientVersion() || "";
      } catch (e) {
        v = "";
      }
      if (!v) {
        const badge = el("client-version-badge");
        if (badge) v = (badge.textContent || "").replace(/^client\s*v?/i, "").trim();
      }
      verEl.textContent = v ? "client v" + v.replace(/^v/, "") : "";
      verEl.hidden = !v;
    }
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
        ? '<button type="button" class="tt-id" data-copy="' +
          esc(jobId) +
          '" title="Click to copy">' +
          esc(jobId) +
          "</button>"
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
        ? '<button type="button" class="tt-id" data-copy="' +
          esc(vm.session_id) +
          '" title="Click to copy">' +
          esc(shortId(vm.session_id, 14)) +
          "</button>"
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
          '<button type="button" class="tt-id" data-copy="' +
          esc(vm.preferred_req_id) +
          '" title="Click to copy">' +
          esc(shortId(vm.preferred_req_id, 14)) +
          "</button>"
        : "") +
      (hub
        ? '<span class="tt-sep">·</span><a class="tt-link" href="' +
          esc(hub) +
          '" target="_blank" rel="noopener">Hub session ↗</a>'
        : '<span class="tt-sep">·</span><button type="button" class="tt-linkish" data-action="hub-missing">Hub session ↗</button>') +
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

  function matchesUnitFilter(u) {
    if (!u) return false;
    if (filter === "error" && u.status === "ok") return false;
    if (filter === "agent" && u.kind !== "agent_turn") return false;
    const q = (search || "").toLowerCase().trim();
    if (!q) return true;
    const hay = [u.unit_id, u.goal, u.kind, u.answer, ...(u.req_ids || [])].join(" ").toLowerCase();
    return hay.includes(q);
  }

  function renderUnitList(units) {
    const host = el("tt-turns");
    if (!host) return;
    const visible = units.filter(matchesUnitFilter);
    host.innerHTML = "";
    if (!visible.length) {
      host.innerHTML = '<div class="tt-empty-inline">No units match</div>';
      return;
    }
    visible.forEach((u) => {
      const i = units.indexOf(u);
      const tags = [];
      tags.push('<span class="tt-turn-tag">' + esc(u.kind) + "</span>");
      if (u.synth) tags.push('<span class="tt-turn-tag synth">synth</span>');
      else tags.push('<span class="tt-turn-tag">isolated</span>');
      tags.push('<span class="tt-turn-tag">' + (u.req_ids || []).length + " req</span>");
      if (u.error_code) tags.push('<span class="tt-turn-tag err">' + esc(u.error_code) + "</span>");
      const div = document.createElement("div");
      div.className = "tt-turn-item" + (i === unitSel ? " active" : "");
      div.setAttribute("role", "button");
      div.tabIndex = 0;
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
  }

  function renderTurnList(vms) {
    const host = el("tt-turns");
    if (!host) return;
    const visible = vms.filter(matchesFilter);
    host.innerHTML = "";
    if (!visible.length) {
      host.innerHTML = '<div class="tt-empty-inline">No turns match</div>';
      return;
    }
    visible.forEach((vm) => {
      // Chronological turn number (oldest = #1), list is newest-first.
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
      const div = document.createElement("div");
      div.className =
        "tt-turn-item" + (vm.key === selectedKey ? " active" : "");
      div.dataset.key = vm.key;
      div.setAttribute("role", "button");
      div.tabIndex = 0;
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
      "tt-diagnosis" +
      (vm.grade === "fail" || vm.status === "err"
        ? " fail"
        : " warn");
    const grade = vm.grade || vm.status;
    box.innerHTML =
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
      '<div class="hero-actions">' +
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
      '<button type="button" class="tt-btn primary" data-action="open-pref">Open preferred hop</button>' +
      '<button type="button" class="tt-btn" data-action="copy-pack" title="Click to copy">Copy support pack</button>' +
      "</div>";
  }

  function renderTimeline(vm) {
    const panel = el("tt-panel-timeline");
    if (!panel || !vm) return;
    const storyToggle =
      '<label class="tt-story-toggle"><input type="checkbox" id="tt-story"' +
      (storyMode ? " checked" : "") +
      " /> Story</label>";
    if (storyMode) {
      panel.innerHTML =
        '<div class="tt-tab-toolbar">' +
        storyToggle +
        "</div>" +
        storyHTML(vm);
      bindStoryToggle(vm);
      return;
    }
    const wf = (H().waterfallHTML || (() => ""))(
      vm.spans,
      vm.metrics.total,
      vm.steps
    );
    const chart = (H().toolFrequencyChartHTML || (() => ""))(
      vm.steps,
      vm.api_version,
      opts.getChartOrder()
    );
    panel.innerHTML =
      '<div class="tt-tab-toolbar">' +
      storyToggle +
      "</div>" +
      (wf || '<div class="tt-empty-inline">No spans for this turn.</div>') +
      '<div class="tt-kv">' +
      '<div class="k">Status</div><div class="v"><span class="tt-badge ' +
      (vm.status === "ok" ? "ok" : vm.status === "err" ? "err" : "warn") +
      '">' +
      esc(vm.status) +
      "</span></div>" +
      '<div class="k">Mode / target</div><div class="v">' +
      esc(vm.mode || "—") +
      " · " +
      esc(vm.target || "—") +
      "</div>" +
      '<div class="k">API</div><div class="v">' +
      esc(String(vm.api_version || "").toUpperCase()) +
      " · " +
      esc(vm.provider || "") +
      " / " +
      esc(vm.model || "") +
      "</div></div>" +
      (chart
        ? '<details class="tt-fold"><summary>Tool-call frequency</summary>' +
          chart +
          "</details>"
        : "");
    bindStoryToggle(vm);
  }

  function bindStoryToggle(vm) {
    const cb = el("tt-story");
    if (!cb) return;
    cb.onchange = () => {
      storyMode = !!cb.checked;
      renderTimeline(vm);
    };
  }

  function storyHTML(vm) {
    const events = [];
    (vm.spans || []).forEach((s) => {
      let kind = "sys";
      if (s.cls === "ai") kind = "ai";
      else if (s.cls === "tool") kind = "tool";
      else kind = "sys";
      events.push({
        kind,
        title: s.name,
        t: "+" + (s.at || 0) + "ms",
        ms: s.ms,
        body: s.detail || null,
      });
    });
    vm.hops
      .filter((h) => (Number(h.status) || 0) >= 400)
      .forEach((h) => {
        events.push({
          kind: "err",
          title: "Hop failed · " + h.verb,
          t: h.ms + "ms",
          ms: h.ms,
          autoOpen: true,
          req: h.req,
          res: h.res,
          meta: "status=" + h.status + " req=" + shortId(h.req_id, 12),
        });
      });
    events.push({
      kind: "out",
      title: "Turn result",
      t: fmtMs(vm.metrics.total),
      meta:
        "status=" +
        vm.status +
        (vm.grade ? " · detective=" + vm.grade : ""),
    });
    if (!events.length)
      return '<div class="tt-empty-inline">No story events.</div>';
    return (
      '<div class="tt-story-spine">' +
      events
        .map((ev, i) => {
          const open = ev.autoOpen ? " open" : "";
          const payload =
            ev.req || ev.res
              ? '<div class="tt-split-io"><div class="io-card"><header>Request</header><pre></pre></div><div class="io-card"><header>Response</header><pre></pre></div></div>'
              : ev.body
                ? "<pre class=\"story-body\"></pre>"
                : "";
          return (
            '<details class="story-card kind-' +
            esc(ev.kind) +
            '"' +
            open +
            ' data-i="' +
            i +
            '"><summary><span class="skind">' +
            esc(ev.kind) +
            '</span><span class="stitle">' +
            esc(ev.title) +
            '</span><span class="st">' +
            esc(ev.t || "") +
            "</span></summary>" +
            (ev.meta
              ? '<div class="smeta">' + esc(ev.meta) + "</div>"
              : "") +
            payload +
            "</details>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  // Fill story pre via textContent after inject
  function hydrateStory(vm) {
    const panel = el("tt-panel-timeline");
    if (!panel || !storyMode) return;
    // rebuild events same as storyHTML
    const events = [];
    (vm.spans || []).forEach((s) => {
      let kind = s.cls === "ai" ? "ai" : s.cls === "tool" ? "tool" : "sys";
      events.push({ kind, title: s.name, body: s.detail, req: null, res: null });
    });
    vm.hops
      .filter((h) => (Number(h.status) || 0) >= 400)
      .forEach((h) => {
        events.push({ kind: "err", title: h.verb, req: h.req, res: h.res });
      });
    panel.querySelectorAll(".story-card").forEach((card) => {
      const i = +card.dataset.i;
      const ev = events[i];
      if (!ev) return;
      const pres = card.querySelectorAll("pre");
      if (ev.req != null || ev.res != null) {
        if (pres[0]) pres[0].textContent = prettyJSON(ev.req || {});
        if (pres[1]) pres[1].textContent = prettyJSON(ev.res || {});
      } else if (ev.body && pres[0]) {
        pres[0].textContent = String(ev.body);
      }
    });
  }

  function renderHops(vm) {
    const panel = el("tt-panel-hops");
    if (!panel || !vm) return;
    if (!vm.hops.length) {
      panel.innerHTML = '<div class="tt-empty-inline">No hops recorded for this turn.</div>';
      return;
    }
    if (hopSel >= vm.hops.length) hopSel = 0;
    // prefer preferred hop on first paint if hopSel was reset
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
          (h.preferred ? "★ " : "") +
          '<span class="mono">' +
          esc(shortId(h.req_id || "—", 12)) +
          "</span></td>" +
          "<td><strong>" +
          esc(h.verb) +
          "</strong></td>" +
          '<td><span class="status-pill ' +
          (bad ? "bad" : "ok") +
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
      '<table class="tt-table"><thead><tr><th>req_id</th><th>Verb</th><th>Status</th><th>ms</th><th>Bytes</th></tr></thead><tbody>' +
      rows +
      "</tbody></table>" +
      '<div class="tt-hop-actions"><strong>Hop detail</strong>' +
      (hop.req_id
        ? '<button type="button" class="tt-btn ghost" data-copy="' +
          esc(hop.req_id) +
          '" title="Click to copy">Copy req_id</button>'
        : "") +
      '<button type="button" class="tt-btn ghost" data-action="open-req" data-req="' +
      esc(hop.req_id || "") +
      '">Open in Hub ↗</button></div>' +
      '<div class="tt-split-io">' +
      '<div class="io-card"><header><span class="ai-lab">Request</span> <span class="tt-badge">' +
      esc(hop.verb) +
      '</span><button type="button" class="tt-btn ghost ml-auto" data-copy-from="tt-hop-req" title="Click to copy">Copy</button></header><pre id="tt-hop-req"></pre></div>' +
      '<div class="io-card"><header><span class="zeus-lab">Response</span> <span class="status-pill ' +
      ((Number(hop.status) || 0) >= 400 ? "bad" : "ok") +
      '">' +
      esc(String(hop.status)) +
      '</span><button type="button" class="tt-btn ghost ml-auto" data-copy-from="tt-hop-res" title="Click to copy">Copy</button></header><pre id="tt-hop-res"></pre></div></div>';
    const preReq = el("tt-hop-req");
    const preRes = el("tt-hop-res");
    if (preReq) preReq.textContent = prettyJSON(hop.req);
    if (preRes) preRes.textContent = prettyJSON(hop.res);
    panel.querySelectorAll("tbody tr").forEach((tr) => {
      tr.onclick = () => {
        hopSel = +tr.dataset.i;
        renderHops(vm);
      };
    });
  }

  function renderLlm(vm) {
    const panel = el("tt-panel-llm");
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
            '<button type="button" class="round-pill ' +
            (i === llmRound ? "on" : "") +
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
      '<div class="tt-split-io">' +
      '<div class="io-card"><header>AI request <button type="button" class="tt-btn ghost ml-auto" id="tt-llm-copy-req" data-copy-from="tt-llm-req" title="Click to copy">Copy</button></header><pre id="tt-llm-req"></pre></div>' +
      '<div class="io-card"><header>AI response <button type="button" class="tt-btn ghost ml-auto" id="tt-llm-copy-res" data-copy-from="tt-llm-res" title="Click to copy">Copy</button></header><pre id="tt-llm-res"></pre></div></div>';
    el("tt-llm-req").textContent = prettyJSON(r.req);
    el("tt-llm-res").textContent = prettyJSON(r.res);
    panel.querySelectorAll(".round-pill").forEach((b) => {
      b.onclick = () => {
        llmRound = +b.dataset.i;
        renderLlm(vm);
      };
    });
    wireDecompCopy();
  }

  function renderTurnInject(vm) {
    const panel = el("tt-panel-inject");
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
      '<div class="io-card"><header><span class="ai-lab">inject / catalog</span>' +
      '<button type="button" class="tt-btn ghost ml-auto" id="tt-inj-copy-req" data-copy-from="tt-inj-req" title="Click to copy">Copy</button></header><pre id="tt-inj-req"></pre></div>';
    const preReq = el("tt-inj-req");
    if (preReq) preReq.textContent = prettyJSON(bag);
  }

  function renderInject(u) {
    const panel = el("tt-panel-inject");
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
      '<div class="tt-split-io">' +
      '<div class="io-card"><header><span class="ai-lab">Unit goal + inject</span>' +
      '<button type="button" class="tt-btn ghost ml-auto" id="tt-inj-copy-req" data-copy-from="tt-inj-req" title="Click to copy">Copy</button></header><pre id="tt-inj-req"></pre></div>' +
      '<div class="io-card"><header><span class="zeus-lab">Artifact / answer</span>' +
      (u.error_code ? '<span class="status-pill bad">' + esc(u.error_code) + "</span>" : "") +
      '<button type="button" class="tt-btn ghost ml-auto" id="tt-inj-copy-res" data-copy-from="tt-inj-res" title="Click to copy">Copy</button></header><pre id="tt-inj-res"></pre></div></div>';
    const preReq = el("tt-inj-req");
    const preRes = el("tt-inj-res");
    if (preReq) preReq.textContent = prompt || "(empty goal)";
    if (preRes) preRes.textContent = u.answer || "(no artifact)";
  }

  function renderDetective(vm) {
    const panel = el("tt-panel-detective");
    if (!panel || !vm) return;
    const d = vm.detective;
    const pbs = vm.playbooks || [];
    const checks = vm.promptChecks || [];
    const g = vm.grade || "pass";
    const pg = vm.prompt_grade || "";
    const sum = vm.checkSummary || (H().detectiveCheckSummary ? H().detectiveCheckSummary(checks) : { label: "", tone: "" });
    const overviewText =
      vm.overview || (d ? "" : "Detective data not attached on this turn.");
    const gather = Array.isArray(vm.gather) ? vm.gather : [];
    const gatherHtml = gather.length
      ? '<div class="tt-gather"><div class="tt-gather-head">E2E gather</div>' +
        gather
          .map(
            (row) =>
              '<div class="tt-gather-row"><span class="k">' +
              esc(row.label) +
              '</span><span class="v">' +
              esc(row.value) +
              "</span></div>"
          )
          .join("") +
        "</div>"
      : "";
    panel.innerHTML =
      gatherHtml +
      '<div class="diag-card">' +
      '<div class="diag-badges">' +
      '<span class="tt-badge ' +
      (g === "pass" ? "ok" : g === "fail" ? "err" : "warn") +
      '">diagnosis:' +
      esc(g || "—") +
      "</span>" +
      (pg
        ? '<span class="tt-badge ' +
          (pg === "pass" ? "ok" : "warn") +
          '">prompt:' +
          esc(pg) +
          "</span>"
        : "") +
      (sum && sum.label
        ? '<span class="tt-badge ' +
          (sum.tone === "ok" ? "ok" : "err") +
          '">' +
          esc(sum.label) +
          "</span>"
        : "") +
      "</div>" +
      "<h3>" +
      esc(vm.headline || (d ? "Detective briefing" : "No detective briefing")) +
      "</h3>" +
      (overviewText ? "<p>" + esc(overviewText) + "</p>" : "") +
      (pbs.length
        ? '<div class="playbooks">' +
          pbs
            .map(
              (p, i) =>
                '<div class="playbook"><span class="num">' +
                (i + 1) +
                '</span><div><div class="id">' +
                esc(p.id) +
                "</div><div>" +
                esc(p.title) +
                (p.body ? " — " + esc(p.body) : "") +
                "</div></div></div>"
            )
            .join("") +
          "</div>"
        : '<div class="playbook empty-ok">✓ No playbooks triggered</div>') +
      (checks.length
        ? '<div class="checklist">' +
          (sum && sum.label
            ? '<div class="checklist-head' +
              (sum.tone === "ok" ? "" : " fail") +
              '">' +
              esc(sum.label) +
              "</div>"
            : "") +
          checks
            .map(
              (c) =>
                '<div class="check ' +
                (c.ok ? "pass" : "fail") +
                '"><span class="mark">' +
                (c.ok ? "✓" : "✗") +
                '</span><span class="lab">' +
                esc(c.lab) +
                "</span></div>"
            )
            .join("") +
          "</div>"
        : "") +
      '</div><div class="tt-kv"><div class="k">Support pack</div><div class="v"><button type="button" class="tt-btn" data-action="copy-pack" title="Click to copy">Copy markdown pack</button></div>' +
      '<div class="k">Hub links</div><div class="v">' +
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
      "</div></div>";
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
      '<div class="io-card raw-card"><header>TurnResult.debug / public_trace projection' +
      '<button type="button" class="tt-btn ghost ml-auto" id="tt-raw-copy" data-copy-from="tt-raw-json" title="Click to copy">Copy JSON</button></header>' +
      '<pre id="tt-raw-json" hidden></pre>' +
      '<div class="trace-dump-viewer" id="tt-raw-host"></div></div>';
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
          box.className = "tt-diagnosis fail";
          box.innerHTML =
            '<div class="eyebrow"><span class="tt-badge err">' +
            esc(u.error_code || u.status) +
            "</span></div><h3>" +
            esc(u.unit_id + " failed") +
            "</h3><p class=\"detail\">" +
            esc((u.answer || "").slice(0, 280)) +
            "</p>";
        } else {
          box.innerHTML = "";
        }
      }
      if (tab === "timeline" || tab === "detective") tab = "hops";
      setTab(tab);
      renderHops(unitVm);
      renderLlm(unitVm);
      renderInject(u);
      renderRaw(unitVm);
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

    // if filtered out, pick first visible
    const visible = vms.filter(matchesFilter);
    let vm = vms.find((v) => v.key === selectedKey);
    if (vm && !matchesFilter(vm) && visible.length) {
      selectedKey = visible[0].key;
      vm = visible[0];
      hopSel = 0;
      llmRound = 0;
    }

    // default hop to preferred
    if (vm && hopSel === 0 && vm.hops.length) {
      const pi = vm.hops.findIndex((h) => h.preferred);
      if (pi > 0 && !vm._hopTouched) hopSel = pi;
    }

    renderTurnList(vms);
    renderSession(vm);
    renderDetailHead(vm);
    renderDiagnosis(vm);

    // auto Detective once when unhealthy
    if (vm && needsDiagnosis(vm) && lastAutoTabKey !== vm.key) {
      lastAutoTabKey = vm.key;
      tab = "detective";
    }
    setTab(tab);

    renderTimeline(vm);
    if (storyMode) hydrateStory(vm);
    renderHops(vm);
    renderLlm(vm);
    renderTurnInject(vm);
    renderDetective(vm);
    renderRaw(vm);
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
    if (action === "open-pref" && vm) {
      const pi = vm.hops.findIndex((h) => h.preferred);
      hopSel = pi >= 0 ? pi : 0;
      tab = "hops";
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

    el("tt-search")?.addEventListener("input", (e) => {
      search = e.target.value || "";
      render();
    });

    el("tt-filters")?.addEventListener("click", (e) => {
      const chip = e.target.closest(".tt-chip");
      if (!chip) return;
      filter = chip.dataset.filter || "all";
      el("tt-filters")
        .querySelectorAll(".tt-chip")
        .forEach((c) => c.classList.toggle("on", c === chip));
      render();
    });

    root.querySelectorAll(".tt-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        tab = btn.dataset.tab || "timeline";
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
      toast("✓ exported");
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
