import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Availability, StepSummary } from '../../core/analysis/journey-analyzer';
import { stepKey } from '../../core/analysis/journey-analyzer';
import { explainPreconditions } from '../../core/analysis/precondition-explainer';
import { addStep, duplicateStep, moveStep, removeStep } from '../../core/edit/commands';
import { idKey, OrchestrationStepDef, SourceRef, UserJourneyDef } from '../../core/model/types';
import { Diagnostic } from '../../core/validate/validate';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { AVAILABILITY_CLASS, plural, STEP_TYPE_INFO, stepTypeInfo, tpKindInfo } from '../../shared/present';
import { SelectValue } from '../../shared/select-value';

interface ExchangeVM {
  id: string;
  tpId: string;
  name: string;
  icon: string;
  kindLabel: string;
  via?: string;
  missing: boolean;
  onPath?: boolean;
}

interface StepVM {
  step: OrchestrationStepDef;
  key: string;
  journeyId: string;
  type: { label: string; icon: string };
  layer: string;
  exchanges: ExchangeVM[];
  options: { label: string; kind: 'target' | 'validation' | 'signup' }[];
  candidate?: { id: string; type?: string; steps: StepVM[] };
  issuer?: string;
  preSummary?: string;
  preNever: boolean;
  summary?: StepSummary;
  runs: string;
  runsClass: string;
  produced: string[];
  needs: { claim: string; availability: Availability }[];
  errors: number;
  warnings: number;
  diags: Diagnostic[];
  path?: { state: 'ran' | 'skipped' | 'unreached'; detail?: string };
  changed: boolean;
}

