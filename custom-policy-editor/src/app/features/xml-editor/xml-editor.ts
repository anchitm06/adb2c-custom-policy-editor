import { ChangeDetectionStrategy, Component, effect, ElementRef, input, OnDestroy, output, signal, untracked, viewChild } from '@angular/core';
import type { CmHandle, LineDiagnostic } from './cm-setup';

/** CodeMirror 6 XML editor (lazy loaded). */
@Component({
  selector: 'app-xml-editor',
  template: `<div #host class="host"></div>
    @if (!ready()) {
      <div class="loading muted small">Loading editor…</div>
    }`,
  styles: `
    :host { display: block; position: relative; min-height: 120px; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
    :host(.fill) { height: 100%; border: 0; border-radius: 0; }
    .host { height: 100%; }
    .loading { position: absolute; top: 8px; left: 12px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XmlEditor implements OnDestroy {
  readonly text = input.required<string>();
  readonly readOnly = input(false);
  readonly diagnostics = input<LineDiagnostic[]>([]);
  /** Set to a line number to scroll there and highlight it. */
  readonly revealLine = input<number | null>(null);
  readonly changed = output<string>();
  readonly debounceMs = input(350);

  protected readonly ready = signal(false);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private handle: CmHandle | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastEmitted: string | null = null;

  constructor() {
    void import('./cm-setup').then((m) => {
      this.handle = m.createEditor(this.host().nativeElement, untracked(this.text), (t) => this.onEdit(t), untracked(this.readOnly));
      this.handle.setDiagnostics(untracked(this.diagnostics));
      const line = untracked(this.revealLine);
      if (line) this.handle.reveal(line);
      this.ready.set(true);
    });
    effect(() => {
      const t = this.text();
      if (!this.ready() || !this.handle) return;
      // Ignore echoes of our own edits that are still pending.
      if (t === this.lastEmitted) return;
      this.handle.setText(t);
    });
    effect(() => {
      const d = this.diagnostics();
      if (this.ready()) this.handle?.setDiagnostics(d);
    });
    effect(() => {
      const r = this.readOnly();
      if (this.ready()) this.handle?.setReadOnly(r);
    });
    effect(() => {
      const l = this.revealLine();
      if (this.ready() && l) this.handle?.reveal(l);
    });
  }

  private onEdit(t: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.lastEmitted = t;
      this.changed.emit(t);
    }, this.debounceMs());
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    this.handle?.destroy();
  }
}
