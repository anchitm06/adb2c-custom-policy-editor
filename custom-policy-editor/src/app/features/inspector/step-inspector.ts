import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Availability } from '../../core/analysis/journey-analyzer';
import { addClaimsExchange, addSelection, removeAt, setAttribute, setCandidate, setStepType } from '../../core/edit/commands';
import { idKey, STEP_TYPES } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { AVAILABILITY_CLASS, stepTypeInfo, tpKindInfo } from '../../shared/present';
import { ClaimsBag } from '../claims-bag/claims-bag';
import { PreconditionEditor } from '../preconditions/precondition-editor';
import { ElementXml } from '../xml-editor/element-xml';
import { SelectValue } from '../../shared/select-value';

@Component({
  selector: 'app-step-inspector',
  imports: [SelectValue, Icon, PreconditionEditor, ElementXml, ClaimsBag],
  template: `
    @if (step(); as st) {
      <div class="head">
        <span class="order">{{ st.orderText }}</span>
        <div class="grow">
          <div class="title">{{ info().label }}</div>
          <div class="muted small">{{ journeyId() }} · <span class="layer">{{ store.layerOf(st.ref.fileId) }}</span> {{ store.fileName(st.ref.fileId) }}</div>
        </div>
        <span class="chip {{ runsClass() }}">{{ runsText() }}</span>
      </div>
      <div class="tabs" role="tablist">
        @for (t of tabs; track t.id) {
          <button role="tab" [attr.aria-selected]="tab() === t.id" [class.on]="tab() === t.id" (click)="tab.set(t.id)">
            {{ t.label }}
            @if (t.id === 'pre' && st.preconditions.length) {
              <span class="count">{{ st.preconditions.length }}</span>
            }
          </button>
        }
      </div>
      <div class="body">
        @switch (tab()) {
          @case ('step') {
            <p class="muted small">{{ info().description }}</p>
            @for (d of problems(); track d.key) {
              <div class="banner {{ d.severity === 'info' ? '' : d.severity }} small"><app-icon [name]="d.severity" [size]="14" /> <span class="grow">{{ d.message }}</span>
                @if (d.fix) {
                  <button class="btn sm" (click)="store.applyFix(d.fix)">{{ d.fix.label }}</button>
                }
              </div>
            }
            <div class="field">
              <label for="st-type">Step type</label>
              <select id="st-type" [appValue]="st.type" (change)="setType($any($event.target).value)">
                @for (t of stepTypes; track t) {
                  <option [value]="t">{{ typeLabel(t) }} ({{ t }})</option>
                }
              </select>
            </div>
            @if (st.type === 'CombinedSignInAndSignUp' || st.type === 'ClaimsProviderSelection' || st.contentDefinitionReferenceId) {
              <div class="field">
                <label for="st-cd">Content definition (page layout)</label>
                <select id="st-cd" [appValue]="st.contentDefinitionReferenceId ?? ''" (change)="setAttr('ContentDefinitionReferenceId', $any($event.target).value)">
                  <option value="">(none)</option>
                  @for (c of contentDefs(); track c) {
                    <option [value]="c">{{ c }}</option>
                  }
                </select>
              </div>
            }
            @if (st.type === 'SendClaims') {
              <div class="field">
                <label for="st-iss">Token issuer technical profile</label>
                <select id="st-iss" [appValue]="st.cpimIssuerTechnicalProfileReferenceId ?? ''" (change)="setAttr('CpimIssuerTechnicalProfileReferenceId', $any($event.target).value)">
                  <option value="">(journey default)</option>
                  @for (t of issuers(); track t) {
                    <option [value]="t">{{ t }}</option>
                  }
                </select>
              </div>
            }
            @if (st.type === 'InvokeSubJourney') {
              <div class="field">
                <label for="st-sub">Sub journey</label>
                <select id="st-sub" [appValue]="st.journeyCandidates[0]?.subJourneyReferenceId ?? ''" (change)="setSub($any($event.target).value)">
                  <option value="">(choose)</option>
                  @for (s of subJourneys(); track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </div>
            }

            @if (st.type === 'CombinedSignInAndSignUp' || st.type === 'ClaimsProviderSelection') {
              <h4>Buttons (claims provider selections)</h4>
              @for (sel of st.claimsProviderSelections; track $index) {
                <div class="row sel">
                  <select [appValue]="sel.targetClaimsExchangeId ? 'target' : 'validation'" aria-label="Selection kind" (change)="switchSelection(sel.ref, $any($event.target).value, sel.targetClaimsExchangeId ?? sel.validationClaimsExchangeId ?? '')">
                    <option value="target">Runs in next step</option>
                    <option value="validation">Runs on this page</option>
                  </select>
                  <select class="grow" [appValue]="sel.targetClaimsExchangeId ?? sel.validationClaimsExchangeId ?? ''" aria-label="Claims exchange" (change)="setSelAttr(sel.ref, sel.targetClaimsExchangeId !== undefined ? 'TargetClaimsExchangeId' : 'ValidationClaimsExchangeId', $any($event.target).value)">
                    <option value="">(choose)</option>
                    @for (x of (sel.targetClaimsExchangeId !== undefined ? nextExchanges() : ownExchanges()); track x) {
                      <option [value]="x">{{ x }}</option>
                    }
                  </select>
                  <button class="btn ghost sm icon" title="Remove" (click)="remove(sel.ref, 'Remove button')"><app-icon name="close" [size]="14" /></button>
                </div>
              }
              <button class="btn sm" (click)="addSel()"><app-icon name="plus" [size]="14" /> Add button</button>
            }

            @if (st.type !== 'SendClaims' && st.type !== 'InvokeSubJourney' && st.type !== 'GetClaims') {
              <h4>Claims exchanges</h4>
              @if (st.type !== 'ClaimsExchange') {
                <p class="muted small">Exchanges listed here run on this page (ValidationClaimsExchangeId).</p>
              } @else if (st.claimsExchanges.length > 1) {
                <p class="muted small">One of these runs, depending on the button picked in the previous step.</p>
              }
              @for (x of exchanges(); track x.id) {
                <div class="xcard">
                  <div class="row">
                    <app-icon [name]="x.icon" [size]="15" />
                    <input class="grow" type="text" [value]="x.id" aria-label="Exchange Id" title="ClaimsExchange Id" (change)="setSelAttr(x.ref, 'Id', $any($event.target).value)" />
                    <button class="btn ghost sm icon" title="Remove exchange" (click)="remove(x.ref, 'Remove claims exchange')"><app-icon name="close" [size]="14" /></button>
                  </div>
                  <div class="row" style="margin-top: 4px">
                    <input class="grow" type="text" [value]="x.tpId" list="tp-list" aria-label="Technical profile" (change)="setSelAttr(x.ref, 'TechnicalProfileReferenceId', $any($event.target).value)" />
                    <button class="btn sm" [disabled]="x.missing" (click)="openTp(x.tpId)">Open</button>
                  </div>
                  <div class="small muted" style="margin: 4px 0">{{ x.kind }}{{ x.include ? ' · includes ' + x.include : '' }}</div>
                  @if (x.inputs.length) {
                    <div class="claims"><span class="lbl">Inputs</span>
                      @for (c of x.inputs; track c.id) {
                        <span class="chip {{ cls(c.av) }}" [title]="c.id + ': ' + c.av + ' before this step' + (c.def ? ' (has default value)' : '')">{{ c.id }}{{ c.def ? '*' : '' }}</span>
                      }
                    </div>
                  }
                  @if (x.outputs.length) {
                    <div class="claims"><span class="lbl">Outputs</span>
                      @for (c of x.outputs; track c) {
                        <span class="chip outline">{{ c }}</span>
                      }
                    </div>
                  }
                  @if (x.vtps.length) {
                    <div class="claims"><span class="lbl">Validation</span>
                      @for (v of x.vtps; track v) {
                        <span class="chip info clickable" role="button" tabindex="0" (click)="openTp(v)" (keydown.enter)="openTp(v)">{{ v }}</span>
                      }
                    </div>
                  }
                </div>
              }
              <button class="btn sm" (click)="addExchange()"><app-icon name="plus" [size]="14" /> Add claims exchange</button>
              <datalist id="tp-list">
                @for (t of allTps(); track t.id) {
                  <option [value]="t.id">{{ t.label }}</option>
                }
              </datalist>
            }
          }
          @case ('pre') {
            <app-precondition-editor [preconditions]="st.preconditions" [ownerRef]="st.ref" [stepKey]="stepKey()" />
          }
          @case ('claims') {
            <app-claims-bag [stepKey]="stepKey()" />
          }
          @case ('xml') {
            <app-element-xml [ref]="st.ref" [label]="'Edit XML of step ' + st.orderText" />
          }
        }
      </div>
    } @else {
      <div class="empty small">This step no longer exists.</div>
    }
  `,
  styleUrl: './inspector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepInspector {
  protected readonly store = inject(EditorStore);
  readonly stepKey = input.required<string>();
  readonly journeyId = input.required<string>();
  protected readonly tab = this.store.inspectorTab;
  protected readonly tabs = [
    { id: 'step' as const, label: 'Step' },
    { id: 'pre' as const, label: 'Preconditions' },
    { id: 'claims' as const, label: 'Claims bag' },
    { id: 'xml' as const, label: 'XML' },
  ];
  protected readonly stepTypes = STEP_TYPES;

  private readonly journey = computed(() => {
    const eff = this.store.eff();
    const id = this.journeyId();
    return eff?.userJourneys.get(idKey(id))?.value ?? eff?.subJourneys.get(idKey(id))?.value ?? null;
  });
  protected readonly step = computed(() => {
    const j = this.journey();
    const ord = this.stepKey().split('#')[1];
    return j?.steps.find((s) => s.orderText.trim() === ord) ?? null;
  });
  private readonly index = computed(() => {
    const j = this.journey();
    const s = this.step();
    return j && s ? j.steps.indexOf(s) : -1;
  });
  protected readonly info = computed(() => stepTypeInfo(this.step()?.type ?? ''));
  private readonly summary = computed(() => this.store.analysis()?.steps.get(this.stepKey()));
  protected readonly runsText = computed(() => {
    const s = this.summary();
    if (!s) return 'Not reached';
    const total = s.runPaths.length + s.skipPaths.length;
    return s.runs === 'always' ? 'Always runs' : s.runs === 'never' ? 'Never runs' : `Runs on ${s.runPaths.length}/${total} paths`;
  });
  protected readonly runsClass = computed(() => {
    const r = this.summary()?.runs;
    return r === 'always' ? 'ok' : r === 'sometimes' ? 'maybe' : 'absent';
  });
  protected readonly problems = computed(() => this.store.diagnosticsByStep().get(this.stepKey()) ?? []);

  protected readonly contentDefs = computed(() => [...(this.store.eff()?.contentDefinitions.values() ?? [])].map((c) => c.id));
  protected readonly subJourneys = computed(() => [...(this.store.eff()?.subJourneys.values() ?? [])].map((c) => c.id));
  protected readonly allTps = computed(() =>
    [...(this.store.eff()?.technicalProfiles.values() ?? [])].map((t) => {
      const f = this.store.eff()!.tp(t.id);
      return { id: t.id, label: `${f?.displayName ?? ''} — ${tpKindInfo(f?.kind).label}` };
    }),
  );
  protected readonly issuers = computed(() => {
    const eff = this.store.eff();
    if (!eff) return [];
    return [...eff.technicalProfiles.values()].filter((t) => ['jwtIssuer', 'samlIssuer', 'oauth2Error'].includes(eff.tp(t.id)?.kind ?? '')).map((t) => t.id);
  });
  protected readonly ownExchanges = computed(() => (this.step()?.claimsExchanges ?? []).map((x) => x.id));
  protected readonly nextExchanges = computed(() => {
    const j = this.journey();
    const i = this.index();
    return (j?.steps[i + 1]?.claimsExchanges ?? []).map((x) => x.id);
  });

  protected readonly exchanges = computed(() => {
    const eff = this.store.eff();
    const st = this.step();
    const before = this.summary()?.before;
    if (!eff || !st) return [];
    return st.claimsExchanges.map((x) => {
      const tp = eff.tp(x.technicalProfileReferenceId);
      const k = tpKindInfo(tp?.kind);
      return {
        id: x.id,
        ref: x.ref,
        tpId: x.technicalProfileReferenceId,
        missing: !tp,
        icon: k.icon,
        kind: tp ? k.label : 'Technical profile not found',
        include: tp?.includeChain.join(' → '),
        inputs: (tp?.inputClaims ?? []).map((c) => ({ id: c.claimTypeReferenceId, def: c.defaultValue !== undefined, av: (before?.get(idKey(c.claimTypeReferenceId))?.availability ?? 'absent') as Availability })),
        outputs: (tp?.outputClaims ?? []).map((c) => c.claimTypeReferenceId),
        vtps: (tp?.validationTechnicalProfiles ?? []).map((v) => v.referenceId),
      };
    });
  });

  protected typeLabel(t: string): string {
    return stepTypeInfo(t).label;
  }
  protected cls(a: Availability): string {
    return AVAILABILITY_CLASS[a];
  }

  protected setType(type: string): void {
    const st = this.step();
    if (st) this.store.edit(`Change step ${st.orderText} type`, [{ fileId: st.ref.fileId, mutate: (d) => setStepType(d, st.ref, type) }]);
  }
  protected setAttr(name: string, value: string): void {
    const st = this.step();
    if (st) this.store.edit(`Set ${name} on step ${st.orderText}`, [{ fileId: st.ref.fileId, mutate: (d) => setAttribute(d, st.ref, name, value || null) }]);
  }
  protected setSub(id: string): void {
    const st = this.step();
    if (st) this.store.edit(`Set sub journey of step ${st.orderText}`, [{ fileId: st.ref.fileId, mutate: (d) => setCandidate(d, st.ref, id) }]);
  }
  protected setSelAttr(ref: { fileId: string; path: readonly number[]; line: number }, name: string, value: string): void {
    this.store.edit(`Set ${name}`, [{ fileId: ref.fileId, mutate: (d) => setAttribute(d, ref, name, value) }]);
  }
  protected switchSelection(ref: { fileId: string; path: readonly number[]; line: number }, kind: string, value: string): void {
    this.store.edit('Change button behaviour', [
      {
        fileId: ref.fileId,
        mutate: (d) => {
          setAttribute(d, ref, kind === 'target' ? 'ValidationClaimsExchangeId' : 'TargetClaimsExchangeId', null);
          setAttribute(d, ref, kind === 'target' ? 'TargetClaimsExchangeId' : 'ValidationClaimsExchangeId', value || 'Exchange');
        },
      },
    ]);
  }
  protected remove(ref: { fileId: string; path: readonly number[]; line: number }, label: string): void {
    this.store.edit(label, [{ fileId: ref.fileId, mutate: (d) => removeAt(d, ref) }]);
  }
  protected addExchange(): void {
    const st = this.step();
    if (!st) return;
    const used = new Set(this.journey()?.steps.flatMap((s) => s.claimsExchanges.map((x) => idKey(x.id))));
    let id = 'NewExchange';
    for (let n = 2; used.has(idKey(id)); n++) id = `NewExchange${n}`;
    this.store.edit(`Add claims exchange to step ${st.orderText}`, [{ fileId: st.ref.fileId, mutate: (d) => addClaimsExchange(d, st.ref, id, '') }]);
  }
  protected addSel(): void {
    const st = this.step();
    if (!st) return;
    const target = this.nextExchanges().find((x) => !st.claimsProviderSelections.some((s) => idKey(s.targetClaimsExchangeId) === idKey(x))) ?? '';
    this.store.edit(`Add button to step ${st.orderText}`, [{ fileId: st.ref.fileId, mutate: (d) => addSelection(d, st.ref, { target: target || 'Exchange' }) }]);
  }
  protected openTp(id: string): void {
    this.store.view.set('technicalProfiles');
    this.store.mainMode.set('visual');
    this.store.selection.set({ kind: 'technicalProfile', id });
  }
}
