import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allDocLinks, DIAGNOSTIC_CATALOG, lookupAlert } from './diagnostic-catalog';

const root = join(process.cwd(), 'src', 'app');
const emitters = ['core/validate/validate.ts', 'core/analysis/precondition-explainer.ts'];

describe('alert catalog', () => {
  it('has an entry for every code the validators can emit', () => {
    const codes = new Set<string>();
    for (const f of emitters) for (const m of readFileSync(join(root, f), 'utf8').matchAll(/code: '([A-Za-z0-9.]+)'/g)) codes.add(m[1]);
    expect(codes.size).toBeGreaterThan(50);
    expect([...codes].filter((c) => !DIAGNOSTIC_CATALOG[c])).toEqual([]);
  });

  it('has no entry for a code nobody emits', () => {
    const src = emitters.map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
    const unused = Object.keys(DIAGNOSTIC_CATALOG).filter((c) => !src.includes(`'${c}'`));
    expect(unused).toEqual([]);
  });

  it('links every entry to Microsoft Learn, with an explanation', () => {
    for (const [code, e] of Object.entries(DIAGNOSTIC_CATALOG)) {
      expect(e.docs.length, code).toBeGreaterThan(0);
      expect(e.why.length, code).toBeGreaterThan(20);
      expect(e.title, code).toBeTruthy();
      for (const d of e.docs) expect(d.url, code).toMatch(/^https:\/\/learn\.microsoft\.com\/en-us\/azure\/active-directory-b2c\/[a-z0-9-]+(\?pivots=b2c-custom-policy)?(#[a-z0-9-]+)?$/);
    }
    expect(allDocLinks().length).toBeGreaterThan(25);
  });

  it('marks the tool\'s own analysis alerts and points them at Help', () => {
    for (const code of ['flow.neverRuns', 'flow.input', 'flow.token', 'analysis.approximate']) expect(DIAGNOSTIC_CATALOG[code].help?.section).toBe('analysis');
  });

  it('falls back to a generic entry for unknown codes', () => {
    expect(lookupAlert('no.such.code').docs.length).toBeGreaterThan(0);
    expect(lookupAlert(undefined).title).toBeTruthy();
  });

  it('writes sentence case copy without em or en dashes', () => {
    for (const [code, e] of Object.entries(DIAGNOSTIC_CATALOG)) expect(`${e.title} ${e.why} ${e.fix ?? ''}`, code).not.toMatch(/[—–]/);
  });
});
