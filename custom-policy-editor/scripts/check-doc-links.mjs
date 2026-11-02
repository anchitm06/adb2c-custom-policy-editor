#!/usr/bin/env node
/**
 * Checks that every Microsoft Learn link used by alerts and the Help page still works, including
 * the #anchor. Usage: node --experimental-strip-types scripts/check-doc-links.mjs [--report file]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const catalog = 'src/app/core/validate/diagnostic-catalog.ts';
// The Help text has no imports, so its links are read straight from the source.
const helpText = 'src/app/features/help/help-content.ts';

const links = new Map();
const mod = await import(pathToFileURL(resolve(root, catalog)).href);
for (const l of mod.allDocLinks()) if (!links.has(l.url)) links.set(l.url, { ...l, from: catalog });
for (const m of readFileSync(resolve(root, helpText), 'utf8').matchAll(/https:\/\/learn\.microsoft\.com\/[^\s)'"`\]]+/g)) {
  if (!links.has(m[0])) links.set(m[0], { label: 'Help page link', url: m[0], from: helpText });
}

const pages = new Map();
for (const l of links.values()) {
  const [page, anchor] = l.url.split('#');
  if (!pages.has(page)) pages.set(page, { anchors: new Set(), users: [] });
  const p = pages.get(page);
  if (anchor) p.anchors.add(anchor);
  p.users.push(l);
}

async function fetchPage(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'b2c-policy-editor-link-check', accept: 'text/html' } });
      return { status: res.status, html: res.ok ? await res.text() : '' };
    } catch (e) {
      if (attempt === 3) return { status: 0, html: '', error: String(e) };
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

const results = [];
const queue = [...pages.entries()];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [url, info] = item;
      const { status, html, error } = await fetchPage(url);
      if (status !== 200) {
        results.push({ url, problem: `HTTP ${status || 'error'} ${error ?? ''}`.trim() });
        continue;
      }
      for (const a of info.anchors) {
        const found = new RegExp(`(?:id|name)="${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(html);
        if (!found) results.push({ url: `${url}#${a}`, problem: 'anchor not found on the page' });
      }
    }
  }),
);

const lines = [`Checked ${links.size} links on ${pages.size} pages.`];
if (results.length) {
  lines.push(`${results.length} problem${results.length > 1 ? 's' : ''}:`);
  for (const r of results.sort((a, b) => a.url.localeCompare(b.url))) lines.push(`- ${r.url}: ${r.problem}`);
} else lines.push('All links and anchors are fine.');
const text = lines.join('\n');
console.log(text);
const i = process.argv.indexOf('--report');
if (i > 0) writeFileSync(process.argv[i + 1], text + '\n');
process.exit(results.length ? 1 : 0);
