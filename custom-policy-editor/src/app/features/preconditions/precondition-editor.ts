import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ClaimAvailability } from '../../core/analysis/journey-analyzer';
import { Atom, AtomOp, compileRunWhen, parsePrecondition, RunWhen } from '../../core/analysis/preconditions';
import { explainPreconditions } from '../../core/analysis/precondition-explainer';
import { setPreconditions } from '../../core/edit/commands';
import { idKey, Precondition, SourceRef } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';
import { ClaimPicker } from '../../shared/claim-picker';
import { Icon } from '../../shared/icon';
import { SelectValue } from '../../shared/select-value';
import { AlertItem } from '../../shared/alert-item';

const SKIP_OPS: { op: AtomOp; label: string }[] = [
  { op: 'exists', label: 'exists' },
  { op: 'missing', label: 'is missing' },
  { op: 'eq', label: 'equals' },
  { op: 'neq', label: 'does not equal' },
];
const RUN_OPS: { op: AtomOp; label: string }[] = [
  { op: 'exists', label: 'exists' },
  { op: 'missing', label: 'is missing' },
  { op: 'eq', label: 'equals' },
  { op: 'neq', label: 'is not (or missing)' },
];

/**
 * Sentence-style precondition builder with a live explanation:
 * what skips the step, what must hold for it to run, how each analysed path is affected,
 * lints, and a truth table.
 */