@Component({
  selector: 'app-journey-canvas',
  imports: [SelectValue, Icon, CdkDropList, CdkDrag, CdkDragHandle],
  template: `
    @if (journey(); as j) {
      <div class="toolbar">
        <div class="jsel">
          <app-icon name="journey" />
          <select [appValue]="j.id" (change)="store.openJourney($any($event.target).value)" aria-label="User journey">
            <optgroup label="User journeys">
              @for (id of store.journeyIds(); track id) {
                <option [value]="id">{{ id }}{{ id === defaultJourney() ? ' (relying party default)' : '' }}</option>
              }
            </optgroup>
            @if (subIds().length) {
              <optgroup label="Sub journeys">
                @for (id of subIds(); track id) {
                  <option [value]="id">{{ id }}</option>
                }
              </optgroup>
            }
          </select>
          <span class="layer" [title]="store.fileName(j.ref.fileId)">{{ store.layerOf(j.ref.fileId) }}</span>
        </div>
        <div class="paths">
          <span class="muted small">Paths</span>
          <button class="chip clickable" [class.accent]="store.selectedPath() === null" (click)="store.selectedPath.set(null)">All ({{ analysis()?.paths?.length ?? 0 }})</button>
          @for (p of analysis()?.paths ?? []; track p.id) {
            <button class="chip clickable" [class.accent]="store.selectedPath() === p.id" [title]="p.label + ' — ' + outcome(p.outcome)" (click)="store.selectedPath.set(store.selectedPath() === p.id ? null : p.id)">
              <app-icon name="path" [size]="12" /> {{ p.label }}
            </button>
          }
          @if (analysis()?.truncated) {
            <span class="chip warning">truncated</span>
          }
        </div>
      </div>

      @if (baseBanner(); as b) {
        <div class="banner warning top">
          <app-icon name="layers" />
          <div class="grow">This journey is defined in <strong>{{ b.file }}</strong>. Microsoft recommends copying it to {{ b.target }} under a new Id and pointing the relying party at the copy, instead of changing the base file.</div>
          <button class="btn sm" (click)="copyToTarget()">Copy to {{ b.target }}</button>
        </div>
      }

      <div class="canvas" (click)="onCanvasClick($event)" role="presentation">
        <div class="node start">
          <app-icon name="start" [size]="18" />
          <div>
            <div class="nt">Start</div>
            <div class="muted small">{{ store.activeChain()?.leaf?.policyId }} · claims bag is empty</div>
          </div>
        </div>

        <div class="flow" cdkDropList [cdkDropListDisabled]="!canReorder()" (cdkDropListDropped)="drop($event)">
          @for (s of steps(); track s.key; let i = $index) {
            <div class="item" cdkDrag [cdkDragData]="i">
              <div class="connector">
                <span class="line"></span>
                <button class="add" title="Add a step here" (click)="openAdd(i, $event)"><app-icon name="plus" [size]="12" [stroke]="2.5" /></button>
              </div>
              <div
                class="step card"
                [class.selected]="isSelected(s)"
                [class.ran]="s.path?.state === 'ran'"
                [class.skipped]="s.path?.state === 'skipped' || s.path?.state === 'unreached'"
                [class.never]="!s.path && s.summary?.runs === 'never'"
                [class.changed]="s.changed"
                [class.haspre]="!!s.preSummary"
                role="button"
                tabindex="0"
                [attr.aria-label]="'Step ' + s.step.orderText + ' ' + s.type.label"
                (click)="select(s, $event)"
                (keydown.enter)="select(s, $event)"
              >
                <div class="head">
                  <span class="handle" cdkDragHandle [class.off]="!canReorder()" [title]="canReorder() ? 'Drag to reorder' : 'Steps come from more than one file and can’t be reordered here'"><app-icon name="drag" [size]="14" /></span>
                  <span class="order">{{ s.step.orderText }}</span>
                  <app-icon [name]="s.type.icon" [size]="15" />
                  <span class="type">{{ s.type.label }}</span>
                  <span class="spacer"></span>
                  @if (s.errors) {
                    <span class="chip error" [title]="diagTitle(s)"><app-icon name="error" [size]="12" /> {{ s.errors }}</span>
                  }
                  @if (s.warnings) {
                    <span class="chip warning" [title]="diagTitle(s)"><app-icon name="warning" [size]="12" /> {{ s.warnings }}</span>
                  }
                  <span class="chip {{ s.runsClass }}" [title]="runsTitle(s)">{{ s.path ? pathStateLabel(s) : s.runs }}</span>
                  <span class="layer" [title]="store.fileName(s.step.ref.fileId)">{{ s.layer }}</span>
                  <span class="menu">
                    <button class="btn ghost sm icon" title="Duplicate step" (click)="duplicate(s, $event)"><app-icon name="copy" [size]="14" /></button>
                    <button class="btn ghost sm icon" title="Delete step" (click)="remove(s, $event)"><app-icon name="trash" [size]="14" /></button>
                  </span>
                </div>

                @if (s.preSummary) {
                  <div class="pre" [class.never]="s.preNever" role="button" tabindex="0" title="Open the precondition editor" (click)="openPre(s, $event)" (keydown.enter)="openPre(s, $event)">
                    <app-icon name="skip" [size]="13" /> <span class="truncate">{{ s.preSummary }}</span>
                  </div>
                }
                @if (s.options.length) {
                  <div class="options">
                    @for (o of s.options; track o.label) {
                      <span class="opt {{ o.kind }}">{{ o.kind === 'signup' ? 'Sign-up link → ' : '' }}{{ o.label }}</span>
                    }
                  </div>
                }
                @for (x of s.exchanges; track x.id) {
                  <div class="ex" [class.offpath]="x.onPath === false" [class.missing]="x.missing">
                    <app-icon [name]="x.icon" [size]="14" />
                    <span class="name truncate" [title]="x.tpId">{{ x.name }}</span>
                    <span class="muted small truncate">{{ x.kindLabel }}</span>
                    @if (x.via) {
                      <span class="chip outline" [title]="'Runs when the user picks ' + x.via + ' in the previous step'">via {{ x.via }}</span>
                    }
                    @if (x.missing) {
                      <span class="chip error">missing</span>
                    }
                  </div>
                }
                @if (s.candidate; as c) {
                  <div class="ex">
                    <app-icon name="subjourney" [size]="14" />
                    <span class="name">{{ c.id || '(no sub journey)' }}</span>
                    <span class="muted small">{{ c.type }}</span>
                    @if (c.steps.length) {
                      <button class="btn ghost sm" (click)="toggleSub(s.key, $event)">{{ expanded().has(s.key) ? 'Hide' : 'Show' }} {{ c.steps.length }} steps</button>
                    }
                  </div>
                  @if (expanded().has(s.key)) {
                    <div class="sub">
                      @for (ss of c.steps; track ss.key) {
                        <div class="substep" [class.selected]="isSelected(ss)" [class.skipped]="ss.path?.state === 'skipped'" role="button" tabindex="0" (click)="select(ss, $event)" (keydown.enter)="select(ss, $event)">
                          <span class="order sm">{{ ss.step.orderText }}</span>
                          <app-icon [name]="ss.type.icon" [size]="13" />
                          <span class="truncate grow">{{ ss.exchanges[0]?.name ?? ss.type.label }}</span>
                          @if (ss.preSummary) {
                            <span class="chip skip truncate" style="max-width: 50%">{{ ss.preSummary }}</span>
                          }
                          <span class="chip {{ ss.runsClass }}">{{ ss.runs }}</span>
                        </div>
                      }
                    </div>
                  }
                }
                @if (s.issuer) {
                  <div class="ex">
                    <app-icon name="token" [size]="14" />
                    <span class="name">{{ s.issuer }}</span>
                    <span class="muted small">token issuer</span>
                  </div>
                }

                @if (s.path?.detail) {
                  <div class="pathnote small"><app-icon name="skip" [size]="12" /> {{ s.path!.detail }}</div>
                }

                @if (s.produced.length || s.needs.length) {
                  <div class="claims">
                    @if (s.produced.length) {
                      <span class="lbl">Adds</span>
                      @for (c of s.produced.slice(0, 6); track c) {
                        <span class="chip ok">+ {{ c }}</span>
                      }
                      @if (s.produced.length > 6) {
                        <span class="chip outline" [title]="s.produced.slice(6).join(', ')">+{{ s.produced.length - 6 }}</span>
                      }
                    }
                    @if (s.needs.length) {
                      <span class="lbl">Needs</span>
                      @for (n of s.needs; track n.claim) {
                        <span class="chip {{ needClass(n.availability) }}" [title]="n.claim + ' is ' + (n.availability === 'absent' ? 'not in the claims bag' : 'missing on some paths') + ' before this step'">{{ n.claim }}</span>
                      }
                    }
                  </div>
                }
              </div>
            </div>
          }
          <div class="connector last">
            <span class="line"></span>
            <button class="add" title="Add a step at the end" (click)="openAdd(steps().length, $event)"><app-icon name="plus" [size]="12" [stroke]="2.5" /></button>
          </div>
        </div>

        <div class="node end" role="button" tabindex="0" (click)="store.select({ kind: 'relyingParty' }); $event.stopPropagation()" (keydown.enter)="store.select({ kind: 'relyingParty' })">
          <app-icon name="flag" [size]="18" />
          <div class="grow">
            <div class="nt">Token claims</div>
            <div class="tclaims">
              @for (t of tokenClaims(); track t.claim) {
                <span class="chip {{ cls(t.availability) }}" [title]="t.title">{{ t.claim }}{{ t.partner ? ' → ' + t.partner : '' }}</span>
              } @empty {
                <span class="muted small">No relying party output claims in this chain.</span>
              }
            </div>
          </div>
        </div>
      </div>

      @if (adding(); as a) {
        <div class="addmenu card" [style.top.px]="a.y" [style.left.px]="a.x" role="menu" tabindex="-1" (click)="$event.stopPropagation()" (keydown.escape)="adding.set(null)">
          <div class="muted small" style="padding: 4px 8px">Insert step {{ a.index + 1 }}</div>
          @for (t of stepTypes; track t.type) {
            <button class="list-item" role="menuitem" (click)="insert(t.type)"><app-icon [name]="t.icon" [size]="14" /> {{ t.label }}</button>
          }
        </div>
      }
    } @else {
      <div class="empty">
        <p>This policy chain has no user journeys.</p>
        <p class="small">User journeys are usually in TrustFrameworkBase.xml. Load the base file, or add a journey in the Files view.</p>
      </div>
    }
  `,
  styleUrl: './journey-canvas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'adding.set(null)' },
})
export class JourneyCanvas {
  protected readonly store = inject(EditorStore);
  protected readonly journey = this.store.activeJourney;
  protected readonly analysis = this.store.analysis;
  protected readonly adding = signal<{ index: number; x: number; y: number } | null>(null);
  protected readonly expanded = signal<Set<string>>(new Set());
  protected readonly stepTypes = Object.entries(STEP_TYPE_INFO).map(([type, i]) => ({ type, ...i }));

