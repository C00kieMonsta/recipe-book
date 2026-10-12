#!/usr/bin/env node
// Checks WCAG 2.1 contrast ratios for the design tokens in apps/frontend/src/index.css.
// Usage: node scripts/check-contrast.mjs [path/to/index.css]
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const cssPath =
  process.argv[2] ?? fileURLToPath(new URL("../apps/frontend/src/index.css", import.meta.url));

// [foreground token, background token, minimum ratio]
const PAIRS = [
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["primary", "background", 4.5],
  ["primary", "card", 4.5],
  ["success", "background", 4.5],
  ["success", "success-soft", 4.5],
  ["warning", "background", 4.5],
  ["warning", "warning-soft", 4.5],
  ["info", "background", 4.5],
  ["info", "info-soft", 4.5],
  ["destructive", "background", 4.5],
  ["destructive", "destructive-soft", 4.5],
  ["foreground", "surface", 4.5],
  ["foreground", "primary-soft", 4.5],
  ["sidebar-foreground", "sidebar-background", 4.5],
  ["sidebar-foreground", "sidebar-accent", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["destructive-foreground", "destructive", 4.5],
];

function parseTokens(css) {
  const root = css.match(/:root\s*\{([^}]*)\}/);
  if (!root) throw new Error(`no :root block found in ${cssPath}`);
  const tokens = new Map();
  const decl = /--([a-z0-9-]+)\s*:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*;/g;
  for (const m of root[1].matchAll(decl)) {
    tokens.set(m[1], hslToRgb(Number(m[2]), Number(m[3]) / 100, Number(m[4]) / 100));
  }
  return tokens;
}

// Returns 8-bit sRGB channels, rounded like a browser would.
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] :
    hp < 2 ? [x, c, 0] :
    hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] :
    hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m].map((v) => Math.round(v * 255));
}

function luminance([r, g, b]) {
  const lin = (v) => {
    const u = v / 255;
    return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const tokens = parseTokens(fs.readFileSync(cssPath, "utf8"));
let failures = 0;
const rows = PAIRS.map(([fg, bg, min]) => {
  const missing = [fg, bg].filter((t) => !tokens.has(t));
  if (missing.length) {
    failures++;
    return [`${fg} on ${bg}`, "-", `MISSING ${missing.join(", ")}`];
  }
  const ratio = contrast(tokens.get(fg), tokens.get(bg));
  const ok = ratio >= min;
  if (!ok) failures++;
  return [`${fg} on ${bg}`, ratio.toFixed(2), ok ? "pass" : `FAIL (min ${min})`];
});

const w0 = Math.max(...rows.map((r) => r[0].length));
console.log(`${"pair".padEnd(w0)}  ratio  result`);
for (const [pair, ratio, result] of rows) {
  console.log(`${pair.padEnd(w0)}  ${ratio.padStart(5)}  ${result}`);
}
console.log(`\n${rows.length - failures}/${rows.length} pairs pass (${cssPath})`);
process.exit(failures ? 1 : 0);
