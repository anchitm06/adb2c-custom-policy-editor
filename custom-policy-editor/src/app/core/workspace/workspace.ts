import { parsePolicy } from '../parse/parse-policy';
import { PolicyDoc } from '../model/types';
import { parseXml, XDocument, XmlParseError } from '../xml/xml';

export interface PolicyFile {
  id: string;
  name: string;
  text: string;
}

export interface ParsedFile extends PolicyFile {
  xdoc?: XDocument;
  doc?: PolicyDoc;
  error?: { message: string; line: number; col: number };
}

export function parseFile(f: PolicyFile): ParsedFile {
  try {
    const xdoc = parseXml(f.text);
    const doc = parsePolicy(f.id, f.name, xdoc);
    return { ...f, xdoc, doc };
  } catch (e) {
    if (e instanceof XmlParseError) {
      return { ...f, error: { message: e.message, line: e.line, col: e.col } };
    }
    return { ...f, error: { message: String((e as Error)?.message ?? e), line: 1, col: 1 } };
  }
}

let counter = 0;
export function newFileId(): string {
  counter++;
  return `f${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Sort files in inheritance order (bases first), keeping unrelated files stable. */
export function sortByInheritance(files: ParsedFile[]): ParsedFile[] {
  const byPolicy = new Map<string, ParsedFile>();
  for (const f of files) if (f.doc?.policyId) byPolicy.set(f.doc.policyId.toLowerCase(), f);
  const depthOf = (f: ParsedFile, seen = new Set<string>()): number => {
    const base = f.doc?.basePolicy?.policyId?.toLowerCase();
    if (!base || seen.has(f.id)) return 0;
    seen.add(f.id);
    const b = byPolicy.get(base);
    return b ? 1 + depthOf(b, seen) : 1;
  };
  return files
    .map((f, i) => ({ f, i, d: depthOf(f) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.f);
}