  protected readonly defaultJourney = computed(() => this.store.eff()?.relyingParty?.defaultUserJourney?.referenceId);
  protected readonly subIds = computed(() => [...(this.store.eff()?.subJourneys.values() ?? [])].map((s) => s.id));

  protected readonly canReorder = computed(() => {
    const j = this.journey();
    if (!j || !j.steps.length) return false;
    const f = j.steps[0].ref.fileId;
    return j.steps.every((s) => s.ref.fileId === f && s.ref.path.length === j.steps[0].ref.path.length);
  });

  protected readonly baseBanner = computed(() => {
    const j = this.journey();
    const chain = this.store.activeChain();
    const target = this.store.targetFile();
    if (!j || !chain || !target) return null;
    const fileIds = new Set(j.steps.map((s) => s.ref.fileId));
    if (fileIds.has(target.fileId) || j.ref.fileId === target.fileId) return null;
    const di = chain.docs.findIndex((d) => d.fileId === j.ref.fileId);
    const ti = chain.docs.findIndex((d) => d.fileId === target.fileId);
    if (di < 0 || ti <= di) return null;
    return { file: this.store.fileName(j.ref.fileId), target: target.fileName };
  });

  protected readonly steps = computed<StepVM[]>(() => {
    const j = this.journey();
    return j ? this.buildSteps(j) : [];
  });

