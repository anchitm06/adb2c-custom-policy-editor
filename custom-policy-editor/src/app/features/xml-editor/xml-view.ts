import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { elementAt, XElement } from '../../core/xml/xml';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { downloadText } from '../../shared/present';
import { LineDiagnostic } from './cm-setup';
import { XmlEditor } from './xml-editor';

/** Full-file XML editing with live validation; visual views update as you type. */
@Component({
  selector: 'app-xml-view',
  imports: [XmlEditor, Icon],
  template: `
    <div class="tabs">
      @for (f of store.parsed(); track f.id) {
        <button class="tab" [class.on]="f.id === fileId()" (click)="store.xmlFileId.set(f.id)" [title]="f.name">
          <span class="layer">{{ store.layerOf(f.id) || 'none' }}</span> {{ f.name }}
          @if (f.error) {
            <span class="dot error"></span>
          }
        </button>
      }
      <span class="spacer"></span>
      @if (file(); as f) {
        <button class="btn ghost sm" (click)="download()"><app-icon name="download" [size]="13" /> Download</button>
      }
    </div>
    @if (file()?.error; as e) {
      <div class="banner error small"><app-icon name="error" [size]="14" /> {{ e.message }}. The visual views keep showing the last valid version of this file until the XML is fixed.</div>
    }
    @if (file(); as f) {
      <app-xml-editor class="fill" [text]="f.text" [diagnostics]="lineDiags()" [revealLine]="reveal()" (changed)="store.setFileText(f.id, $event)" />
    } @else {
      <div class="empty">No file selected.</div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .tabs { display: flex; align-items: center; gap: 2px; padding: 4px 8px 0; border-bottom: 1px solid var(--border); background: var(--surface-2); overflow-x: auto; }
    .tab { border: 1px solid transparent; border-bottom: 0; background: none; font: inherit; font-size: var(--text-sm); padding: 6px 10px; border-radius: var(--radius-input) 6px 0 0; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; color: var(--text-2); white-space: nowrap; }
    .tab.on { background: var(--surface); border-color: var(--border); color: var(--text); font-weight: 600; margin-bottom: -1px; }
    .banner { margin: 8px; }
    app-xml-editor { flex: 1; min-height: 0; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XmlView {
  protected readonly store = inject(EditorStore);
  protected readonly fileId = computed(() => {
    const id = this.store.xmlFileId();
    const files = this.store.parsed();
    return files.some((f) => f.id === id) ? id : (this.store.activeJourney()?.ref.fileId ?? files[0]?.id ?? null);
  });
  protected readonly file = computed(() => this.store.parsed().find((f) => f.id === this.fileId()) ?? null);
  protected readonly lineDiags = computed<LineDiagnostic[]>(() => {
    const id = this.fileId();
    return this.store.diagnostics().filter((d) => d.ref?.fileId === id && d.ref.line > 0).map((d) => ({ line: d.ref!.line, severity: d.severity, message: d.message }));
  });
  protected readonly reveal = signal<number | null>(null);

  constructor() {
    effect(() => {
      const r = this.store.pendingReveal();
      if (!r) return;
      this.store.xmlFileId.set(r.fileId);
      const f = this.store.parsed().find((x) => x.id === r.fileId);
      const line = r.line || (f?.xdoc ? lineOf(f.xdoc.root, r.path) : 1);
      this.reveal.set(null);
      queueMicrotask(() => this.reveal.set(line));
      this.store.pendingReveal.set(null);
    });
  }

  protected download(): void {
    const f = this.file();
    if (f) downloadText(f.name, f.text);
  }
}

function lineOf(root: XElement, path: readonly number[]): number {
  return elementAt(root, path)?.line ?? 1;
}
