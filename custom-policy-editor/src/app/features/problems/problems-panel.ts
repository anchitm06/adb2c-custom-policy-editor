import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Diagnostic, Severity } from '../../core/validate/validate';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-problems-panel',
  imports: [Icon],
  template: `
    <div class="bar">
      @for (s of sevs; track s) {
        <button class="chip clickable {{ s }}" [class.outline]="!shown().has(s)" (click)="toggle(s)"><app-icon [name]="s" [size]="12" /> {{ store.counts()[s] }} {{ s === 'info' ? 'info' : s + 's' }}</button>
      }
      <span class="spacer"></span>
      <input type="search" placeholder="Filter problems" [value]="filter()" (input)="filter.set($any($event.target).value)" aria-label="Filter problems" />
    </div>
    <div class="scroll">
      @for (d of list(); track d.key) {
        <div class="p" role="button" tabindex="0" (click)="store.goTo(d)" (keydown.enter)="store.goTo(d)">
          <app-icon [name]="d.severity" [size]="14" class="{{ d.severity }}" />
          <span class="msg">{{ d.message }}</span>
          @if (d.fix) {
            <button class="btn sm" (click)="fix(d, $event)"><app-icon name="wand" [size]="13" /> {{ d.fix.label }}</button>
          }
          <span class="loc muted small">{{ loc(d) }}</span>
        </div>
      } @empty {
        <div class="empty small">No problems to show. Every change is checked as you make it.</div>
      }
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .bar { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-bottom: 1px solid var(--border); }
    .bar input { width: 180px; height: 24px; }
    .scroll { overflow: auto; flex: 1; }
    .p { display: flex; align-items: center; gap: 8px; padding: 4px 12px; cursor: pointer; border-bottom: 1px solid var(--border); }
    .p:hover { background: var(--surface-2); }
    .msg { flex: 1; min-width: 0; }
    .loc { white-space: nowrap; }
    .error { color: var(--error); }
    .warning { color: var(--warning); }
    .info { color: var(--info); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProblemsPanel {
  protected readonly store = inject(EditorStore);
  protected readonly sevs: Severity[] = ['error', 'warning', 'info'];
  protected readonly shown = signal(new Set<Severity>(['error', 'warning', 'info']));
  protected readonly filter = signal('');

  protected readonly list = computed(() => {
    const f = this.filter().toLowerCase();
    return this.store.diagnostics().filter((d) => this.shown().has(d.severity) && (!f || d.message.toLowerCase().includes(f)));
  });

  protected toggle(s: Severity): void {
    this.shown.update((cur) => {
      const n = new Set(cur);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  }

  protected loc(d: Diagnostic): string {
    if (!d.ref) return '';
    return `${this.store.fileName(d.ref.fileId)}:${d.ref.line}`;
  }

  protected fix(d: Diagnostic, e: Event): void {
    e.stopPropagation();
    if (d.fix) this.store.applyFix(d.fix);
  }
}
