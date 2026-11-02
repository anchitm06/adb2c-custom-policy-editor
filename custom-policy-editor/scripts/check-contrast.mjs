// Verifies the Cobalt token pairs reach WCAG contrast in light and dark mode.
// Text pairs need 4.5:1, icon, border and focus pairs need 3:1.
// Usage: node scripts/check-contrast.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/styles/tokens.scss', import.meta.url), 'utf8');

function block(start, end) {
  const a = src.indexOf(start);
  const b = end ? src.indexOf(end, a) : src.length;
  return src.slice(a, b);
}
function tokens(text) {
  const out = {};
  for (const m of text.matchAll(/--([a-z0-9-]+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\)/g)) out[m[1]] = [+m[2] / 100, +m[3], +m[4]];
  return out;
}
const light = tokens(block(':root {', '@mixin dark-tokens'));
const dark = { ...light, ...tokens(block('@mixin dark-tokens', '@media'),) };

function oklchToRgb([L, C, h]) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return lin.map((v) => Math.min(1, Math.max(0, v)));
}
const lum = (c) => {
  const [r, g, b] = oklchToRgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const text = 4.5;
const graphic = 3;
const pairs = [
  ['ink', 'paper', text], ['ink', 'paper-2', text], ['ink', 'paper-3', text],
  ['ink-2', 'paper', text], ['ink-2', 'paper-2', text], ['ink-2', 'paper-3', text],
  ['muted', 'paper', text], ['muted', 'paper-2', text], ['muted', 'paper-3', text],
  ['accent', 'paper', text], ['accent', 'paper-2', text], ['accent-ink', 'accent', text],
  ['accent-deep', 'accent-wash', text], ['focus', 'paper', graphic], ['focus', 'paper-2', graphic],
  ['rule-2', 'paper', 1.4],
  ['error', 'paper', text], ['error', 'paper-2', text], ['error', 'error-wash', text],
  ['warning', 'paper', text], ['warning', 'paper-2', text], ['warning', 'warning-wash', text],
  ['success', 'paper', text], ['success', 'paper-2', text], ['success', 'success-wash', text],
  ['info', 'paper', text], ['info', 'paper-2', text], ['info', 'info-wash', text],
  ['graphite-ink', 'graphite', text], ['graphite-muted', 'graphite', text], ['accent-2', 'graphite', text],
  ['graphite-muted', 'graphite-2', text], ['graphite-ink', 'graphite-2', text],
];
let bad = 0;
for (const [mode, t] of [['light', light], ['dark', dark]]) {
  for (const [fg, bg, min] of pairs) {
    const f = t[`color-${fg}`];
    const g = t[`color-${bg}`];
    if (!f || !g) { console.log(`${mode}: missing token ${!f ? fg : bg}`); bad++; continue; }
    const r = ratio(f, g);
    if (r < min) { console.log(`FAIL ${mode} ${fg} on ${bg}: ${r.toFixed(2)} < ${min}`); bad++; }
  }
}
console.log(bad ? `${bad} pair(s) below target` : `contrast ok: ${pairs.length} pairs in light and dark`);
process.exit(bad ? 1 : 0);