  private buildSteps(j: UserJourneyDef, depth = 0): StepVM[] {
    const eff = this.store.eff()!;
    const a = this.analysis();
    const sel = this.store.selectedPath();
    const path = sel !== null ? a?.paths[sel] : undefined;
    const diags = this.store.diagnosticsByStep();
    const changed = this.store.changedSteps();
    const out: StepVM[] = [];
    j.steps.forEach((st, i) => {
      const key = stepKey(j.id, st.orderText.trim() || String(st.order));
      const summary = a?.steps.get(key);
      const prev = j.steps[i - 1];
      const via = new Map<string, string>();
      if (prev && (prev.type === 'CombinedSignInAndSignUp' || prev.type === 'ClaimsProviderSelection')) {
        for (const s of prev.claimsProviderSelections) {
          if (s.targetClaimsExchangeId) via.set(idKey(s.targetClaimsExchangeId), this.exchangeLabel(j, s.targetClaimsExchangeId));
        }
        for (const s of prev.claimsProviderSelections) {
          const x = s.validationClaimsExchangeId ? prev.claimsExchanges.find((e) => idKey(e.id) === idKey(s.validationClaimsExchangeId)) : undefined;
          const signUp = x ? eff.tp(x.technicalProfileReferenceId)?.metadata.find((m) => m.key === 'SignUpTarget')?.value : undefined;
          if (signUp) via.set(idKey(signUp), 'sign-up link');
        }
      }
      const visit = path?.visits.find((v) => v.stepKey === key);
      const exchanges: ExchangeVM[] = st.claimsExchanges.map((x) => {
        const tp = eff.tp(x.technicalProfileReferenceId);
        const k = tpKindInfo(tp?.kind);
        return {
          id: x.id,
          tpId: x.technicalProfileReferenceId,
          name: tp?.displayName || x.technicalProfileReferenceId,
          icon: k.icon,
          kindLabel: k.label,
          via: via.get(idKey(x.id)),
          missing: !tp,
          onPath: visit ? (visit.ran ? visit.exchangeId === x.id : false) : undefined,
        };
      });
      const options: StepVM['options'] = [];
      for (const s of st.claimsProviderSelections) {
        if (s.targetClaimsExchangeId) options.push({ label: this.exchangeLabel(j, s.targetClaimsExchangeId), kind: 'target' });
        if (s.validationClaimsExchangeId) {
          options.push({ label: this.exchangeLabel(j, s.validationClaimsExchangeId), kind: 'validation' });
          const x = st.claimsExchanges.find((e) => idKey(e.id) === idKey(s.validationClaimsExchangeId));
          const signUp = x ? eff.tp(x.technicalProfileReferenceId)?.metadata.find((m) => m.key === 'SignUpTarget')?.value : undefined;
          if (signUp) options.push({ label: this.exchangeLabel(j, signUp), kind: 'signup' });
        }
      }
      let candidate: StepVM['candidate'];
      if (st.type === 'InvokeSubJourney') {
        const id = st.journeyCandidates[0]?.subJourneyReferenceId ?? '';
        const sub = eff.subJourneys.get(idKey(id))?.value;
        candidate = { id, type: sub?.subJourneyType, steps: sub && depth < 2 ? this.buildSteps(sub, depth + 1) : [] };
      }
      const ex = st.preconditions.length ? explainPreconditions(st.preconditions, { eff, analysis: a ?? undefined, stepKey: key }) : null;
      const d = diags.get(key) ?? [];
      const runs = summary?.runs ?? 'unreached';
      const total = (summary?.runPaths.length ?? 0) + (summary?.skipPaths.length ?? 0);
      const runsText =
        runs === 'always' ? 'Always runs' : runs === 'never' ? 'Never runs' : runs === 'sometimes' ? `Runs on ${summary!.runPaths.length} of ${plural(total, 'path')}` : 'Not reached';
      // Inputs needed by the technical profile(s) that are not definitely present.
      const needs: StepVM['needs'] = [];
      for (const m of summary?.missingInputs ?? []) {
        const tp = eff.tp(m.technicalProfileId);
        if (!m.required && tp && tpKindInfo(tp.kind).interactive) continue;
        if (!needs.some((n) => idKey(n.claim) === idKey(m.claim))) needs.push({ claim: m.claim, availability: m.availability });
      }
      let pathInfo: StepVM['path'];
      if (path) {
        if (!visit) pathInfo = { state: 'unreached', detail: 'Not reached on this path.' };
        else if (visit.ran) pathInfo = { state: 'ran' };
        else {
          const pi = visit.skippedBy ?? -1;
          const sentence = ex?.items[pi]?.sentence;
          pathInfo = { state: 'skipped', detail: sentence ? `Skipped on this path: ${sentence} (precondition ${pi + 1})` : 'Skipped on this path.' };
        }
      }
      out.push({
        step: st,
        key,
        journeyId: j.id,
        type: stepTypeInfo(st.type),
        layer: this.store.layerOf(st.ref.fileId),
        exchanges,
        options,
        candidate,
        issuer: st.type === 'SendClaims' ? (st.cpimIssuerTechnicalProfileReferenceId ?? j.defaultCpimIssuerTechnicalProfileReferenceId ?? '(none)') : undefined,
        preSummary: ex?.summary,
        preNever: !!ex?.never,
        summary,
        runs: runsText,
        runsClass: pathInfo ? (pathInfo.state === 'ran' ? 'ok' : pathInfo.state === 'skipped' ? 'skip' : 'absent') : runs === 'always' ? 'ok' : runs === 'sometimes' ? 'maybe' : 'absent',
        produced: path ? this.producedOnPath(visit) : (summary?.produced ?? []),
        needs,
        errors: d.filter((x) => x.severity === 'error').length,
        warnings: d.filter((x) => x.severity === 'warning').length,
        diags: d,
        path: pathInfo,
        changed: changed.has(key),
      });
    });
    return out;
  }

