import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { ClaimAvailability } from '../core/analysis/journey-analyzer';
import { idKey } from '../core/model/types';
import { EditorStore } from '../state/editor.store';
import { AVAILABILITY_CLASS, AVAILABILITY_LABEL } from './present';

interface Option {
  id: string;
  dataType?: string;
  displayName?: string;
  availability?: ClaimAvailability;
  group: 'present' | 'maybe' | 'absent' | 'all';
}

/**
 * Claim combobox. Like Power Automate's dynamic content panel it groups the claims by whether
 * they are in the claims bag at the current step.
 */
@Component({
  selector: 'app-claim-picker',
  template: `
    <div class="wrap" [class.invalid]="unknown()">
      <input
        #inp
        type="text"
        [value]="open() ? query() : value()"
        [placeholder]="placeholder()"
        [attr.aria-label]="placeholder()"
        (focus)="onFocus()"
        (input)="query.set(inp.value); open.set(true)"
        (keydown)="onKey($event)"
        (blur)="onBlur()"
      />
      @if (current(); as c) {
        @if (c.availability) {
          <span class="chip {{ cls(c) }}" [title]="'Before this step: ' + label(c)">{{ label(c) }}</span>
        }
      }
    </div>
    @if (open()) {
      <div class="pop card" [style.top.px]="pos().top" [style.left.px]="pos().left" [style.width.px]="pos().width" role="listbox" tabindex="-1" (mousedown)="$event.preventDefault()">
        @for (g of groups(); track g.key) {
          @if (g.items.length) {
            <div class="group">{{ g.title }}</div>
            @for (o of g.items; track o.id; let i = $index) {
              <div class="opt" role="option" tabindex="-1" [attr.aria-selected]="o.id === value()" [class.active]="o === activeOption()" (click)="pick(o.id)" (keydown.enter)="pick(o.id)">
                <span class="dot {{ o.availability ? cls(o) : 'absent' }}"></span>
                <span class="grow truncate">{{ o.id }}</span>
                <span class="muted small">{{ o.dataType }}</span>
              </div>
            }
          }
        }
        @if (query() && !exact()) {
          <div class="opt new" role="option" tabindex="-1" aria-selected="false" (click)="pick(query())" (keydown.enter)="pick(query())">Use "{{ query() }}" (not defined yet)</div>
        }
        @if (!total()) {
          <div class="muted small" style="padding: 8px">No matching claims</div>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .wrap { position: relative; display: flex; align-items: center; }
    .wrap input { width: 100%; padding-right: 72px; }
    .wrap .chip { position: absolute; right: 4px; height: 18px; font-size: 10.5px; pointer-events: none; }
    .wrap.invalid input { border-color: var(--error); }
    .pop { position: fixed; z-index: 1000; max-height: 300px; overflow: auto; padding: 4px; box-shadow: var(--shadow-lg); }
    .group { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); padding: 6px 8px 2px; font-weight: 600; }
    .opt { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 4px; cursor: pointer; }
    .opt:hover, .opt.active { background: var(--accent-2); }
    .opt.new { color: var(--accent); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClaimPicker {
  private readonly store = inject(EditorStore);
  readonly value = input<string>('');
  readonly placeholder = input('Choose a claim');
  /** Availability of claims at the point where the claim is used (before a step). */
  readonly availability = input<ReadonlyMap<string, ClaimAvailability> | null>(null);
  readonly changed = output<string>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly pos = signal({ top: 0, left: 0, width: 260 });
  private readonly inp = viewChild.required<ElementRef<HTMLInputElement>>('inp');

  protected readonly options = computed<Option[]>(() => {
    const eff = this.store.eff();
    const av = this.availability();
    if (!eff) return [];
    return [...eff.claimTypes.values()].map((e) => {
      const a = av?.get(idKey(e.id));
      const group: Option['group'] = !av ? 'all' : a?.availability === 'definitely' ? 'present' : a?.availability === 'maybe' ? 'maybe' : 'absent';
      return { id: e.value.id, dataType: e.value.dataType, displayName: e.value.displayName, availability: av ? (a ?? { id: e.id, availability: 'absent', presentOn: [], maybeOn: [], absentOn: [], values: [], sources: [] }) : undefined, group };
    });
  });

  protected readonly current = computed(() => this.options().find((o) => idKey(o.id) === idKey(this.value())));
  protected readonly unknown = computed(() => !!this.value() && !this.current() && !!this.store.eff());
  protected readonly exact = computed(() => this.options().some((o) => idKey(o.id) === idKey(this.query())));

  protected readonly filtered = computed(() => {
    const q = this.query().toLowerCase();
    const list = this.options().filter((o) => !q || o.id.toLowerCase().includes(q) || (o.displayName ?? '').toLowerCase().includes(q));
    return list.sort((a, b) => a.id.localeCompare(b.id));
  });

  protected readonly groups = computed(() => {
    const f = this.filtered();
    if (!this.availability()) return [{ key: 'all', title: 'Claims', items: f }];
    return [
      { key: 'present', title: 'In the claims bag here', items: f.filter((o) => o.group === 'present') },
      { key: 'maybe', title: 'Maybe in the claims bag', items: f.filter((o) => o.group === 'maybe') },
      { key: 'absent', title: 'Not in the claims bag yet', items: f.filter((o) => o.group === 'absent') },
    ];
  });
  protected readonly flat = computed(() => this.groups().flatMap((g) => g.items));
  protected readonly total = computed(() => this.flat().length);
  protected readonly activeOption = computed(() => this.flat()[this.active()]);

  protected cls(o: Option): string {
    return AVAILABILITY_CLASS[o.availability?.availability ?? 'absent'];
  }
  protected label(o: Option): string {
    return AVAILABILITY_LABEL[o.availability?.availability ?? 'absent'];
  }

  protected onFocus(): void {
    const r = this.inp().nativeElement.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const top = below < 320 ? Math.max(8, r.top - 304) : r.bottom + 2;
    this.pos.set({ top, left: r.left, width: Math.max(r.width, 260) });
    this.query.set('');
    this.active.set(0);
    this.open.set(true);
  }

  protected onBlur(): void {
    setTimeout(() => this.open.set(false), 120);
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      this.active.update((i) => Math.min(i + 1, this.total() - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      this.active.update((i) => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const o = this.activeOption();
      if (o) this.pick(o.id);
      else if (this.query()) this.pick(this.query());
      e.preventDefault();
    } else if (e.key === 'Escape') {
      this.open.set(false);
      this.inp().nativeElement.blur();
    }
  }

  protected pick(id: string): void {
    this.open.set(false);
    this.inp().nativeElement.blur();
    if (id && id !== this.value()) this.changed.emit(id);
  }
}