@Component({
  selector: 'app-precondition-editor',
  imports: [AlertItem, SelectValue, ClaimPicker, Icon],
  template: `
    <div class="modes">
      <div class="seg" role="tablist">
        <button role="tab" [attr.aria-selected]="mode() === 'skip'" [class.on]="mode() === 'skip'" (click)="mode.set('skip')">Skip when…</button>
        <button role="tab" [attr.aria-selected]="mode() === 'run'" [class.on]="mode() === 'run'" [disabled]="!runForm()" [title]="runForm() ? '' : 'These preconditions can’t be written as a simple list of run conditions'" (click)="mode.set('run')">Run only when…</button>
      </div>
      <span class="spacer"></span>
      <label class="small muted row"><input type="checkbox" [checked]="raw()" (change)="raw.set(!raw())" /> Show XML values</label>
    </div>

    @if (mode() === 'skip') {
      @if (!atoms().length && !invalid().length) {
        <p class="muted small">No preconditions: {{ subject() }} always runs.</p>
      }
      @for (row of rows(); track $index; let i = $index; let last = $last) {
        <div class="cond" [class.bad]="!row.atom">
          <span class="num">{{ i + 1 }}</span>
          <span class="lead">Skip if</span>
          @if (row.atom; as a) {
            <app-claim-picker class="claim" [value]="a.claim" [availability]="availability()" (changed)="update(i, { claim: $event })" />
            <select [appValue]="a.op" (change)="update(i, { op: $any($event.target).value })" aria-label="Condition">
              @for (o of skipOps; track o.op) {
                <option [value]="o.op">{{ o.label }}</option>
              }
            </select>
            @if (a.op === 'eq' || a.op === 'neq') {
              <input class="val" type="text" [value]="a.value ?? ''" [attr.list]="'vals-' + uid + '-' + i" placeholder="value" aria-label="Value" (change)="update(i, { value: $any($event.target).value })" />
              <datalist [id]="'vals-' + uid + '-' + i">
                @for (v of valuesFor(a.claim); track v) {
                  <option [value]="v"></option>
                }
              </datalist>
            }
          } @else {
            <span class="grow err small">{{ row.problems[0] }}</span>
          }
          <span class="tools">
            <button class="btn ghost sm icon" title="Move up" [disabled]="i === 0" (click)="move(i, -1)"><app-icon name="chevronUp" [size]="14" /></button>
            <button class="btn ghost sm icon" title="Move down" [disabled]="last" (click)="move(i, 1)"><app-icon name="chevronDown" [size]="14" /></button>
            <button class="btn ghost sm icon" title="Remove" (click)="remove(i)"><app-icon name="close" [size]="14" /></button>
          </span>
        </div>
        @if (raw()) {
          <div class="raw mono">Type="{{ row.source.type }}" ExecuteActionsIf="{{ row.source.executeActionsIf }}" · Value: {{ row.source.values.join(' | ') }}</div>
        }
        @if (rowNote(i); as n) {
          <div class="note small">{{ n }}</div>
        }
        @for (l of lintsFor(i); track l.message) {
          <app-alert-item [severity]="l.severity" [message]="l.message" [code]="l.code" />
        }
        @if (!last) {
          <div class="joiner">or</div>
        }
      }
      <button class="btn sm" (click)="add()"><app-icon name="plus" [size]="14" /> Add skip condition</button>
    } @else {
      @if (!draft().length) {
        <p class="muted small">No conditions: {{ subject() }} always runs.</p>
      }
      @for (c of draft(); track $index; let i = $index; let last = $last) {
        <div class="cond run">
          <span class="num">{{ i + 1 }}</span>
          <span class="lead">Run only when</span>
          <app-claim-picker class="claim" [value]="c.claim" [availability]="availability()" (changed)="updateRun(i, { claim: $event })" />
          <select [appValue]="c.op" (change)="updateRun(i, { op: $any($event.target).value })" aria-label="Condition">
            @for (o of runOps; track o.op) {
              <option [value]="o.op">{{ o.label }}</option>
            }
          </select>
          @if (c.op === 'eq' || c.op === 'neq') {
            <input class="val" type="text" [value]="c.value ?? ''" [attr.list]="'rvals-' + uid + '-' + i" placeholder="value" aria-label="Value" (change)="updateRun(i, { value: $any($event.target).value })" />
            <datalist [id]="'rvals-' + uid + '-' + i">
              @for (v of valuesFor(c.claim); track v) {
                <option [value]="v"></option>
              }
            </datalist>
          }
          <span class="tools">
            <button class="btn ghost sm icon" title="Remove" (click)="removeRun(i)"><app-icon name="close" [size]="14" /></button>
          </span>
        </div>
        @if (!last) {
          <div class="joiner">and</div>
        }
      }
      <button class="btn sm" (click)="addRun()"><app-icon name="plus" [size]="14" /> Add run condition</button>
      <p class="hint small muted">Written as skip preconditions. "equals" adds the Microsoft-recommended pair: skip if missing, then skip if not equal.</p>
    }

    <div class="explain card">
      <div class="ex-head">
        <app-icon name="skip" [size]="15" />
        <strong>{{ ex().summary }}</strong>
      </div>
      @if (atoms().length) {
        <div class="cols">
          <div>
            <h4>Skipped when <em>any</em> holds</h4>
            <ol>
              @for (it of ex().items; track it.index) {
                <li [class.dim]="!it.atom">
                  {{ it.sentence }}
                  @if (analysis() && it.skipCount) {
                    <span class="chip skip" [title]="it.skipsOn.join('\n')">decides {{ it.skipCount }} case{{ it.skipCount > 1 ? 's' : '' }}</span>
                  }
                </li>
              }
            </ol>
          </div>
          <div>
            <h4>Runs only when <em>all</em> hold</h4>
            @if (ex().never) {
              <p class="err small">Never — the conditions cover every case.</p>
            } @else {
              <ul>
                @for (r of ex().runsOnlyWhen; track r) {
                  <li>{{ r }}</li>
                }
              </ul>
            }
          </div>
        </div>
      }
      @if (summary(); as sm) {
        <h4>In the analysed scenarios</h4>
        <div class="paths">
          @if (sm.ranWhen.length) {
            <div class="prow"><span class="chip ok">runs</span><span class="truncate" [title]="sm.ranWhen.join('\n')">{{ sm.ranWhen.join('; ') }}</span></div>
          }
          @for (e of skippedList(); track e.index) {
            <div class="prow"><span class="chip skip">skipped by {{ e.index + 1 }}</span><span class="truncate" [title]="e.witnesses.join('\n')">{{ e.witnesses.join('; ') }}</span></div>
          }
          @if (sm.runs === 'unreached') {
            <div class="prow"><span class="chip absent">not reached</span><span class="muted">No scenario gets this far.</span></div>
          }
        </div>
        <p class="muted small">Pick a scenario in the journey toolbar to see exactly what happens in one case.</p>
      }
      @for (l of generalLints(); track l.message) {
        <app-alert-item [severity]="l.severity" [message]="l.message" [code]="l.code" />
      }
      @if (ex().truth.rows.length > 1) {
        <button class="btn ghost sm" (click)="showTruth.set(!showTruth())"><app-icon [name]="showTruth() ? 'chevronDown' : 'chevronRight'" [size]="14" /> Every combination ({{ ex().truth.rows.length }})</button>
        @if (showTruth()) {
          <table class="grid truth">
            <thead>
              <tr>
                @for (c of ex().truth.claims; track c) {
                  <th>{{ c }}</th>
                }
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              @for (r of ex().truth.rows; track $index) {
                <tr>
                  @for (cell of r.cells; track $index) {
                    <td class="mono">{{ cell }}</td>
                  }
                  <td>
                    @if (r.skippedBy < 0) {
                      <span class="chip ok">runs</span>
                    } @else {
                      <span class="chip skip">skip ({{ r.skippedBy + 1 }})</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .modes { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
    .seg button { border: 0; background: var(--surface); color: var(--text-2); padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; }
    .seg button.on { background: var(--accent-2); color: var(--accent); font-weight: 600; }
    .seg button:disabled { opacity: 0.5; cursor: default; }
    .cond { display: flex; align-items: center; gap: 6px; padding: 6px; border: 1px solid var(--border); border-left: 3px solid var(--skip); border-radius: 6px; background: var(--surface); flex-wrap: wrap; }
    .cond.run { border-left-color: var(--ok); }
    .cond.bad { border-left-color: var(--error); }
    .num { width: 18px; height: 18px; border-radius: 50%; background: var(--surface-3); font-size: 11px; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; flex: none; }
    .lead { font-weight: 600; font-size: 12px; color: var(--text-2); white-space: nowrap; }
    .claim { flex: 1 1 150px; }
    select { flex: 0 0 auto; }
    .val { flex: 1 1 90px; }
    .tools { display: inline-flex; margin-left: auto; }
    .joiner { font-size: 11px; font-weight: 700; color: var(--text-3); text-transform: uppercase; margin: 2px 0 2px 14px; }
    .raw { color: var(--text-3); font-size: 11px; margin: 2px 0 0 30px; }
    .note { color: var(--text-3); margin: 3px 0 0 30px; }
    .lint { display: flex; gap: 5px; align-items: flex-start; margin: 4px 0 0 30px; }
    .lint.error { color: var(--error); }
    .lint.warning { color: var(--warning); }
    .lint.info { color: var(--info); }
    .explain { margin-top: 12px; padding: 10px 12px; background: var(--surface-2); }
    .explain .lint { margin-left: 0; }
    .ex-head { display: flex; align-items: center; gap: 6px; color: var(--skip); margin-bottom: 6px; }
    .ex-head strong { color: var(--text); }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    h4 { margin: 8px 0 4px; }
    h4 em { font-style: normal; color: var(--text); }
    ol, ul { margin: 0; padding-left: 18px; }
    li { margin: 2px 0; }
    li .chip { margin-left: 4px; height: 17px; font-size: 10.5px; }
    .dim { color: var(--text-3); }
    .paths { display: flex; flex-direction: column; gap: 2px; }
    .prow { display: flex; align-items: center; gap: 6px; padding: 2px 4px; border-radius: 4px; cursor: pointer; }
    .prow:hover, .prow.sel { background: var(--accent-2); }
    .prow .chip { flex: none; height: 18px; font-size: 10.5px; }
    .truth { margin-top: 6px; }
    .hint { margin-top: 6px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreconditionEditor {
  protected readonly store = inject(EditorStore);
  readonly preconditions = input.required<readonly Precondition[]>();
  /** Element that owns the Preconditions (OrchestrationStep or ValidationTechnicalProfile). */
  readonly ownerRef = input.required<SourceRef>();
  readonly action = input('SkipThisOrchestrationStep');
  readonly stepKey = input<string | null>(null);
  readonly subject = input('this step');

  protected readonly uid = Math.random().toString(36).slice(2, 7);
  protected readonly skipOps = SKIP_OPS;
  protected readonly runOps = RUN_OPS;
  protected readonly mode = signal<'skip' | 'run'>('skip');
  protected readonly raw = signal(false);
  protected readonly showTruth = signal(false);

  protected readonly rows = computed(() => this.preconditions().map((p) => ({ ...parsePrecondition(p, this.action()), atom: parsePrecondition(p, this.action()).skipWhen })));
  protected readonly atoms = computed(() => this.rows().flatMap((r) => (r.atom ? [r.atom] : [])));
  protected readonly invalid = computed(() => this.rows().filter((r) => !r.atom));

  protected readonly analysis = computed(() => (this.stepKey() ? this.store.analysis() : null));
  protected readonly availability = computed<ReadonlyMap<string, ClaimAvailability> | null>(() => {
    const k = this.stepKey();
    return k ? (this.store.analysis()?.steps.get(k)?.before ?? null) : null;
  });

  protected readonly ex = computed(() =>
    explainPreconditions(this.preconditions(), {
      action: this.action(),
      eff: this.store.eff() ?? undefined,
      analysis: this.analysis() ?? undefined,
      stepKey: this.stepKey() ?? undefined,
    }),
  );
  protected readonly runForm = computed(() => (this.invalid().length ? null : this.ex().runWhen));
  private readonly runDraft = signal<RunWhen[] | null>(null);
  protected readonly draft = computed(() => this.runDraft() ?? this.runForm() ?? []);

  protected readonly generalLints = computed(() => this.ex().lints.filter((l) => l.index === undefined));
  protected lintsFor(i: number) {
    return this.ex().lints.filter((l) => l.index === i && !this.rows()[i].problems.includes(l.message));
  }
  protected rowNote(i: number): string | undefined {
    return this.ex().items[i]?.note;
  }

  protected readonly summary = computed(() => {
    const k = this.stepKey();
    return k ? (this.store.analysis()?.steps.get(k) ?? null) : null;
  });

  protected readonly skippedList = computed(() => [...(this.summary()?.skippedBy ?? [])].map(([index, v]) => ({ index, witnesses: v.witnesses })).sort((a, b) => a.index - b.index));

  protected valuesFor(claim: string): string[] {
    const eff = this.store.eff();
    const ct = eff?.claimType(claim);
    const vals = new Set<string>();
    for (const e of ct?.restriction?.enumeration ?? []) vals.add(e.value);
    if (ct?.dataType === 'boolean') {
      vals.add('True');
      vals.add('False');
    }
    const k = this.stepKey();
    const av = k ? this.store.analysis()?.steps.get(k)?.before.get(idKey(claim)) : undefined;
    for (const v of av?.values ?? []) vals.add(v);
    return [...vals];
  }

  // ------------------------------------------------------------- skip mode edits
  private write(atoms: Atom[], label: string): void {
    const ref = this.ownerRef();
    this.store.edit(label, [{ fileId: ref.fileId, mutate: (d) => setPreconditions(d, ref, atoms, this.action()) }]);
  }

  private currentAtoms(): Atom[] {
    // Invalid rows are dropped when rewriting; warn via lints beforehand.
    return this.rows().map((r) => r.atom ?? { claim: r.source.values[0] ?? 'claim', op: 'exists' });
  }

  protected update(i: number, patch: Partial<Atom>): void {
    const atoms = this.currentAtoms();
    const a = { ...atoms[i], ...patch };
    if ((a.op === 'eq' || a.op === 'neq') && a.value === undefined) a.value = this.valuesFor(a.claim)[0] ?? '';
    if (a.op === 'exists' || a.op === 'missing') delete a.value;
    atoms[i] = a;
    this.write(atoms, `Edit precondition ${i + 1}`);
  }

  protected add(): void {
    const atoms = this.currentAtoms();
    const suggestion = this.availability() ? [...this.availability()!.values()].find((v) => v.availability === 'maybe')?.id : undefined;
    atoms.push({ claim: suggestion ?? 'objectId', op: 'exists' });
    this.write(atoms, 'Add precondition');
  }

  protected remove(i: number): void {
    const atoms = this.currentAtoms();
    atoms.splice(i, 1);
    this.write(atoms, `Remove precondition ${i + 1}`);
  }

  protected move(i: number, d: number): void {
    const atoms = this.currentAtoms();
    const [a] = atoms.splice(i, 1);
    atoms.splice(i + d, 0, a);
    this.write(atoms, 'Reorder preconditions');
  }

  // ------------------------------------------------------------- run mode edits
  private writeRun(conds: RunWhen[], label: string): void {
    this.runDraft.set(conds);
    const complete = conds.every((c) => c.claim && ((c.op !== 'eq' && c.op !== 'neq') || c.value !== undefined));
    if (complete) {
      this.write(compileRunWhen(conds), label);
      this.runDraft.set(null);
    }
  }

  protected updateRun(i: number, patch: Partial<RunWhen>): void {
    const conds = [...this.draft()];
    const c = { ...conds[i], ...patch };
    if ((c.op === 'eq' || c.op === 'neq') && c.value === undefined) c.value = this.valuesFor(c.claim)[0] ?? '';
    if (c.op === 'exists' || c.op === 'missing') delete c.value;
    conds[i] = c;
    this.writeRun(conds, 'Edit run condition');
  }

  protected addRun(): void {
    this.writeRun([...this.draft(), { claim: 'objectId', op: 'exists' }], 'Add run condition');
  }

  protected removeRun(i: number): void {
    const conds = [...this.draft()];
    conds.splice(i, 1);
    this.writeRun(conds, 'Remove run condition');
  }
}
