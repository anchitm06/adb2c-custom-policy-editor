/**
 * A small, formatting-preserving XML parser and serializer.
 *
 * Policy files are usually hand-edited and full of comments, so a plain DOMParser/XMLSerializer
 * round trip (which rewrites `<a />` to `<a/>`, drops the XML declaration, etc.) would produce
 * noisy diffs. This parser records the raw text of every start tag and text node; the serializer
 * re-emits that raw text for anything that hasn't been modified, so an untouched document
 * serializes byte-for-byte identically.
 */

export interface XAttr {
  name: string;
  value: string;
}

export interface XElement {
  kind: 'element';
  name: string;
  attrs: XAttr[];
  children: XNode[];
  parent: XElement | null;
  /** True when written as `<x/>` in the source (or created empty). */
  selfClosing: boolean;
  /** Raw text between the tag name and `>`/`/>`, as written in the source. Cleared when attrs change. */
  rawAttrText: string | null;
  /** 1-based line/column of the `<` of the start tag. 0 for elements created by edits. */
  line: number;
  col: number;
  /** Offsets of the element in the source text (start of `<`, end after closing `>`). */
  start: number;
  end: number;
}

export interface XText {
  kind: 'text';
  /** Decoded text. */
  value: string;
  /** Raw source text (entities not decoded). Null once `value` is changed. */
  raw: string | null;
  parent: XElement | null;
}

export interface XComment {
  kind: 'comment';
  value: string;
  parent: XElement | null;
}

export interface XCData {
  kind: 'cdata';
  value: string;
  parent: XElement | null;
}

export interface XPI {
  kind: 'pi';
  raw: string;
  parent: XElement | null;
}

export type XNode = XElement | XText | XComment | XCData | XPI;

export interface XDocument {
  /** Whether the source started with a UTF-8 byte order mark. */
  bom: boolean;
  /** Raw text before the root element (XML declaration, comments, whitespace). */
  prolog: string;
  root: XElement;
  /** Raw text after the root element. */
  epilog: string;
}

export class XmlParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly col: number,
    readonly offset: number,
  ) {
    super(`${message} (line ${line}, column ${col})`);
    this.name = 'XmlParseError';
  }
}

const NAME_START = /[A-Za-z_:À-￿]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-·À-￿]/;

const ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

export function decodeEntities(raw: string): string {
  if (raw.indexOf('&') < 0) return raw;
  return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (m, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[ent] ?? m;
  });
}

export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;');
}

/** Parse XML text. Throws XmlParseError on malformed input. */
export function parseXml(input: string): XDocument {
  let text = input;
  let bom = false;
  if (text.charCodeAt(0) === 0xfeff) {
    bom = true;
    text = text.slice(1);
  }
  const p = new Parser(text);
  return p.parseDocument(bom);
}

class Parser {
  private pos = 0;
  // Line starts for fast offset -> line/col conversion.
  private readonly lineStarts: number[] = [0];

