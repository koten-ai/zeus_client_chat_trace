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
    expect(getComputedStyle(grid).display).toBe("grid");
    body.remove();
    style.remove();
  });

  it("styles the Raw JSON viewer with the widget mono stack", () => {
    const dump = stripComments(css);
    expect(dump).toMatch(/\.trace-dump-viewer[\s\S]{0,500}font-family:\s*var\(--tt-mono/);
    expect(dump).toMatch(/\.trace-dump-viewer \.jsv[\s\S]{0,400}--tt-mono/);
    expect(dump).toMatch(/\.trace-dump-viewer[\s\S]{0,500}font-size:\s*11px/);
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
