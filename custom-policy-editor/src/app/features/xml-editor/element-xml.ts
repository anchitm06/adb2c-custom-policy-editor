import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { replaceElementXml } from '../../core/edit/commands';
import { SourceRef } from '../../core/model/types';
import { elementAt, parseXml, serializeElement, XmlParseError } from '../../core/xml/xml';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { XmlEditor } from './xml-editor';

/** Edit the XML of a single element; applied as one undoable edit. */
@Component({
  selector: 'app-element-xml',
  imports: [XmlEditor, Icon],
  template: `
    <div class="row bar">
      <span class="muted small truncate grow">{{ store.fileName(ref().fileId) }}, line {{ line() }}</span>
      <button class="btn sm ghost" title="Show in the file" (click)="store.revealRef(ref())"><app-icon name="external" [size]="13" /> Open in file</button>
      <button class="btn sm" [disabled]="!dirty()" (click)="draft.set(null)">Revert</button>
      <button class="btn sm primary" [disabled]="!dirty() || !!error()" (click)="apply()">Apply</button>
    </div>
    @if (error(); as e) {
      <div class="banner error small">{{ e }}</div>
    }
    <app-xml-editor [text]="draft() ?? original()" [debounceMs]="150" (changed)="draft.set($event)" />
  `,
  styles: `
    :host { display: block; }
    .bar { margin-bottom: 6px; }
    app-xml-editor { height: 340px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElementXml {
  protected readonly store = inject(EditorStore);
  readonly ref = input.required<SourceRef>();
  readonly label = input('Edit XML');
  protected readonly draft = signal<string | null>(null);

  protected readonly original = computed(() => {
    const r = this.ref();
    const f = this.store.fileById().get(r.fileId);
    const el = f?.xdoc ? elementAt(f.xdoc.root, r.path) : null;
    if (!el) return '';
    return dedent(serializeElement(el), el.col - 1);
  });
  protected readonly line = computed(() => {
    const r = this.ref();
    const f = this.store.fileById().get(r.fileId);
    return (f?.xdoc ? elementAt(f.xdoc.root, r.path)?.line : 0) ?? 0;
  });
  protected readonly dirty = computed(() => this.draft() !== null && this.draft() !== this.original());
  protected readonly error = computed(() => {
    const d = this.draft();
    if (d === null) return null;
    try {
      parseXml(d);
      return null;
    } catch (e) {
      return e instanceof XmlParseError ? e.message : String(e);
    }
  });

  protected apply(): void {
    const d = this.draft();
    const r = this.ref();
    if (d === null) return;
    if (this.store.edit(this.label(), [{ fileId: r.fileId, mutate: (doc) => replaceElementXml(doc, r, d) }])) this.draft.set(null);
  }
}

function dedent(text: string, col: number): string {
  if (col <= 0) return text;
  const pad = new RegExp(`^[ \\t]{0,${col}}`);
  return text
    .split('\n')
    .map((l, i) => (i === 0 ? l : l.replace(pad, '')))
    .join('\n');
}
