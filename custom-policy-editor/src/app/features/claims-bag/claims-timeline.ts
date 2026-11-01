import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Availability } from '../../core/analysis/journey-analyzer';
import { idKey } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';

interface Cell {
  after: Availability;
  produced: boolean;
  input: boolean;
  inputMissing: boolean;
  checked: boolean;
  ran: boolean;
}

/** Claims × steps matrix: where each claim appears, is used, and is checked. */
@Component({
  selector: 'app-claims-timeline',
  template: `
    <div class="bar">
      <span class="legend"><i class="g ok">●</i> present <i class="g maybe">◐</i> maybe <i class="g absent">·</i> absent <i class="mk prod">+</i> set here <i class="mk in">▲</i> input <i class="mk chk">◆</i> precondition</span>
      <span class="spacer"></span>
      <input type="search" placeholder="Filter claims" [value]="filter()" (input)="filter.set($any($event.target).value)" aria-label="Filter claims" />
      <label class="small row"><input type="checkbox" [checked]="tokenOnly()" (change)="tokenOnly.set(!tokenOnly())" /> Token claims only</label>
    </div>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th class="claim">Claim</th>
            @for (s of steps(); track s.key) {
              <th [class.sel]="selected() === s.key" [title]="s.title">
                <button class="sh" (click)="selectStep(s.key, s.journeyId)">{{ s.label }}</button>
              </th>
            }
            <th title="In the token">Token</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.key) {
            <tr>
              <td class="claim mono"><button class="cl" (click)="store.select({ kind: 'claim', id: r.id })">{{ r.id }}</button></td>
              @for (c of r.cells; track $index; let i = $index) {
                <td class="c {{ c.after }}" [class.sel]="selected() === steps()[i].key" [class.skip]="!c.ran" [title]="cellTitle(r.id, i, c)">
                  <span class="g">{{ glyph(c.after) }}</span>
                  @if (c.produced) {
                    <span class="mk prod">+</span>
                  }
                  @if (c.input) {
                    <span class="mk in" [class.bad]="c.inputMissing">▲</span>
                  }
                  @if (c.checked) {
                    <span class="mk chk">◆</span>
                  }
                </td>
              }
              <td class="c {{ r.token ?? 'none' }}"><span class="g">{{ r.token ? glyph(r.token) : '' }}</span></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .bar input[type='search'] { width: 160px; height: 24px; }
    .legend { font-size: 11.5px; color: var(--text-2); display: flex; gap: 6px; align-items: center; }
    .legend i { font-style: normal; }
    .scroll { overflow: auto; flex: 1; }
    table { border-collapse: separate; border-spacing: 0; font-size: 12px; }
    th, td { border-bottom: 1px solid var(--border); padding: 0; height: 24px; }
    th { position: sticky; top: 0; background: var(--surface); z-index: 2; font-weight: 600; font-size: 11px; color: var(--text-3); }
    th.claim, td.claim { position: sticky; left: 0; background: var(--surface); z-index: 1; text-align: left; padding: 0 10px; min-width: 180px; border-right: 1px solid var(--border); }
    th.claim { z-index: 3; }
    .sh, .cl { border: 0; background: none; font: inherit; color: inherit; cursor: pointer; padding: 0 6px; height: 100%; }
    .sh:hover, .cl:hover { color: var(--accent); }
    td.c { width: 34px; min-width: 34px; text-align: center; position: relative; }
    td.c.definitely .g { color: var(--ok); }
    td.c.maybe .g { color: var(--maybe); }
    td.c.absent .g { color: var(--border-strong); }
    td.c.skip { background: repeating-linear-gradient(135deg, transparent 0 4px, var(--surface-3) 4px 6px); }
    .sel { background: var(--accent-2) !important; }
    .g { font-size: 13px; }
    .mk { font-size: 9px; position: absolute; top: 1px; }
    .mk.prod { right: 3px; color: var(--ok); font-weight: 800; font-size: 11px; top: -1px; }
    .mk.in { left: 3px; color: var(--info); }
    .mk.in.bad { color: var(--error); }
    .mk.chk { left: 3px; bottom: 1px; top: auto; color: var(--skip); }
    .legend .mk { position: static; }
    .legend .g.ok { color: var(--ok); }
    .legend .g.maybe { color: var(--maybe); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClaimsTimeline {
  protected readonly store = inject(EditorStore);
  protected readonly filter = signal('');
  protected readonly tokenOnly = signal(false);

  protected readonly selected = computed(() => {
    const s = this.store.selection();
    return s?.kind === 'step' ? s.stepKey : null;
  });

  protected readonly steps = computed(() => {
    const a = this.store.analysis();
    if (!a) return [];
    return [...a.steps.values()].map((s) => ({
      key: s.stepKey,
      journeyId: s.journeyId,
      label: s.journeyId === a.journeyId ? String(s.order) : `${s.journeyId.slice(0, 4)}·${s.order}`,
      title: `${s.journeyId} step ${s.order} — ${s.runs}`,
      summary: s,
    }));
  });

  protected readonly rows = computed(() => {
    const a = this.store.analysis();
    const eff = this.store.eff();
    if (!a || !eff) return [];
    const p = this.store.selectedPath();
    const steps = this.steps();
    const token = new Map(a.tokenClaims.map((t) => [idKey(t.claim), t]));
    const ids = new Map<string, string>();
    const usage = new Map<string, { inputs: Set<string>; checks: Set<string> }>();
    const use = (c: string) => {
      const k = idKey(c);
      if (!usage.has(k)) usage.set(k, { inputs: new Set(), checks: new Set() });
      if (!ids.has(k)) ids.set(k, c);
      return usage.get(k)!;
    };
    for (const s of steps) {
      for (const [k, av] of s.summary.after) if (av.availability !== 'absent' && !ids.has(k)) ids.set(k, av.id);
      for (const m of s.summary.missingInputs) use(m.claim).inputs.add(s.key);
      const [jid, ord] = s.key.split('#');
      const j = eff.userJourneys.get(idKey(jid))?.value ?? eff.subJourneys.get(idKey(jid))?.value;
      const st = j?.steps.find((x) => x.orderText.trim() === ord);
      for (const pc of st?.preconditions ?? []) if (pc.values[0]) use(pc.values[0]).checks.add(s.key);
      for (const x of st?.claimsExchanges ?? []) for (const ic of eff.tp(x.technicalProfileReferenceId)?.inputClaims ?? []) use(ic.claimTypeReferenceId).inputs.add(s.key);
    }
    for (const t of a.tokenClaims) if (!ids.has(idKey(t.claim))) ids.set(idKey(t.claim), t.claim);
    const f = this.filter().toLowerCase();
    const rows = [...ids.entries()]
      .filter(([k, id]) => (!f || id.toLowerCase().includes(f)) && (!this.tokenOnly() || token.has(k)))
      .map(([k, id]) => {
        const u = usage.get(k);
        const cells: Cell[] = steps.map((s) => {
          let after: Availability = s.summary.after.get(k)?.availability ?? 'absent';
          let ran = s.summary.runPaths.length > 0;
          let before: Availability = s.summary.before.get(k)?.availability ?? 'absent';
          let produced = ran && s.summary.produced.some((x) => idKey(x) === k);
          if (p !== null) {
            const v = a.paths[p]?.visits.find((x) => x.stepKey === s.key);
            const st = v?.after.get(k);
            after = !v ? 'absent' : st?.status === 'present' ? 'definitely' : st?.status === 'unknown' ? 'maybe' : 'absent';
            const sb = v?.before.get(k);
            before = !v ? 'absent' : sb?.status === 'present' ? 'definitely' : sb?.status === 'unknown' ? 'maybe' : 'absent';
            ran = !!v?.ran;
            produced = ran && !!st && st.status !== 'absent' && st !== sb;
          }
          const isInput = !!u?.inputs.has(s.key);
          return {
            after,
            produced,
            input: isInput,
            inputMissing: isInput && before !== 'definitely',
            checked: !!u?.checks.has(s.key),
            ran,
          };
        });
        const t = token.get(k);
        const tokenAv: Availability | undefined = t ? (p !== null ? (t.availability.presentOn.includes(p) ? 'definitely' : t.availability.maybeOn.includes(p) ? 'maybe' : 'absent') : t.availability.availability) : undefined;
        return { key: k, id, cells, token: tokenAv, first: cells.findIndex((c) => c.after !== 'absent') };
      });
    return rows.sort((x, y) => (x.first < 0 ? 999 : x.first) - (y.first < 0 ? 999 : y.first) || x.id.localeCompare(y.id));
  });

  protected glyph(a: Availability): string {
    return a === 'definitely' ? '●' : a === 'maybe' ? '◐' : '·';
  }

  protected cellTitle(claim: string, i: number, c: Cell): string {
    const s = this.steps()[i];
    const parts = [`${claim} after ${s.title}: ${c.after === 'definitely' ? 'present' : c.after}`];
    if (c.produced) parts.push('set by this step');
    if (c.input) parts.push(c.inputMissing ? 'used as input, but not always present before the step' : 'used as input');
    if (c.checked) parts.push('checked by a precondition');
    if (!c.ran) parts.push('step skipped');
    return parts.join('\n');
  }

  protected selectStep(key: string, journeyId: string): void {
    this.store.select({ kind: 'step', journeyId, stepKey: key });
  }
}
