import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Availability, ClaimAvailability, ClaimState, stepKey as mkKey } from '../../core/analysis/journey-analyzer';
import { idKey } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { AVAILABILITY_CLASS, AVAILABILITY_LABEL } from '../../shared/present';

interface Row {
  key: string;
  id: string;
  before: Availability;
  after: Availability;
  values: string[];
  source: string;
  note: string;
  used: string[];
  changed: boolean;
}

/** Claims in the claims bag before and after a step: present, maybe, or absent, and why. */
@Component({
  selector: 'app-claims-bag',
  imports: [Icon],
  template: `
    @if (step(); as s) {
      <div class="bar">
        <strong>Step {{ s.order }}</strong>
        <span class="muted small">{{ pathLabel() }}</span>
        <span class="spacer"></span>
        <span class="chip ok">{{ counts().definitely }} present</span>
        <span class="chip maybe">{{ counts().maybe }} maybe</span>
        <input type="search" placeholder="Filter claims" [value]="filter()" (input)="filter.set($any($event.target).value)" aria-label="Filter claims" />
        <label class="small row"><input type="checkbox" [checked]="showAll()" (change)="showAll.set(!showAll())" /> Include absent</label>
      </div>
      <div class="scroll">
        <table class="grid">
          <thead>
            <tr>
              <th>Claim</th>
              <th>Before step</th>
              <th>After step</th>
              <th>Known value</th>
              <th>Set by / why</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.key) {
              <tr class="clickable" [class.changed]="r.changed" (click)="store.select({ kind: 'claim', id: r.id })">
                <td>
                  <span class="mono">{{ r.id }}</span>
                  @for (u of r.used; track u) {
                    <span class="chip outline use">{{ u }}</span>
                  }
                </td>
                <td><span class="chip {{ cls(r.before) }}">{{ lbl(r.before) }}</span></td>
                <td>
                  <span class="chip {{ cls(r.after) }}">{{ lbl(r.after) }}</span>
                  @if (r.changed) {
                    <app-icon name="arrowRight" [size]="12" />
                  }
                </td>
                <td class="mono small">{{ r.values.join(', ') }}</td>
                <td class="small"><span class="truncate-2">{{ r.source }}</span>@if (r.note) {<div class="muted">{{ r.note }}</div>}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="empty">The claims bag is empty here.</td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="empty small">Select a step on the canvas to see which claims are in the claims bag before and after it.</div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .bar input[type='search'] { width: 160px; height: 24px; }
    .scroll { overflow: auto; flex: 1; }
    tr.changed td { background: color-mix(in srgb, var(--ok-bg) 60%, transparent); }
    .use { margin-left: 4px; height: 16px; font-size: 10px; }
    .truncate-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClaimsBag {
  protected readonly store = inject(EditorStore);
  /** Step key to show; defaults to the selected step. */
  readonly stepKey = input<string | null>(null);
  protected readonly filter = signal('');
  protected readonly showAll = signal(false);

  private readonly key = computed(() => {
    const k = this.stepKey();
    if (k) return k;
    const sel = this.store.selection();
    if (sel?.kind === 'step') return sel.stepKey;
    const j = this.store.activeJourney();
    const last = j?.steps.at(-1);
    return j && last ? mkKey(j.id, last.orderText.trim()) : null;
  });

  protected readonly step = computed(() => {
    const k = this.key();
    return k ? (this.store.analysis()?.steps.get(k) ?? null) : null;
  });

  protected readonly pathLabel = computed(() => {
    const p = this.store.selectedPath();
    const a = this.store.analysis();
    if (p === null || !a) return `across ${a?.paths.length ?? 0} analysed paths`;
    return `on path “${a.paths[p]?.label}”`;
  });

  private readonly used = computed(() => {
    const k = this.key();
    const out = new Map<string, string[]>();
    const add = (c: string, tag: string) => {
      const l = out.get(idKey(c)) ?? [];
      if (!l.includes(tag)) l.push(tag);
      out.set(idKey(c), l);
    };
    const eff = this.store.eff();
    const j = this.store.analysis();
    if (!k || !eff || !j) return out;
    const [jid, ord] = k.split('#');
    const journey = eff.userJourneys.get(idKey(jid))?.value ?? eff.subJourneys.get(idKey(jid))?.value;
    const st = journey?.steps.find((s) => s.orderText.trim() === ord);
    for (const p of st?.preconditions ?? []) if (p.values[0]) add(p.values[0], 'precondition');
    for (const x of st?.claimsExchanges ?? []) {
      const tp = eff.tp(x.technicalProfileReferenceId);
      for (const c of tp?.inputClaims ?? []) add(c.claimTypeReferenceId, 'input');
      for (const c of tp?.outputClaims ?? []) add(c.claimTypeReferenceId, 'output');
    }
    return out;
  });

  protected readonly allRows = computed<Row[]>(() => {
    const s = this.step();
    const a = this.store.analysis();
    if (!s || !a) return [];
    const p = this.store.selectedPath();
    const used = this.used();
    const keys = new Set([...s.before.keys(), ...s.after.keys(), ...used.keys()]);
    const eff = this.store.eff();
    const rows: Row[] = [];
    for (const k of keys) {
      const b = s.before.get(k);
      const af = s.after.get(k);
      const id = af?.id ?? b?.id ?? eff?.claimType(k)?.id ?? k;
      let before: Availability = b?.availability ?? 'absent';
      let after: Availability = af?.availability ?? 'absent';
      let values = af?.values ?? b?.values ?? [];
      let source = (af?.sources ?? b?.sources ?? []).join('; ');
      let note = '';
      let pathChanged: boolean | undefined;
      if (p !== null) {
        const visit = a.paths[p]?.visits.find((v) => v.stepKey === s.stepKey);
        if (!visit) continue;
        const sb = visit.before.get(k);
        const sa = visit.after.get(k);
        before = conc(sb);
        after = conc(sa);
        values = sa?.value?.kind === 'eq' ? [sa.value.value] : sa?.value?.kind === 'neq' ? sa.value.values.map((v) => `≠ ${v}`) : [];
        source = sa?.source ?? sb?.source ?? '';
        if (sa?.status === 'unknown') note = uncertainty(sa);
        pathChanged = visit.ran && !!sa && sa.status !== 'absent' && sa !== sb;
      } else if (af) {
        note = missingNote(af, a.paths.map((x) => x.label));
      } else if (b) {
        note = missingNote(b, a.paths.map((x) => x.label));
      }
      rows.push({ key: k, id, before, after, values, source, note, used: used.get(k) ?? [], changed: pathChanged ?? (s.runPaths.length > 0 && s.produced.some((x) => idKey(x) === k)) });
    }
    const order: Record<Availability, number> = { definitely: 0, maybe: 1, absent: 2 };
    return rows.sort((x, y) => order[x.after] - order[y.after] || x.id.localeCompare(y.id));
  });

  protected readonly rows = computed(() => {
    const f = this.filter().toLowerCase();
    return this.allRows().filter((r) => (this.showAll() || r.after !== 'absent' || r.before !== 'absent' || r.used.length) && (!f || r.id.toLowerCase().includes(f)));
  });

  protected readonly counts = computed(() => {
    const c = { definitely: 0, maybe: 0, absent: 0 };
    for (const r of this.allRows()) c[r.after]++;
    return c;
  });

  protected cls(a: Availability): string {
    return AVAILABILITY_CLASS[a];
  }
  protected lbl(a: Availability): string {
    return AVAILABILITY_LABEL[a];
  }
}

function conc(s: ClaimState | undefined): Availability {
  return s?.status === 'present' ? 'definitely' : s?.status === 'unknown' ? 'maybe' : 'absent';
}

function uncertainty(s: ClaimState): string {
  switch (s.uncertainty?.kind) {
    case 'directoryRead':
      return `Only if ${s.uncertainty.tp} finds the account`;
    case 'optionalInput':
      return 'Optional field the user may leave empty';
    case 'continueOnError':
      return `Only if ${s.uncertainty.tp} succeeds (ContinueOnError)`;
    case 'fromApp':
      return 'Only if the application sends it';
    case 'transformation':
      return 'Only if the transformation inputs exist';
    default:
      return '';
  }
}

function missingNote(a: ClaimAvailability, labels: string[]): string {
  if (a.availability !== 'maybe') return '';
  const missing = a.absentOn.map((i) => labels[i]);
  const unsure = a.maybeOn.map((i) => labels[i]);
  const parts: string[] = [];
  if (missing.length) parts.push(`missing on: ${missing.join('; ')}`);
  if (unsure.length) parts.push(`uncertain on: ${unsure.join('; ')}`);
  return parts.join(' · ');
}