  constructor(private readonly s: string) {
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) this.lineStarts.push(i + 1);
  }

  private loc(offset: number): { line: number; col: number } {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - this.lineStarts[lo] + 1 };
  }

  private fail(message: string, offset = this.pos): never {
    const { line, col } = this.loc(offset);
    throw new XmlParseError(message, line, col, offset);
  }

  parseDocument(bom: boolean): XDocument {
    const s = this.s;
    // Prolog: declaration, comments, PIs, doctype, whitespace.
    while (this.pos < s.length) {
      if (s.startsWith('<?', this.pos)) {
        const end = s.indexOf('?>', this.pos);
        if (end < 0) this.fail('Unterminated processing instruction');
        this.pos = end + 2;
      } else if (s.startsWith('<!--', this.pos)) {
        const end = s.indexOf('-->', this.pos);
        if (end < 0) this.fail('Unterminated comment');
        this.pos = end + 3;
      } else if (s.startsWith('<!DOCTYPE', this.pos)) {
        const end = s.indexOf('>', this.pos);
        if (end < 0) this.fail('Unterminated DOCTYPE');
        this.pos = end + 1;
      } else if (s[this.pos] === '<') {
        break;
      } else if (/\s/.test(s[this.pos])) {
        this.pos++;
      } else {
        this.fail('Unexpected text before the root element');
      }
    }
    if (this.pos >= s.length) this.fail('The document has no root element');
    const prolog = s.slice(0, this.pos);
    const root = this.parseElement(null);
    const epilogStart = this.pos;
    while (this.pos < s.length) {
      if (s.startsWith('<!--', this.pos)) {
        const end = s.indexOf('-->', this.pos);
        if (end < 0) this.fail('Unterminated comment');
        this.pos = end + 3;
      } else if (s.startsWith('<?', this.pos)) {
        const end = s.indexOf('?>', this.pos);
        if (end < 0) this.fail('Unterminated processing instruction');
        this.pos = end + 2;
      } else if (/\s/.test(s[this.pos])) {
        this.pos++;
      } else {
        this.fail('Unexpected content after the root element');
      }
    }
    return { bom, prolog, root, epilog: s.slice(epilogStart) };
  }

  private readName(): string {
    const s = this.s;
    const start = this.pos;
    if (!NAME_START.test(s[this.pos] ?? '')) this.fail('Expected a name');
    this.pos++;
    while (this.pos < s.length && NAME_CHAR.test(s[this.pos])) this.pos++;
    return s.slice(start, this.pos);
  }

  private parseElement(parent: XElement | null): XElement {
    const s = this.s;
    const start = this.pos;
    if (s[this.pos] !== '<') this.fail('Expected "<"');
    this.pos++;
    const name = this.readName();
    const attrStart = this.pos;
    const attrs: XAttr[] = [];
    let selfClosing = false;
    for (;;) {
      const wsStart = this.pos;
      while (this.pos < s.length && /\s/.test(s[this.pos])) this.pos++;
      if (this.pos >= s.length) this.fail(`Unterminated start tag <${name}>`, start);
      const c = s[this.pos];
      if (c === '>') {
        break;
      }
      if (c === '/') {
        if (s[this.pos + 1] !== '>') this.fail('Expected "/>"');
        selfClosing = true;
        break;
      }
      if (this.pos === wsStart) this.fail('Expected whitespace between attributes');
      const attrName = this.readName();
      while (/\s/.test(s[this.pos] ?? '')) this.pos++;
      if (s[this.pos] !== '=') this.fail(`Expected "=" after attribute ${attrName}`);
      this.pos++;
      while (/\s/.test(s[this.pos] ?? '')) this.pos++;
      const q = s[this.pos];
      if (q !== '"' && q !== "'") this.fail(`Expected a quoted value for attribute ${attrName}`);
      const vEnd = s.indexOf(q, this.pos + 1);
      if (vEnd < 0) this.fail(`Unterminated value for attribute ${attrName}`);
      const rawValue = s.slice(this.pos + 1, vEnd);
      if (rawValue.includes('<')) this.fail(`"<" is not allowed in attribute ${attrName}`);
      if (attrs.some((a) => a.name === attrName))
        this.fail(`Duplicate attribute ${attrName}`, this.pos);
      attrs.push({ name: attrName, value: decodeEntities(rawValue) });
      this.pos = vEnd + 1;
    }
    const rawAttrText = s.slice(attrStart, this.pos);
    const { line, col } = this.loc(start);
    const el: XElement = {
      kind: 'element',
      name,
      attrs,
      children: [],
      parent,
      selfClosing,
      rawAttrText,
      line,
      col,
      start,
      end: 0,
    };
    if (selfClosing) {
      this.pos += 2;
      el.end = this.pos;
      return el;
    }
    this.pos++; // '>'
    // Content
    for (;;) {
      if (this.pos >= s.length) this.fail(`Element <${name}> is not closed`, start);
      if (s.startsWith('</', this.pos)) {
        const closeStart = this.pos;
        this.pos += 2;
        const closeName = this.readName();
        while (/\s/.test(s[this.pos] ?? '')) this.pos++;
        if (s[this.pos] !== '>') this.fail('Expected ">"');
        this.pos++;
        if (closeName !== name)
          this.fail(
            `Closing tag </${closeName}> does not match <${name}> opened on line ${line}`,
            closeStart,
          );
        el.end = this.pos;
        return el;
      }
      if (s.startsWith('<!--', this.pos)) {
        const end = s.indexOf('-->', this.pos + 4);
        if (end < 0) this.fail('Unterminated comment');
        el.children.push({ kind: 'comment', value: s.slice(this.pos + 4, end), parent: el });
        this.pos = end + 3;
        continue;
      }
      if (s.startsWith('<![CDATA[', this.pos)) {
        const end = s.indexOf(']]>', this.pos + 9);
        if (end < 0) this.fail('Unterminated CDATA section');
        el.children.push({ kind: 'cdata', value: s.slice(this.pos + 9, end), parent: el });
        this.pos = end + 3;
        continue;
      }
      if (s.startsWith('<?', this.pos)) {
        const end = s.indexOf('?>', this.pos);
        if (end < 0) this.fail('Unterminated processing instruction');
        el.children.push({ kind: 'pi', raw: s.slice(this.pos, end + 2), parent: el });
        this.pos = end + 2;
        continue;
      }
      if (s[this.pos] === '<') {
        el.children.push(this.parseElement(el));
        continue;
      }
      const tStart = this.pos;
      const next = s.indexOf('<', this.pos);
      this.pos = next < 0 ? s.length : next;
      const raw = s.slice(tStart, this.pos);
      el.children.push({ kind: 'text', value: decodeEntities(raw), raw, parent: el });
    }
  }
}

