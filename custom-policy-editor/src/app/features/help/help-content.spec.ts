import { DIAGNOSTIC_CATALOG } from '../../core/validate/diagnostic-catalog';
import { HELP_SECTIONS } from './help-content';

const texts = (): string[] =>
  HELP_SECTIONS.flatMap((s) => [
    s.title,
    s.summary,
    ...s.blocks.flatMap((b) => (b.t === 'p' ? [b.text] : b.t === 'steps' || b.t === 'list' ? b.items : b.t === 'note' ? [b.title, b.text] : b.items.flatMap((i) => [i.term, i.def]))),
  ]);

describe('help content', () => {
  it('has unique section ids', () => {
    const ids = HELP_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has every section an alert links to', () => {
    const ids = new Set(HELP_SECTIONS.map((s) => s.id));
    for (const [code, e] of Object.entries(DIAGNOSTIC_CATALOG)) if (e.help) expect(ids.has(e.help.section), `${code} -> ${e.help.section}`).toBe(true);
  });

  it('links to sections that exist', () => {
    const ids = new Set(HELP_SECTIONS.map((s) => s.id));
    for (const t of texts()) for (const m of t.matchAll(/\(#\/help\/([a-z-]+)\)/g)) expect(ids.has(m[1]), m[1]).toBe(true);
  });

  it('keeps Microsoft links on the B2C documentation or the FAQ', () => {
    for (const t of texts()) for (const m of t.matchAll(/https:\/\/learn\.microsoft\.com\/[^\s)]+/g)) expect(m[0]).toMatch(/^https:\/\/learn\.microsoft\.com\/en-us\/azure\/active-directory-b2c\//);
  });

  it('uses no em or en dashes', () => {
    for (const t of texts()) expect(t).not.toMatch(/[–—]/);
  });
});
