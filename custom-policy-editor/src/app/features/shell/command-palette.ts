import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { stepKey } from '../../core/analysis/journey-analyzer';
import { EditorStore, Selection, View } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { stepTypeInfo, tpKindInfo } from '../../shared/present';
import { exportZip } from '../workspace/file-io';

interface Entry {
  id: string;
  label: string;
  hint: string;
  group: string;
  icon: string;
  run: () => void;
}

/** Ctrl+K: jump to any journey, step, technical profile, claim or transformation, or run an action. */
@Component({
  selector: 'app-command-palette',
  imports: [Icon],
  template: `
    @if (store.paletteOpen()) {
      <div class="scrim" role="presentation" (click)="close()"></div>
      <div class="dialog card" role="dialog" aria-modal="true" aria-label="Search everything" (keydown.escape)="close()">
        <div class="field-row">
          <app-icon name="search" [size]="16" />
          <input #q type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" [attr.aria-activedescendant]="'pal-' + active()" placeholder="Search journeys, steps, profiles, claims, actions" aria-label="Search" [value]="query()" (input)="query.set($any($event.target).value); active.set(0)" (keydown)="onKey($event)" />
          <span class="kbd">Esc</span>
        </div>
        <ul id="palette-list" role="listbox" class="list">
          @for (e of results(); track e.id; let i = $index) {
            @if (i === 0 || results()[i - 1].group !== e.group) {
              <li class="group" role="presentation">{{ e.group }}</li>
            }
            <li role="option" [id]="'pal-' + i" [attr.aria-selected]="i === active()" [class.on]="i === active()" tabindex="-1" (click)="choose(e)" (keydown.enter)="choose(e)" (mousemove)="active.set(i)">
              <app-icon [name]="e.icon" [size]="15" />
              <span class="grow truncate">{{ e.label }}</span>
              <span class="muted small truncate hint">{{ e.hint }}</span>
            </li>
          } @empty {
            <li class="none muted" role="presentation">Nothing matches "{{ query() }}". Try a technical profile name, a claim, or a step number.</li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    :host { display: contents; }
    .scrim { position: fixed; inset: 0; z-index: var(--z-modal); background: color-mix(in oklab, var(--color-ink) 40%, transparent); }
    .dialog { position: fixed; z-index: var(--z-modal); top: 12dvh; left: 50%; transform: translateX(-50%); width: min(640px, calc(100% - var(--space-md))); max-height: 70dvh; display: flex; flex-direction: column; box-shadow: var(--shadow-pop), var(--ring); }
    .field-row { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-sm) var(--space-md); border-bottom: var(--rule-hair) solid var(--border); color: var(--text-3); }
    .field-row input { flex: 1; border: 0; background: transparent; min-height: 36px; font-size: var(--text-md); box-shadow: none; padding: 0; }
    .field-row input:focus { box-shadow: none; outline: none; }
    .list { list-style: none; margin: 0; padding: var(--space-xs); overflow: auto; }
    .group { padding: var(--space-sm) var(--space-sm) var(--space-2xs); font-size: var(--text-xs); color: var(--text-3); font-family: var(--font-display); font-weight: 500; }
    li[role='option'] { display: flex; align-items: center; gap: var(--space-sm); min-height: var(--control); padding: var(--space-2xs) var(--space-sm); border-radius: var(--radius-input); cursor: pointer; }
    li[role='option'].on { background: var(--accent-2); }
    .hint { max-width: 45%; }
    .none { padding: var(--space-md); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onGlobalKey($event)' },
})
export class CommandPalette {
  protected readonly store = inject(EditorStore);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('q');

  constructor() {
    effect(() => {
      if (this.store.paletteOpen()) {
        this.query.set('');
        this.active.set(0);
        queueMicrotask(() => this.input()?.nativeElement.focus());
      }
    });
  }

  private readonly all = computed<Entry[]>(() => {
    if (!this.store.paletteOpen()) return [];
    const e = this.store.eff();
    const out: Entry[] = [];
    const go = (view: View, sel: Selection) => () => {
      this.store.view.set(view);
      this.store.mainMode.set('visual');
      this.store.selection.set(sel);
    };
    out.push(
      { id: 'a:problems', label: 'Show problems', hint: `${this.store.counts().error} errors, ${this.store.counts().warning} warnings`, group: 'Actions', icon: 'warning', run: () => this.store.problemsOpen.set(true) },
      { id: 'a:xml', label: this.store.mainMode() === 'xml' ? 'Switch to the visual editor' : 'Switch to the XML editor', hint: '', group: 'Actions', icon: 'xml', run: () => this.store.mainMode.set(this.store.mainMode() === 'xml' ? 'visual' : 'xml') },
      { id: 'a:files', label: 'Open files and tenant settings', hint: '', group: 'Actions', icon: 'files', run: go('files', null) },
      { id: 'a:export', label: 'Export files as zip', hint: '', group: 'Actions', icon: 'download', run: () => void exportZip(this.store.workspaceName(), this.store.files()) },
    );
    if (!e) return out;
    for (const j of e.userJourneys.values()) out.push({ id: 'j:' + j.id, label: j.id, hint: 'User journey', group: 'Journeys', icon: 'journey', run: () => this.store.openJourney(j.id) });
    for (const j of e.subJourneys.values()) out.push({ id: 'sj:' + j.id, label: j.id, hint: 'Sub journey', group: 'Journeys', icon: 'subjourney', run: () => this.store.openJourney(j.id) });
    const aj = this.store.activeJourney();
    if (aj) {
      for (const st of aj.steps) {
        const first = st.claimsExchanges[0] ? e.tp(st.claimsExchanges[0].technicalProfileReferenceId) : undefined;
        const key = stepKey(aj.id, st.orderText.trim() || String(st.order));
        out.push({
          id: 's:' + key,
          label: `Step ${st.orderText.trim()}: ${first?.displayName || st.claimsExchanges[0]?.technicalProfileReferenceId || stepTypeInfo(st.type).label}`,
          hint: aj.id,
          group: 'Steps',
          icon: first ? tpKindInfo(first.kind).icon : stepTypeInfo(st.type).icon,
          run: () => {
            this.store.select({ kind: 'step', journeyId: aj.id, stepKey: key });
            this.store.focusStep.set(key);
          },
        });
      }
    }
    for (const t of e.technicalProfiles.values()) out.push({ id: 't:' + t.id, label: t.id, hint: 'Technical profile', group: 'Technical profiles', icon: tpKindInfo(e.tp(t.id)?.kind).icon, run: go('technicalProfiles', { kind: 'technicalProfile', id: t.id }) });
    for (const c of e.claimTypes.values()) out.push({ id: 'c:' + c.id, label: c.id, hint: c.value.dataType ?? 'Claim', group: 'Claims', icon: 'claim', run: go('claims', { kind: 'claim', id: c.id }) });
    for (const c of e.claimsTransformations.values()) out.push({ id: 'x:' + c.id, label: c.id, hint: c.value.method ?? 'Transformation', group: 'Claims transformations', icon: 'transform', run: go('transformations', { kind: 'transformation', id: c.id }) });
    return out;
  });

  protected readonly results = computed(() => {
    const words = this.query().toLowerCase().split(/\s+/).filter(Boolean);
    const list = this.all().filter((e) => words.every((w) => `${e.label} ${e.hint} ${e.group}`.toLowerCase().includes(w)));
    const order = ['Actions', 'Steps', 'Journeys', 'Technical profiles', 'Claims', 'Claims transformations'];
    return list.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group)).slice(0, 60);
  });

  protected close(): void {
    this.store.paletteOpen.set(false);
  }

  protected choose(e: Entry): void {
    this.close();
    e.run();
  }

  protected onKey(ev: KeyboardEvent): void {
    const n = this.results().length;
    if (ev.key === 'ArrowDown') {
      this.active.set(n ? (this.active() + 1) % n : 0);
      ev.preventDefault();
    } else if (ev.key === 'ArrowUp') {
      this.active.set(n ? (this.active() - 1 + n) % n : 0);
      ev.preventDefault();
    } else if (ev.key === 'Enter') {
      const e = this.results()[this.active()];
      if (e) this.choose(e);
      ev.preventDefault();
    }
  }

  protected onGlobalKey(ev: KeyboardEvent): void {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      this.store.paletteOpen.update((v) => !v);
    }
  }
}