/** Serialize, re-using raw source text for unmodified parts. */
export function serializeXml(doc: XDocument): string {
  const out: string[] = [];
  if (doc.bom) out.push('﻿');
  out.push(doc.prolog);
  writeElement(doc.root, out);
  out.push(doc.epilog);
  return out.join('');
}

export function serializeElement(el: XElement): string {
  const out: string[] = [];
  writeElement(el, out);
  return out.join('');
}

function attrText(el: XElement): string {
  if (el.rawAttrText !== null) return el.rawAttrText;
  const parts = el.attrs.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`).join('');
  return parts + (el.selfClosing ? ' ' : '');
}

function writeElement(el: XElement, out: string[]): void {
  let attrs = attrText(el);
  if (el.children.length === 0 && el.selfClosing) {
    out.push(`<${el.name}${attrs}/>`);
    return;
  }
  if (el.selfClosing) attrs = attrs.replace(/\s+$/, '');
  out.push(`<${el.name}${attrs}>`);
  for (const c of el.children) writeNode(c, out);
  out.push(`</${el.name}>`);
}

function writeNode(n: XNode, out: string[]): void {
  switch (n.kind) {
    case 'element':
      writeElement(n, out);
      break;
    case 'text':
      out.push(n.raw ?? escapeText(n.value));
      break;
    case 'comment':
      out.push(`<!--${n.value}-->`);
      break;
    case 'cdata':
      out.push(`<![CDATA[${n.value}]]>`);
      break;
    case 'pi':
      out.push(n.raw);
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------------------------

export function elements(el: XElement | null | undefined, name?: string): XElement[] {
  if (!el) return [];
  const res: XElement[] = [];
  for (const c of el.children)
    if (c.kind === 'element' && (name === undefined || c.name === name)) res.push(c);
  return res;
}

export function child(el: XElement | null | undefined, name: string): XElement | null {
  if (!el) return null;
  for (const c of el.children) if (c.kind === 'element' && c.name === name) return c;
  return null;
}

export function attr(el: XElement | null | undefined, name: string): string | undefined {
  if (!el) return undefined;
  for (const a of el.attrs) if (a.name === name) return a.value;
  return undefined;
}

/** Concatenated text content (text + CDATA, recursively). */
export function textOf(el: XElement | null | undefined): string {
  if (!el) return '';
  let s = '';
  for (const c of el.children) {
    if (c.kind === 'text' || c.kind === 'cdata') s += c.value;
    else if (c.kind === 'element') s += textOf(c);
  }
  return s;
}

export function childText(el: XElement | null | undefined, name: string): string | undefined {
  const c = child(el, name);
  return c ? textOf(c).trim() : undefined;
}

/** Path of element-child indices from the root to `el`. */
export function pathOf(el: XElement): number[] {
  const path: number[] = [];
  let cur: XElement = el;
  while (cur.parent) {
    path.unshift(elements(cur.parent).indexOf(cur));
    cur = cur.parent;
  }
  return path;
}

export function elementAt(root: XElement, path: readonly number[]): XElement | null {
  let cur: XElement | undefined = root;
  for (const i of path) {
    cur = elements(cur)[i];
    if (!cur) return null;
  }
  return cur ?? null;
}

// ---------------------------------------------------------------------------------------------
// Mutation helpers (keep surrounding formatting tidy)
// ---------------------------------------------------------------------------------------------

export function setAttr(el: XElement, name: string, value: string | undefined | null): void {
  const idx = el.attrs.findIndex((a) => a.name === name);
  if (value === undefined || value === null) {
    if (idx < 0) return;
    el.attrs.splice(idx, 1);
  } else if (idx >= 0) {
    if (el.attrs[idx].value === value) return;
    el.attrs[idx] = { name, value };
  } else {
    el.attrs.push({ name, value });
  }
  el.rawAttrText = null;
}

/** Turn a self-closing element into an open/close pair (keeps raw attribute text tidy). */
function openElement(el: XElement): void {
  if (!el.selfClosing) return;
  el.selfClosing = false;
  if (el.rawAttrText !== null) el.rawAttrText = el.rawAttrText.replace(/\s+$/, '');
}

export function setText(el: XElement, value: string): void {
  openElement(el);
  el.children = [{ kind: 'text', value, raw: null, parent: el }];
}

export function createElement(
  name: string,
  attrs: Record<string, string | undefined> = {},
  text?: string,
): XElement {
  const el: XElement = {
    kind: 'element',
    name,
    attrs: Object.entries(attrs)
      .filter((e): e is [string, string] => e[1] !== undefined)
      .map(([n, v]) => ({ name: n, value: v })),
    children: [],
    parent: null,
    selfClosing: text === undefined,
    rawAttrText: null,
    line: 0,
    col: 0,
    start: 0,
    end: 0,
  };
  if (text !== undefined) setText(el, text);
  return el;
}

function depth(el: XElement): number {
  let d = 0;
  let cur = el.parent;
  while (cur) {
    d++;
    cur = cur.parent;
  }
  return d;
}

/** Detect the indentation unit used by the document (defaults to two spaces). */
function indentUnit(el: XElement): string {
  let root = el;
  while (root.parent) root = root.parent;
  for (const c of root.children) {
    if (c.kind === 'text') {
      const m = /\n([ \t]+)$/.exec(c.value);
      if (m) return m[1];
    }
  }
  return '  ';
}

/** Re-indent a freshly created subtree so it matches the document's style at `level`. */
function formatSubtree(el: XElement, level: number, unit: string): void {
  const kids = el.children.filter((c) => c.kind !== 'text' || c.value.trim() !== '');
  if (kids.length === 0) {
    el.children = [];
    return;
  }
  if (kids.length === 1 && kids[0].kind === 'text') {
    el.children = kids;
    return;
  }
  const out: XNode[] = [];
  for (const k of kids) {
    out.push({ kind: 'text', value: '\n' + unit.repeat(level + 1), raw: null, parent: el });
    k.parent = el;
    out.push(k);
    if (k.kind === 'element') formatSubtree(k, level + 1, unit);
  }
  out.push({ kind: 'text', value: '\n' + unit.repeat(level), raw: null, parent: el });
  el.children = out;
  openElement(el);
}

/**
 * Insert `node` as an element child of `parent`, at element index `index` (or append).
 * Whitespace is arranged to match the surrounding indentation.
 */
export function insertElement(
  parent: XElement,
  node: XElement,
  index?: number,
  reformat = true,
): XElement {
  const unit = indentUnit(parent);
  const level = depth(parent) + 1;
  node.parent = parent;
  if (reformat) formatSubtree(node, level, unit);
  const els = elements(parent);
  const ws = (lvl: number): XText => ({
    kind: 'text',
    value: '\n' + unit.repeat(lvl),
    raw: null,
    parent,
  });

  if (els.length === 0 && !parent.children.some((c) => c.kind === 'comment')) {
    // Empty (or whitespace-only) parent.
    openElement(parent);
    parent.children = [ws(level), node, ws(level - 1)];
    return node;
  }
  openElement(parent);
  if (index === undefined || index >= els.length) {
    // Append after the last element/comment child, before trailing whitespace.
    let i = parent.children.length;
    while (i > 0 && parent.children[i - 1].kind === 'text' && !(parent.children[i - 1] as XText).value.trim()) i--;
    parent.children.splice(i, 0, ws(level), node);
    if (i + 2 >= parent.children.length) parent.children.push(ws(level - 1));
    return node;
  }
  const before = els[index];
  const i = parent.children.indexOf(before);
  parent.children.splice(i, 0, node, ws(level));
  return node;
}

/** Remove an element and the whitespace that preceded it. */
export function removeElement(el: XElement): void {
  const parent = el.parent;
  if (!parent) return;
  const i = parent.children.indexOf(el);
  if (i < 0) return;
  let from = i;
  const prev = parent.children[i - 1];
  if (prev && prev.kind === 'text' && !prev.value.trim()) from = i - 1;
  parent.children.splice(from, i - from + 1);
  el.parent = null;
  if (elements(parent).length === 0 && parent.children.every((c) => c.kind === 'text' && !c.value.trim())) {
    parent.children = [];
    parent.selfClosing = true;
    parent.rawAttrText = parent.rawAttrText === null ? null : parent.rawAttrText.replace(/\s*$/, ' ');
  }
}

/** Get or create a child container element, inserting it before the first of `before` names. */
export function ensureChild(parent: XElement, name: string, before: readonly string[] = []): XElement {
  const existing = child(parent, name);
  if (existing) return existing;
  const el = createElement(name);
  const els = elements(parent);
  const idx = els.findIndex((e) => before.includes(e.name));
  insertElement(parent, el, idx < 0 ? undefined : idx);
  return el;
}

/** Deep clone (detached). */
export function cloneElement(el: XElement): XElement {
  const copy: XElement = {
    ...el,
    attrs: el.attrs.map((a) => ({ ...a })),
    children: [],
    parent: null,
  };
  copy.children = el.children.map((c) => {
    if (c.kind === 'element') {
      const k = cloneElement(c);
      k.parent = copy;
      return k;
    }
    return { ...c, parent: copy } as XNode;
  });
  return copy;
}

/** Move an element to a new element index within the same parent (formatting of the subtree is kept). */
export function moveElement(el: XElement, toIndex: number): void {
  const parent = el.parent;
  if (!parent) return;
  removeElement(el);
  insertElement(parent, el, toIndex, false);
}
