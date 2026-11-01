import { readSample } from '../../../testing/samples';
import { attr, child, createElement, elements, insertElement, moveElement, parseXml, removeElement, serializeXml, setAttr, XmlParseError } from './xml';

describe('xml parser', () => {
  it('round-trips the starter pack byte for byte', () => {
    for (const f of ['TrustFrameworkBase.xml', 'TrustFrameworkLocalization.xml', 'TrustFrameworkExtensions.xml', 'SignUpOrSignin.xml']) {
      const text = readSample('SocialAndLocalAccounts', f);
      expect(serializeXml(parseXml(text))).toBe(text);
    }
  });

  it('reports line and column of errors', () => {
    try {
      parseXml('<a>\n  <b></c>\n</a>');
      throw new Error('should fail');
    } catch (e) {
      expect(e).toBeInstanceOf(XmlParseError);
      expect((e as XmlParseError).line).toBe(2);
    }
  });

  it('decodes entities and keeps comments', () => {
    const d = parseXml('<a x="1 &amp; 2"><!-- hi --><b>&lt;t&gt;</b></a>');
    expect(attr(d.root, 'x')).toBe('1 & 2');
    expect(d.root.children[0].kind).toBe('comment');
    expect(serializeXml(d)).toBe('<a x="1 &amp; 2"><!-- hi --><b>&lt;t&gt;</b></a>');
  });

  it('inserts with matching indentation', () => {
    const d = parseXml('<a>\n  <list>\n    <i n="1" />\n  </list>\n</a>');
    const list = child(d.root, 'list')!;
    insertElement(list, createElement('i', { n: '2' }));
    expect(serializeXml(d)).toBe('<a>\n  <list>\n    <i n="1" />\n    <i n="2" />\n  </list>\n</a>');
    insertElement(list, createElement('i', { n: '0' }), 0);
    expect(serializeXml(d)).toBe('<a>\n  <list>\n    <i n="0" />\n    <i n="1" />\n    <i n="2" />\n  </list>\n</a>');
  });

  it('inserts into an empty element and removes cleanly', () => {
    const d = parseXml('<a>\n  <list />\n</a>');
    const list = child(d.root, 'list')!;
    const n = insertElement(list, createElement('i', { n: '1' }));
    expect(serializeXml(d)).toBe('<a>\n  <list>\n    <i n="1" />\n  </list>\n</a>');
    removeElement(n);
    expect(serializeXml(d)).toBe('<a>\n  <list />\n</a>');
  });

  it('nests new subtrees', () => {
    const d = parseXml('<a>\n  <list>\n  </list>\n</a>');
    const list = child(d.root, 'list')!;
    const p = createElement('p', { k: 'v' });
    p.children.push(createElement('v', {}, 'text'));
    p.selfClosing = false;
    insertElement(list, p);
    expect(serializeXml(d)).toBe('<a>\n  <list>\n    <p k="v">\n      <v>text</v>\n    </p>\n  </list>\n</a>');
  });

  it('moves elements and edits attributes', () => {
    const d = parseXml('<a>\n  <i n="1" />\n  <i n="2" />\n  <i n="3" />\n</a>');
    moveElement(elements(d.root)[2], 0);
    setAttr(elements(d.root)[0], 'n', '3!');
    expect(serializeXml(d)).toBe('<a>\n  <i n="3!" />\n  <i n="1" />\n  <i n="2" />\n</a>');
  });
});