  private producedOnPath(visit: { before: ReadonlyMap<string, { status: string; id: string }>; after: ReadonlyMap<string, { status: string; id: string; source?: string }>; ran: boolean } | undefined): string[] {
    if (!visit || !visit.ran) return [];
    const out: string[] = [];
    for (const [k, st] of visit.after) {
      const b = visit.before.get(k);
      if (st.status !== 'absent' && (b?.status !== st.status || b !== st)) out.push(st.id);
    }
    return out;
  }

  private exchangeLabel(j: UserJourneyDef, exchangeId: string): string {
    const eff = this.store.eff()!;
    for (const s of j.steps) {
      const x = s.claimsExchanges.find((e) => idKey(e.id) === idKey(exchangeId));
      if (x) return eff.tp(x.technicalProfileReferenceId)?.displayName || exchangeId;
    }
    return exchangeId;
  }

  protected readonly tokenClaims = computed(() =>
    (this.analysis()?.tokenClaims ?? []).map((t) => {
      const sel = this.store.selectedPath();
      let av = t.availability.availability;
      if (sel !== null) av = t.availability.presentOn.includes(sel) ? 'definitely' : t.availability.maybeOn.includes(sel) ? 'maybe' : 'absent';
      const missingOn = [...t.availability.absentOn, ...t.availability.maybeOn].map((p) => this.analysis()!.paths[p]?.label);
      return {
        claim: t.claim,
        partner: t.partnerClaimType,
        availability: av,
        title: av === 'definitely' ? `${t.claim} is always in the token` : `${t.claim} is missing on: ${missingOn.join('; ')}`,
      };
    }),
  );

