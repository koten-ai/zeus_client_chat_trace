import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "widget.css"),
  "utf8"
);

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

function braceDepths(src) {
  const text = stripComments(src);
  const unclosed = [];
  let depth = 0;
  let line = 1;
  let inStr = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const nxt = text[i + 1];
    if (ch === "\n") line += 1;
    if (inStr) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "/" && nxt === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      line += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      unclosed.push(line);
    } else if (ch === "}") {
      depth -= 1;
      unclosed.pop();
      if (depth < 0) {
        return { depth, unclosed: [line] };
      }
    }
  }
  return { depth, unclosed };
}

describe("widget.css", () => {
  it("has balanced braces so inspector rules are not nested under an earlier selector", () => {
    const { depth, unclosed } = braceDepths(css);
    expect(depth, `unclosed { from line(s) ${unclosed.join(", ")}`).toBe(0);
  });

  it("keeps the HTML hidden attribute after author display rules", () => {
    expect(stripComments(css)).toMatch(/\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/);
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const body = document.createElement("div");
    body.className = "zeus-trace-root";
    const session = document.createElement("div");
    session.className = "tt-session";
    session.hidden = true;
    const grid = document.createElement("div");
    grid.className = "tt-body";
    grid.hidden = true;
    body.append(session, grid);
    document.body.appendChild(body);
    expect(getComputedStyle(session).display).toBe("none");
    expect(getComputedStyle(grid).display).toBe("none");
    grid.hidden = false;
    expect(getComputedStyle(grid).display).toBe("flex");
    body.remove();
    style.remove();
  });

  it("styles the Raw JSON viewer with the widget mono stack", () => {
    const dump = stripComments(css);
    expect(dump).toMatch(/\.trace-dump-viewer[\s\S]{0,500}font-family:\s*var\(--tt-mono/);
    expect(dump).toMatch(/\.trace-dump-viewer \.jsv[\s\S]{0,400}--tt-mono/);
    expect(dump).toMatch(/\.trace-dump-viewer[\s\S]{0,500}font-size:\s*11px/);
  });

  it("does not lock inspector chrome to hex dark tokens", () => {
    const dump = stripComments(css);
    expect(dump).toContain("oklch(var(--b1))");
    expect(dump).not.toContain("#0b0f14");
    expect(dump).not.toContain("#5b8cff");
    expect(dump).not.toContain("hsl(var(--b1))");
  });

  it("stacks the turn dropdown above the tab strip", () => {
    expect(stripComments(css)).toMatch(/\.tt-turn-picker\s*\{[^}]*z-index:\s*20/);
    expect(stripComments(css)).toMatch(/\.tt-turn-picker \.dropdown-content\s*\{[^}]*z-index:\s*50/);
    expect(stripComments(css)).toMatch(/\.tt-panel \.tt-tabs\s*\{[^}]*z-index:\s*0/);

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const root = document.createElement("div");
    root.className = "tt-panel";
    root.innerHTML =
      '<div class="tt-turn-picker">' +
      '<details class="dropdown" open>' +
      '<summary class="tt-turn-trigger">turn</summary>' +
      '<div class="dropdown-content tt-turns"></div>' +
      "</details></div>" +
      '<div class="tabs tt-tabs" role="tablist">' +
      '<button type="button" class="tab tt-tab">Overview</button>' +
      "</div>" +
      '<div class="tt-tab-panels"></div>';
    document.body.appendChild(root);

    const pickerZ = Number(getComputedStyle(root.querySelector(".tt-turn-picker")).zIndex);
    const menuZ = Number(getComputedStyle(root.querySelector(".dropdown-content")).zIndex);
    const tabsRaw = getComputedStyle(root.querySelector(".tt-tabs")).zIndex;
    const tabsZ = tabsRaw === "auto" ? 0 : Number(tabsRaw);
    expect(pickerZ).toBe(20);
    expect(menuZ).toBe(50);
    expect(tabsZ).toBe(0);
    expect(pickerZ).toBeGreaterThan(tabsZ);
    expect(menuZ).toBeGreaterThan(pickerZ);

    root.remove();
    style.remove();
  });

  it("brings the active turn item above the overlay host and insets the title", () => {
    const dump = stripComments(css);
    expect(dump).toMatch(
      /button\.tt-turn-item\.active\s*\{[^}]*position:\s*relative/
    );
    expect(dump).toMatch(
      /button\.tt-turn-item\.active\s*\{[^}]*z-index:\s*100000/
    );
    expect(dump).toMatch(/\.tt-title\s*\{[^}]*margin-left:\s*8px/);
    expect(dump).toMatch(/\.tt-header\s*\{[^}]*padding:\s*8px 12px/);

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const root = document.createElement("div");
    root.className = "tt-panel";
    root.innerHTML =
      '<header class="tt-header">' +
      '<h2 id="debug-panel-title" class="tt-title">Turn traces</h2>' +
      "</header>" +
      '<button type="button" class="tt-turn-item active">turn</button>' +
      '<button type="button" class="tt-turn-item">other</button>';
    document.body.appendChild(root);

    const active = root.querySelector("button.tt-turn-item.active");
    const idle = root.querySelector("button.tt-turn-item:not(.active)");
    const title = root.querySelector("#debug-panel-title");
    const header = root.querySelector(".tt-header");
    const activeZ = Number(getComputedStyle(active).zIndex);
    expect(getComputedStyle(active).position).toBe("relative");
    expect(activeZ).toBe(100000);
    expect(activeZ).toBeGreaterThan(99999);
    expect(getComputedStyle(idle).position).not.toBe("relative");
    expect(getComputedStyle(title).marginLeft).toBe("8px");
    expect(getComputedStyle(header).paddingLeft).toBe("12px");
    expect(getComputedStyle(header).paddingRight).toBe("12px");
    expect(getComputedStyle(header).paddingTop).toBe("8px");

    root.remove();
    style.remove();
  });

  it("lays out envelope copy-id, diagnosis grid, tools KPIs, and raw Copy JSON", () => {
    const dump = stripComments(css);
    expect(dump).not.toMatch(/\.tt-panel \.det-diag-card\s*\{/);
    expect(dump).toContain("grid-template-columns: max-content 1fr");
    expect(dump).toContain(".tt-panel .raw-head");
    expect(dump).toContain(".tt-panel .env-kpi");
    expect(dump).toContain(".tt-panel .diag-grid");
    expect(dump).toContain("font-size: 15px");

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const root = document.createElement("div");
    root.className = "tt-panel";
    root.innerHTML =
      '<div class="card border border-base-300 det-card"><div class="card-body p-4">' +
      '<dl class="det-env"><dt>req_id</dt><dd>' +
      '<span class="tt-copy-id"><span class="tt-copy-id-val">abc-123</span>' +
      '<button type="button" class="btn btn-square"></button></span></dd></dl></div></div>' +
      '<div class="diag-grid"></div>' +
      '<div class="env-kpi"><div class="stat kpi-tile"><div class="stat-value kpi-val">12</div></div></div>' +
      '<div class="card io-card border border-base-300"><header>AI request' +
      '<button type="button" class="btn ml-auto">Copy</button></header></div>' +
      '<div class="raw-head"><h2 class="card-title">Raw bundle</h2>' +
      '<button type="button" class="btn ml-auto" id="tt-raw-copy">Copy JSON</button></div>';
    document.body.appendChild(root);

    const card = root.querySelector(".card.border");
    expect(getComputedStyle(card).borderTopWidth).toBe("1px");
    const env = root.querySelector(".det-env");
    expect(getComputedStyle(env).display).toBe("grid");
    expect(getComputedStyle(env).gridTemplateColumns).toMatch(/max-content/);
    const copyId = root.querySelector(".tt-copy-id");
    expect(getComputedStyle(copyId).display).toMatch(/flex/);
    expect(getComputedStyle(root.querySelector(".tt-copy-id-val")).whiteSpace).toBe("nowrap");
    const copyBtn = root.querySelector(".tt-copy-id .btn");
    expect(getComputedStyle(copyBtn).width).toBe("1.25rem");
    expect(getComputedStyle(copyBtn).height).toBe("1.25rem");
    const diag = root.querySelector(".diag-grid");
    expect(getComputedStyle(diag).display).toBe("grid");
    const kpi = root.querySelector(".kpi-val");
    expect(getComputedStyle(kpi).fontSize).toBe("15px");
    expect(getComputedStyle(kpi).fontWeight).toMatch(/^(600|bold)$/);
    const ioHead = root.querySelector(".io-card > header");
    expect(getComputedStyle(ioHead).display).toBe("flex");
    const rawHead = root.querySelector(".raw-head");
    expect(getComputedStyle(rawHead).display).toBe("flex");
    expect(getComputedStyle(root.querySelector("#tt-raw-copy")).marginLeft).toBe("auto");

    root.remove();
    style.remove();
  });

  it("declares .tt-panel at the top level", () => {
    const text = stripComments(css);
    let depth = 0;
    let inStr = null;
    let token = "";
    const topLevel = new Set();
    const flushSelector = () => {
      if (depth !== 0) return;
      const sel = token.replace(/\s+/g, " ").trim();
      if (sel) topLevel.add(sel);
      token = "";
    };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (ch === "\\" ) {
          i += 1;
          continue;
        }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        continue;
      }
      if (ch === "{") {
        flushSelector();
        depth += 1;
        continue;
      }
      if (ch === "}") {
        depth = Math.max(0, depth - 1);
        token = "";
        continue;
      }
      if (ch === "}" || ch === "@") continue;
      if (depth === 0) token += ch;
    }
    const joined = [...topLevel].join("\n");
    expect(joined).toMatch(/(^|,)\s*\.tt-panel(\s|,|$)/m);
  });
});
