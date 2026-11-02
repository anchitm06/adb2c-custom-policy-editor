import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { idKey } from '../../core/model/types';
import { stepKey } from '../../core/analysis/journey-analyzer';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { stepTypeInfo, tpKindInfo } from '../../shared/present';

/** Compact list of every step of the open journey: the way to move around a long journey. */
@Component({
  selector: 'app-step-outline',
  imports: [Icon],
  template: `
    <div class="head">
      <strong class="grow truncate">Steps in {{ store.activeJourneyId() }}</strong>
      <span class="muted small">{{ items().length }}</span>
    </div>
    <div class="search">
      <app-icon name="search" [size]="14" />
      <input type="search" placeholder="Find by step, profile or claim" [value]="filter()" (input)="filter.set($any($event.target).value)" aria-label="Find a step" />
    </div>
    <div class="list">
      @for (it of shown(); track it.key) {
        <div class="item" [class.on]="it.key === selected()" role="button" tabindex="0" (click)="go(it)" (keydown.enter)="go(it)">
          <span class="order">{{ it.order }}</span>
          <app-icon [name]="it.icon" [size]="14" />
          <span class="grow truncate" [title]="it.title">{{ it.title }}</span>
          @if (it.sev) {
            <app-icon [name]="it.sev" [size]="13" class="sev {{ it.sev }}" />
          }
          <span class="run {{ it.runs }}" [title]="it.runsTitle">{{ it.runsGlyph }}</span>
        </div>
      } @empty {
        <div class="empty small">No step matches. Try a technical profile name or a claim.</div>
      }
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; }
    .head { display: flex; align-items: center; gap: 8px; padding: 8px 12px 4px; }
    .search { display: flex; align-items: center; gap: 6px; padding: 4px 10px 8px; color: var(--text-3); }
    .search input { flex: 1; height: 26px; }
    .list { overflow: auto; flex: 1; padding: 0 6px 12px; }
    .item { display: flex; align-items: center; gap: 7px; padding: 4px 6px; border-radius: var(--radius-input); cursor: pointer; min-width: 0; }
    .item:hover { background: var(--surface-3); }
    .item.on { background: var(--accent-2); color: var(--accent); }
    .order { min-width: 22px; text-align: right; font-variant-numeric: tabular-nums; color: var(--text-3); }
    .sev.error { color: var(--error); }
    .sev.warning { color: var(--warning); }
    .run { font-size: var(--text-xs); width: 14px; text-align: center; }
    .run.always { color: var(--ok); }
    .run.sometimes { color: var(--maybe); }
    .run.never, .run.unreached { color: var(--absent); }
    .empty { padding: 12px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepOutline {
  protected readonly store = inject(EditorStore);
  protected readonly filter = signal('');
  protected readonly selected = computed(() => {
    const s = this.store.selection();
    return s?.kind === 'step' ? s.stepKey : null;
  });

  protected readonly items = computed(() => {
    const j = this.store.activeJourney();
    const eff = this.store.eff();
    const a = this.store.analysis();
    const diags = this.store.diagnosticsByStep();
    if (!j || !eff) return [];
    return j.steps.map((st) => {
      const key = stepKey(j.id, st.orderText.trim() || String(st.order));
      const info = stepTypeInfo(st.type);
      const tps = st.claimsExchanges.map((x) => eff.tp(x.technicalProfileReferenceId));
      const first = tps[0];
      const title = st.type === 'SendClaims' ? 'Issue token' : tps.length ? `${first?.displayName || st.claimsExchanges[0].technicalProfileReferenceId}${tps.length > 1 ? ` +${tps.length - 1}` : ''}` : info.label;
      const icon = first ? tpKindInfo(first.kind).icon : info.icon;
      const d = diags.get(key) ?? [];
      const runs = a?.steps.get(key)?.runs ?? 'unreached';
      const text = [
        st.orderText,
        info.label,
        ...st.claimsExchanges.flatMap((x) => [x.id, x.technicalProfileReferenceId, eff.tp(x.technicalProfileReferenceId)?.displayName ?? '']),
        ...st.preconditions.flatMap((p) => p.values),
        ...tps.flatMap((t) => [...(t?.inputClaims ?? []), ...(t?.outputClaims ?? [])].map((c) => c.claimTypeReferenceId)),
      ]
        .join(' ')
        .toLowerCase();
      return {
        key,
        journeyId: j.id,
        order: st.orderText,
        title,
        icon,
        text,
        sev: d.some((x) => x.severity === 'error') ? ('error' as const) : d.some((x) => x.severity === 'warning') ? ('warning' as const) : null,
        runs,
        runsGlyph: runs === 'always' ? '●' : runs === 'sometimes' ? '◐' : '○',
        runsTitle: runs === 'always' ? 'Always runs' : runs === 'sometimes' ? 'Runs in some cases' : runs === 'never' ? 'Never runs' : 'Not reached',
      };
    });
  });

  protected readonly shown = computed(() => {
    const f = this.filter().trim().toLowerCase();
    return f ? this.items().filter((i) => i.text.includes(f) || idKey(i.title).includes(f)) : this.items();
  });

  protected go(it: { key: string; journeyId: string }): void {
    this.store.select({ kind: 'step', journeyId: it.journeyId, stepKey: it.key });
    this.store.focusStep.set(it.key);
  }
}
