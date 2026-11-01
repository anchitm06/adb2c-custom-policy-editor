import { parseXml, serializeXml, XDocument } from '../xml/xml';

export interface FileMutation {
  fileId: string;
  mutate: (doc: XDocument) => void;
}

/** Apply a mutation to XML text and return the new text. */
export function applyToText(text: string, mutate: (doc: XDocument) => void): string {
  const doc = parseXml(text);
  mutate(doc);
  return serializeXml(doc);
}
