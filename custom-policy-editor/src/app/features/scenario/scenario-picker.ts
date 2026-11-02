import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal } from '@angular/core';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';

/**
 * Trace one scenario through the journey. A scenario is a set of choices (which button the user
 * picks, whether a claim exists). Fixing choices makes the analysis exact for that case.
 */
@Component({
  selector: 'app-scenario-picker',
  imports: [Icon],
  template: `
    <button class="btn" aria-haspopup="dialog" [attr.aria-expanded]="open()" (click)="toggle($event)">
      <app-icon name="path" [size]="15" />
      <span class="truncate">Scenario: {{ label() }}</span>
      <app-icon name="chevronDown" [size]="14" />
    </button>
    @if (store.scenarioActive()) {
      <button class="btn ghost" title="Back to all scenarios" (click)="store.clearScenario()">Clear</button>
    }
    @if (open()) {
      <div class="pop" role="dialog" aria-label="Choose a scenario" tabindex="-1" [style.top.px]="pos().top" [style.left.px]="pos().left" (keydown.escape)="open.set(false)">
        <input type="search" placeholder="Search paths and choices" aria-label="Search scenarios" [value]="query()" (input)="query.set($any($event.target).value)" />
        <div class="scroll">
          @if (named().length) {
            <h3>Complete paths</h3>
            @for (p of named(); track p.id) {
              <button class="row-btn" [class.on]="store.scenario().name === p.label" (click)="pickPath(p)">
                <app-icon name="path" [size]="14" />
                <span class="grow truncate">{{ p.label }}</span>
                <span class="muted small">{{ p.outcome === 'token' ? 'issues a token' : p.outcome }}</span>
              </button>
            }
          }
          @if (decisions().length) {
            <h3>Choices</h3>
            <p class="muted small">Fix one or more choices to see exactly what happens. Choices you leave on Any stay open.</p>
            @for (d of decisions(); track d.id) {
              <fieldset class="decision">
                <legend>{{ d.label }}</legend>
                <div class="opts">
                  <button class="opt" [class.on]="!assumed(d.id)" (click)="store.assume(d.id, null)">Any</button>
                  @for (o of d.options; track o.key) {
                    <button class="opt" [class.on]="assumed(d.id) === o.key" [title]="o.label" (click)="store.assume(d.id, o.key)">{{ o.label }}</button>
                  }
                </div>
              </fieldset>
            }
          }
          @if (!named().length && !decisions().length) {
            <p class="muted small">This journey has no choices to fix. Every step runs the same way for every user.</p>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
    .btn { max-width: 340px; }
    .pop { position: fixed; z-index: 1000; width: 440px; max-width: calc(100vw - 24px); max-height: min(560px, calc(100vh - 120px)); display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow-lg); }
    .scroll { overflow: auto; min-height: 0; }
    h3 { margin: 8px 0 4px; font-size: 13px; }
    .row-btn { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
    .row-btn:hover, .row-btn.on { background: var(--accent-2); }
    .decision { border: 0; border-top: 1px solid var(--border); padding: 8px 0 4px; margin: 0; min-width: 0; }
    legend { padding: 0; font-weight: 600; font-size: 12.5px; }
    .opts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .opt { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 6px; padding: 3px 9px; font: inherit; font-size: 12.5px; cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opt:hover { border-color: var(--border-strong); }
    .opt.on { background: var(--accent-2); border-color: var(--accent); color: var(--accent); font-weight: 600; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocClick($event)' },
})
export class ScenarioPicker {
  protected readonly store = inject(EditorStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly pos = signal({ top: 0, left: 0 });

  protected readonly label = computed(() => {
    const sc = this.store.scenario();
    if (!sc.assume.size) return 'All scenarios';
    return sc.name ?? `${sc.assume.size} choice${sc.assume.size > 1 ? 's' : ''} fixed`;
  });

  protected readonly named = computed(() => {
    const q = this.query().toLowerCase();
    return (this.store.baseAnalysis()?.namedPaths ?? []).filter((p) => !q || p.label.toLowerCase().includes(q));
  });

  protected readonly decisions = computed(() => {
    const q = this.query().toLowerCase();
    return (this.store.baseAnalysis()?.decisions ?? []).filter((d) => d.options.length > 1 && (!q || d.label.toLowerCase().includes(q) || d.options.some((o) => o.label.toLowerCase().includes(q))));
  });

  protected assumed(id: string): string | undefined {
    return this.store.scenario().assume.get(id);
  }

  protected toggle(e: Event): void {
    e.stopPropagation();
    if (!this.open()) {
      const r = this.host.nativeElement.getBoundingClientRect();
      this.pos.set({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 452)) });
      this.query.set('');
    }
    this.open.update((v) => !v);
  }

  protected pickPath(p: { label: string; assume: [string, string][] }): void {
    this.store.setScenario(p.assume, p.label);
    this.open.set(false);
  }

  protected onDocClick(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
