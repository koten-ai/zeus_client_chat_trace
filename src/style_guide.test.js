import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initZeusTrace } from "./trace.js";

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, "widget.html"), "utf8");
const css = readFileSync(join(dir, "widget.css"), "utf8");
const panel = readFileSync(join(dir, "panel.js"), "utf8");
const helpers = readFileSync(join(dir, "helpers.js"), "utf8");
const bootstrap = readFileSync(join(dir, "bootstrap.js"), "utf8");

const DINGBATS = ["★", "↗", "✓", "✗", "⚠", "📁"];

describe("STYLE_HTML_CSS chrome contract", () => {
  it("pins DaisyUI 4.12.10 in the shadow and Inter on document.head", () => {
    expect(bootstrap).toContain("cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css");
    expect(bootstrap).toContain("fonts.googleapis.com/css2?family=Inter");
    expect(bootstrap).toContain('data-theme", "light"');
    expect(bootstrap).not.toContain("cdn.tailwindcss.com");
  });

  it("uses DaisyUI inspector chrome and Detective IA tab order", () => {
    const order = [
      'data-tab="overview"',
      'data-tab="diagnosis"',
      'data-tab="prompt"',
      'data-tab="timeline"',
      'data-tab="tools"',
      'data-tab="session"',
      'data-tab="raw"',
    ];
    const idxs = order.map((s) => html.indexOf(s));
    expect(idxs.every((i) => i >= 0)).toBe(true);
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
    for (const gone of ['data-tab="hops"', 'data-tab="llm"', 'data-tab="inject"', 'data-tab="detective"']) {
      expect(html).not.toContain(gone);
    }
    expect(html).toContain("tabs tabs-boxed tt-tabs");
    expect(html).toContain("badge badge-ghost badge-sm");
    expect(html).toContain("btn btn-xs btn-primary");
    expect(html).toContain('id="tt-detective"');
    expect(html).toContain('id="tt-turn-dropdown"');
    expect(html).toContain('id="tt-turn-summary"');
    expect(html).toContain("dropdown-content");
    expect(html).toContain("border border-base-300");
    expect(html).toContain("Turn traces");
    expect(html).not.toContain("Zeus Tracer</h2>");
    expect(html).not.toContain('id="tt-search"');
    expect(html).not.toContain("tt-turn-list");
  });

  it("places the turn dropdown above the tab strip", () => {
    const idxPicker = html.indexOf("tt-turn-picker");
    const idxTabs = html.indexOf('role="tablist" aria-label="Turn detail"');
    expect(idxPicker).toBeGreaterThan(0);
    expect(idxPicker).toBeLessThan(idxTabs);
    expect(html).toContain('id="tt-turn-picker-label"');
    expect(html).toContain('aria-labelledby="tt-turn-picker-label"');
    expect(html.indexOf('id="tt-turn-dropdown"')).toBeLessThan(html.indexOf('id="tt-turns"'));
    expect(css).toMatch(/\.tt-turn-picker\s*\{[^}]*z-index:\s*20/);
    expect(css).toMatch(/\.tt-turn-picker \.dropdown-content\s*\{[^}]*z-index:\s*50/);
    expect(css).toMatch(
      /button\.tt-turn-item\.active\s*\{[^}]*position:\s*relative/
    );
    expect(css).toMatch(
      /button\.tt-turn-item\.active\s*\{[^}]*z-index:\s*100000/
    );
  });

  it("insets the traces title from the panel edge in widget.css", () => {
    expect(css).toMatch(/\.tt-title\s*\{[^}]*margin-left:\s*8px/);
    expect(css).toMatch(/\.tt-header\s*\{[^}]*padding:\s*8px 12px/);
    expect(html).toContain('id="debug-panel-title"');
    expect(html).toContain("Turn traces");
  });

  it("hides header tools until a request exists", () => {
    expect(html).toMatch(/id="tt-turn-count"[^>]*hidden/);
    expect(html).toMatch(/class="tt-hdr-actions"[^>]*hidden|class="tt-hdr-actions" hidden/);
    expect(html).not.toContain("tt-client-ver");
    expect(panel).toContain("countEl.hidden = !hasRequest");
    expect(panel).toContain("actions.hidden = !hasRequest");
  });

  it("does not use navbar, breadcrumbs, or .tt-btn in the inspector", () => {
    expect(html).not.toContain("navbar-start");
    expect(html).not.toContain("navbar-end");
    expect(html).not.toContain("breadcrumbs");
    expect(html).not.toContain("tt-btn");
    expect(panel).not.toContain("tt-btn");
    expect(helpers).not.toContain("tt-btn");
    expect(panel).toContain('document.createElement("button")');
  });

  it("forbids dingbats in panel and helper JS", () => {
    for (const ch of DINGBATS) {
      expect(panel, `${ch} still in panel.js`).not.toContain(ch);
      expect(helpers, `${ch} still in helpers.js`).not.toContain(ch);
    }
  });

  it("uses OKLCH semantic tokens and Hub waterfall bars", () => {
    expect(css).toContain("oklch(var(--b1))");
    expect(css).toContain("oklch(var(--b3))");
    expect(css).not.toContain("#0b0f14");
    expect(css).not.toContain("#5b8cff");
    expect(css).not.toContain("hsl(var(--b1))");
    expect(css).not.toMatch(/\.tt-btn\s*,|\.tt-btn\s*\{/);
    expect(css).toContain("grid-template-columns: max-content 1fr max-content");
    expect(helpers).toContain("tw-bar");
    expect(panel).not.toContain("tt-story");
  });

  it("forces [hidden] to display none", () => {
    expect(css).toMatch(/\.tt-body\[hidden\]/);
    expect(css).toMatch(/#tt-turn-count\[hidden\]/);
    expect(css).toMatch(/\.tt-hdr-actions\[hidden\]/);
    expect(css).toMatch(/\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/);
  });

  it("renders envelope IDs as value plus copy icon, not a UUID button", () => {
    expect(panel).toContain("function copyValueRow");
    const start = panel.indexOf("function copyValueRow");
    const block = panel.slice(start, panel.indexOf("function isCopyableIdKey"));
    expect(block).toContain("tt-copy-id");
    expect(block).toContain("tt-copy-id-val");
    expect(block).toContain("btn btn-ghost btn-xs btn-square");
    expect(block).toContain('iconSvg("clipboard"');
    expect(block).toContain("aria-label");
    expect(panel).toContain("copyValueRow(value)");
    expect(css).toContain(".tt-panel .det-env .tt-copy-id");
    const envRule = css.slice(css.indexOf(".tt-panel .det-env {"), css.indexOf(".tt-panel .det-env dt"));
    expect(envRule).toContain("grid-template-columns: max-content 1fr");
    const copyCss = css.slice(
      css.indexOf(".tt-panel .det-env .tt-copy-id"),
      css.indexOf(".tt-copy-id {")
    );
    expect(copyCss).toContain("white-space: nowrap");
  });

  it("renders diagnosis findings as nested DaisyUI cards", () => {
    const start = panel.indexOf("function diagNestedCardHTML");
    const end = panel.indexOf("function renderDetOverview");
    const chunk = panel.slice(start, end);
    expect(chunk).not.toContain("list-disc");
    expect(chunk).toContain("diagNestedCardHTML");
    expect(chunk).toContain("card bg-base-200 border border-base-300");
    const diag = panel.slice(
      panel.indexOf("function renderDetDiagnosis"),
      panel.indexOf("function renderDetPrompt")
    );
    expect(diag).not.toContain("list-disc");
    expect(diag).toContain("diagNestedCardStackHTML");
    expect(css).not.toMatch(/\.tt-panel \.det-diag-card\s*\{/);
  });
});

describe("idle header vs request chrome", () => {
  let root;
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ v1: [], v2: [] }) })
    );
    root = document.createElement("div");
    root.innerHTML = html;
    document.body.appendChild(root);
  });
  afterEach(() => {
    root?.remove();
    vi.restoreAllMocks();
  });

  it("keeps Export/Copy/Detective hidden until a turn exists", () => {
    initZeusTrace(root, { zeusApiUrl: "" });
    expect(root.querySelector("#tt-turn-count").hidden).toBe(true);
    expect(root.querySelector(".tt-hdr-actions").hidden).toBe(true);
    expect(root.querySelector(".tt-title").textContent).toBe("Turn traces");
    expect(root.querySelector("#tt-body").hidden).toBe(true);
  });
});