  protected cls(a: Availability): string {
    return AVAILABILITY_CLASS[a];
  }
  protected needClass(a: Availability): string {
    return a === 'absent' ? 'error' : 'maybe';
  }
  protected outcome(o: string): string {
    return o === 'token' ? 'issues a token' : o === 'transfer' ? 'transfers to a sub journey' : 'ends without a token';
  }
  protected pathStateLabel(s: StepVM): string {
    return s.path?.state === 'ran' ? 'Runs on this path' : s.path?.state === 'skipped' ? 'Skipped' : 'Not reached';
  }
  protected runsTitle(s: StepVM): string {
    const a = this.analysis();
    if (!s.summary || !a) return '';
    const names = (ids: number[]) => ids.map((i) => a.paths[i]?.label).join('\n  ');
    return `Runs on:\n  ${names(s.summary.runPaths) || '—'}\nSkipped on:\n  ${names(s.summary.skipPaths) || '—'}`;
  }
  protected diagTitle(s: StepVM): string {
    return s.diags.filter((d) => d.severity !== 'info').map((d) => `• ${d.message}`).join('\n');
  }

  protected isSelected(s: StepVM): boolean {
    const sel = this.store.selection();
    return sel?.kind === 'step' && sel.stepKey === s.key;
  }

  protected select(s: StepVM, e: Event): void {
    e.stopPropagation();
    this.store.select({ kind: 'step', journeyId: s.journeyId, stepKey: s.key });
  }

  protected openPre(s: StepVM, e: Event): void {
    e.stopPropagation();
    this.store.select({ kind: 'step', journeyId: s.journeyId, stepKey: s.key });
    this.store.inspectorTab.set('pre');
  }

  protected onCanvasClick(e: Event): void {
    if (e.target === e.currentTarget) {
      const j = this.journey();
      if (j) this.store.select({ kind: 'journey', id: j.id });
    }
  }

  protected toggleSub(key: string, e: Event): void {
    e.stopPropagation();
    this.expanded.update((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  private journeyElementRef(): SourceRef | null {
    const j = this.journey();
    if (!j) return null;
    if (j.steps.length && this.canReorder()) return { fileId: j.steps[0].ref.fileId, path: j.steps[0].ref.path.slice(0, -2), line: 0 };
    return j.ref;
  }

  protected openAdd(index: number, e: MouseEvent): void {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.adding.set({ index, x: r.right + 8, y: Math.min(r.top - 10, window.innerHeight - 260) });
  }

  protected insert(type: string): void {
    const a = this.adding();
    const ref = this.journeyElementRef();
    const j = this.journey();
    this.adding.set(null);
    if (!a || !ref || !j) return;
    const ok = this.store.edit(`Add ${stepTypeInfo(type).label.toLowerCase()} step`, [{ fileId: ref.fileId, mutate: (d) => void addStep(d, ref, a.index, type) }]);
    if (ok) this.store.select({ kind: 'step', journeyId: j.id, stepKey: stepKey(j.id, a.index + 1) });
  }

  protected duplicate(s: StepVM, e: Event): void {
    e.stopPropagation();
    this.store.edit(`Duplicate step ${s.step.orderText}`, [{ fileId: s.step.ref.fileId, mutate: (d) => duplicateStep(d, s.step.ref) }]);
  }

  protected remove(s: StepVM, e: Event): void {
    e.stopPropagation();
    this.store.edit(`Delete step ${s.step.orderText}`, [{ fileId: s.step.ref.fileId, mutate: (d) => removeStep(d, s.step.ref) }]);
    this.store.select(null);
  }

  protected drop(e: CdkDragDrop<unknown>): void {
    if (e.previousIndex === e.currentIndex) return;
    const s = this.steps()[e.previousIndex];
    this.store.edit(`Move step ${s.step.orderText} to position ${e.currentIndex + 1}`, [{ fileId: s.step.ref.fileId, mutate: (d) => moveStep(d, s.step.ref, e.currentIndex) }]);
    const j = this.journey();
    if (j) this.store.select({ kind: 'step', journeyId: j.id, stepKey: stepKey(j.id, e.currentIndex + 1) });
  }

  protected copyToTarget(): void {
    this.store.copyJourneyToTarget();
  }
}
