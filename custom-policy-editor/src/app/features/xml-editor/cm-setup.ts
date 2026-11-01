import { xml } from '@codemirror/lang-xml';
import { Diagnostic as CmDiagnostic, linter, lintGutter } from '@codemirror/lint';
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';

export interface LineDiagnostic {
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

const setReveal = StateEffect.define<{ from: number; to: number } | null>();
const revealField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setReveal)) deco = e.value ? Decoration.set([Decoration.line({ class: 'cm-reveal' }).range(e.value.from)]) : Decoration.none;
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export interface CmHandle {
  view: EditorView;
  setText(text: string): void;
  setDiagnostics(d: LineDiagnostic[]): void;
  setReadOnly(ro: boolean): void;
  reveal(line: number): void;
  destroy(): void;
}

export function createEditor(parent: HTMLElement, text: string, onChange: (text: string) => void, readOnly = false): CmHandle {
  let diags: LineDiagnostic[] = [];
  let suppress = false;
  const ro = new Compartment();
  const lint = linter(
    (view) =>
      diags
        .filter((d) => d.line >= 1 && d.line <= view.state.doc.lines)
        .map<CmDiagnostic>((d) => {
          const l = view.state.doc.line(d.line);
          return { from: l.from, to: l.to, severity: d.severity === 'info' ? 'info' : d.severity, message: d.message };
        }),
    { delay: 100 },
  );
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        basicSetup,
        xml(),
        lintGutter(),
        lint,
        revealField,
        ro.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !suppress) onChange(u.state.doc.toString());
        }),
      ],
    }),
  });
  return {
    view,
    setText(t: string) {
      if (t === view.state.doc.toString()) return;
      suppress = true;
      const sel = view.state.selection.main;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t }, selection: { anchor: Math.min(sel.anchor, t.length) } });
      suppress = false;
    },
    setDiagnostics(d: LineDiagnostic[]) {
      diags = d;
      // Force the linter to re-run.
      view.dispatch({});
    },
    setReadOnly(r: boolean) {
      view.dispatch({ effects: ro.reconfigure([EditorState.readOnly.of(r), EditorView.editable.of(!r)]) });
    },
    reveal(line: number) {
      if (line < 1 || line > view.state.doc.lines) return;
      const l = view.state.doc.line(line);
      view.dispatch({ selection: { anchor: l.from }, effects: [EditorView.scrollIntoView(l.from, { y: 'center' }), setReveal.of({ from: l.from, to: l.to })] });
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}
