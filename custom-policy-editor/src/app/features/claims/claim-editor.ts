import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DATA_TYPES, SELECTION_INPUT_TYPES, USER_INPUT_TYPES } from '../../core/catalog/claims-transformations';
import { availabilityBefore } from '../../core/analysis/journey-analyzer';
import { setClaimTypeField, setEnumeration, setPredicateValidationReference } from '../../core/edit/commands';
import { idKey } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { AVAILABILITY_CLASS, AVAILABILITY_LABEL } from '../../shared/present';
import { ElementXml } from '../xml-editor/element-xml';
import { SelectValue } from '../../shared/select-value';
import { AlertItem } from '../../shared/alert-item';

interface Usage {
  kind: 'set' | 'read' | 'check' | 'token' | 'transform' | 'persist';
  label: string;
  go: () => void;
}

@Component({
  selector: 'app-claim-editor',
  imports: [AlertItem, SelectValue, Icon, ElementXml],
  template: `
    @if (ct(); as c) {
      <header class="ed-head">
        <app-icon name="claim" [size]="22" />
        <div class="grow">
          <h2 class="mono">{{ c.id }}</h2>
          <div class="muted small">{{ c.displayName }} · {{ c.dataType ?? 'no data type' }}</div>
        </div>
        <div class="layers">
          @for (l of layers(); track $index) {
            <span class="layer" [title]="store.fileName(l)">{{ store.layerOf(l) }}</span>
          }
        </div>
      </header>
      <div class="ed-body">
        @for (d of problems(); track d.key) {
          <app-alert-item [severity]="d.severity" [message]="d.message" [code]="d.code" [quickFix]="d.fix" />
        }
        <section class="card sec">
          <h3>Definition</h3>
          <p class="muted small">Editing {{ store.fileName(c.ref.fileId) }}.</p>
          <div class="grid2">
            <div class="field">
              <label for="c-id">Id</label>
              <div class="row">
                <input id="c-id" class="grow mono" type="text" [value]="c.id" #rid />
                <button class="btn sm" [disabled]="rid.value === c.id" (click)="rename(rid.value)">Rename everywhere</button>
              </div>
              <span class="hint">Updates every ClaimTypeReferenceId and precondition in all loaded files ({{ refCount() }} references).</span>
            </div>
            <div class="field">
              <label for="c-dn">Display name</label>
              <input id="c-dn" type="text" [value]="c.displayName ?? ''" (change)="set('DisplayName', $any($event.target).value)" />
            </div>
            <div class="field">
              <label for="c-dt">Data type</label>
              <select id="c-dt" [appValue]="c.dataType ?? ''" (change)="set('DataType', $any($event.target).value)">
                @if (!c.dataType) {
                  <option value="">(choose)</option>
                }
                @for (d of dataTypes; track d) {
                  <option [value]="d">{{ d }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="c-uit">User input type</label>
              <select id="c-uit" [appValue]="c.userInputType ?? ''" (change)="set('UserInputType', $any($event.target).value)">
                <option value="">(not collected from the user)</option>
                @for (u of inputTypes; track u) {
                  <option [value]="u">{{ u }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="c-uht">User help text</label>
              <input id="c-uht" type="text" [value]="c.userHelpText ?? ''" (change)="set('UserHelpText', $any($event.target).value)" />
            </div>
            <div class="field">
              <label for="c-aht">Admin help text</label>
              <input id="c-aht" type="text" [value]="c.adminHelpText ?? ''" (change)="set('AdminHelpText', $any($event.target).value)" />
            </div>
            <div class="field">
              <label for="c-pv">Predicate validation</label>
              <select id="c-pv" [appValue]="c.predicateValidationReference ?? ''" (change)="setPv($any($event.target).value)">
                <option value="">(none)</option>
                @for (p of predicateValidations(); track p) {
                  <option [value]="p">{{ p }}</option>
                }
              </select>
            </div>
            @if (c.restriction?.pattern; as pat) {
              <div class="field">
                <span class="label">Pattern</span>
                <code class="small">{{ pat.regularExpression }}</code>
                <span class="hint">{{ pat.helpText }}</span>
              </div>
            }
          </div>
        </section>

        @if (needsEnum() || (c.restriction?.enumeration?.length ?? 0) > 0) {
          <section class="card sec">
            <h3>Allowed values</h3>
            <table class="grid">
              <thead><tr><th>Text</th><th>Value</th><th>Default</th><th style="width: 30px"></th></tr></thead>
              <tbody>
                @for (e of enumDraft(); track $index; let i = $index) {
                  <tr>
                    <td><input type="text" [value]="e.text" aria-label="Text" (change)="setEnum(i, { text: $any($event.target).value })" /></td>
                    <td><input type="text" [value]="e.value" aria-label="Value" (change)="setEnum(i, { value: $any($event.target).value })" /></td>
                    <td><input type="checkbox" [checked]="!!e.selectByDefault" aria-label="Selected by default" (change)="setEnum(i, { selectByDefault: $any($event.target).checked })" /></td>
                    <td><button class="btn ghost sm icon" title="Remove" (click)="removeEnum(i)"><app-icon name="close" [size]="13" /></button></td>
                  </tr>
                }
              </tbody>
            </table>
            <button class="btn sm addrow" (click)="addEnum()"><app-icon name="plus" [size]="13" /> Add value</button>
          </section>
        }

        <section class="card sec">
          <h3>Where this claim is used</h3>
          <div class="usage-groups">
            @for (g of usageGroups(); track g.title) {
              @if (g.items.length) {
                <h4>{{ g.title }}</h4>
                @for (u of g.items; track u.label) {
                  <div class="list-item" role="button" tabindex="0" (click)="u.go()" (keydown.enter)="u.go()"><app-icon name="link" [size]="13" /> {{ u.label }}</div>
                }
              }
            }
            @if (!usages().length) {
              <p class="muted small">Not referenced anywhere in this policy chain.</p>
            }
          </div>
        </section>

        @if (journeyRows().length) {
          <section class="card sec">
            <h3>In the claims bag of {{ store.activeJourneyId() }}</h3>
            <div class="flowrow">
              @for (r of journeyRows(); track r.key) {
                <button class="chip clickable {{ r.cls }}" [title]="r.title" (click)="r.go()">{{ r.order }} · {{ r.label }}</button>
              }
            </div>
          </section>
        }

        <section class="card sec">
          <h3 class="row">XML<span class="spacer"></span><button class="btn sm" (click)="showXml.set(!showXml())">{{ showXml() ? 'Hide' : 'Show' }}</button></h3>
          @if (showXml()) {
            <app-element-xml [ref]="c.ref" [label]="'Edit XML of claim ' + c.id" />
          }
        </section>
      </div>
    } @else {
      <div class="empty">Claim “{{ claimId() }}” is not defined in this policy chain.</div>
    }
  `,
  styleUrl: '../editors.scss',
  styles: `.flowrow { display: flex; flex-wrap: wrap; gap: 4px; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClaimEditor {
  protected readonly store = inject(EditorStore);
  readonly claimId = input.required<string>();
  protected readonly dataTypes = DATA_TYPES;
  protected readonly inputTypes = USER_INPUT_TYPES;
  protected readonly showXml = signal(false);

  private readonly entry = computed(() => this.store.eff()?.claimTypes.get(idKey(this.claimId())) ?? null);
  protected readonly ct = computed(() => this.entry()?.value ?? null);
  protected readonly layers = computed(() => (this.entry()?.layers ?? []).map((l) => l.ref.fileId));
  protected readonly needsEnum = computed(() => SELECTION_INPUT_TYPES.includes(this.ct()?.userInputType ?? ''));
  protected readonly predicateValidations = computed(() => [...(this.store.eff()?.predicateValidations.values() ?? [])].map((p) => p.id));
  protected readonly problems = computed(() => (this.store.diagnosticsByTarget().get(`claim:${idKey(this.claimId())}`) ?? []).filter((d) => d.severity !== 'info'));
  private readonly enumOverride = signal<{ text: string; value: string; selectByDefault?: boolean }[] | null>(null);
  protected readonly enumDraft = computed(() => this.enumOverride() ?? this.ct()?.restriction?.enumeration.map((e) => ({ text: e.text, value: e.value, selectByDefault: e.selectByDefault })) ?? []);

  protected readonly usages = computed<Usage[]>(() => {
    const e = this.store.eff();
    const id = idKey(this.claimId());
    const out: Usage[] = [];
    if (!e) return out;
    const openTp = (t: string) => () => {
      this.store.view.set('technicalProfiles');
      this.store.selection.set({ kind: 'technicalProfile', id: t });
    };
    for (const t of e.technicalProfiles.values()) {
      const v = e.tp(t.id);
      if (!v) continue;
      if (v.outputClaims.some((c) => idKey(c.claimTypeReferenceId) === id)) out.push({ kind: 'set', label: `Output of ${t.id}`, go: openTp(t.id) });
      if (v.inputClaims.some((c) => idKey(c.claimTypeReferenceId) === id)) out.push({ kind: 'read', label: `Input of ${t.id}`, go: openTp(t.id) });
      if (v.persistedClaims.some((c) => idKey(c.claimTypeReferenceId) === id)) out.push({ kind: 'persist', label: `Persisted by ${t.id}`, go: openTp(t.id) });
      if (v.displayClaims.some((c) => idKey(c.claimTypeReferenceId) === id)) out.push({ kind: 'read', label: `Shown by ${t.id}`, go: openTp(t.id) });
      for (const vt of v.validationTechnicalProfiles) if (vt.preconditions.some((p) => idKey(p.values[0]) === id)) out.push({ kind: 'check', label: `Precondition of ${vt.referenceId} in ${t.id}`, go: openTp(t.id) });
    }
    for (const c of e.claimsTransformations.values()) {
      const go = () => this.store.select({ kind: 'transformation', id: c.id });
      if (c.value.outputClaims.some((x) => idKey(x.claimTypeReferenceId) === id)) out.push({ kind: 'transform', label: `Output of transformation ${c.id}`, go });
      if (c.value.inputClaims.some((x) => idKey(x.claimTypeReferenceId) === id)) out.push({ kind: 'transform', label: `Input of transformation ${c.id}`, go });
    }
    for (const j of [...e.userJourneys.values(), ...e.subJourneys.values()]) {
      for (const st of j.value.steps) {
        if (st.preconditions.some((p) => idKey(p.values[0]) === id)) out.push({ kind: 'check', label: `Precondition of ${j.id} step ${st.orderText}`, go: () => this.store.select({ kind: 'step', journeyId: j.id, stepKey: `${j.id}#${st.orderText.trim()}` }) });
      }
    }
    if (e.relyingParty?.technicalProfile?.outputClaims.some((c) => idKey(c.claimTypeReferenceId) === id)) out.push({ kind: 'token', label: 'Relying party token claim', go: () => this.store.select({ kind: 'relyingParty' }) });
    return out;
  });

  protected readonly usageGroups = computed(() => {
    const u = this.usages();
    return [
      { title: 'Set by', items: u.filter((x) => x.kind === 'set') },
      { title: 'Read by', items: u.filter((x) => x.kind === 'read' || x.kind === 'persist') },
      { title: 'Checked by preconditions', items: u.filter((x) => x.kind === 'check') },
      { title: 'Claims transformations', items: u.filter((x) => x.kind === 'transform') },
      { title: 'Token', items: u.filter((x) => x.kind === 'token') },
    ];
  });

  protected readonly refCount = computed(() => this.usages().length);

  protected readonly journeyRows = computed(() => {
    const a = this.store.analysis();
    if (!a) return [];
    return [...a.steps.values()].map((s) => {
      const av = s.after.get(idKey(this.claimId()))?.availability ?? 'absent';
      const before = availabilityBefore(a, s.stepKey, this.claimId());
      return {
        key: s.stepKey,
        order: s.journeyId === a.journeyId ? `${s.order}` : `${s.journeyId}·${s.order}`,
        label: AVAILABILITY_LABEL[av],
        cls: AVAILABILITY_CLASS[av],
        title: `After step ${s.order}: ${AVAILABILITY_LABEL[av]} (before: ${AVAILABILITY_LABEL[before?.availability ?? 'absent']})`,
        go: () => this.store.select({ kind: 'step', journeyId: s.journeyId, stepKey: s.stepKey }),
      };
    });
  });

  protected set(name: string, value: string): void {
    const c = this.ct();
    if (c) this.store.edit(`Set ${name} of ${c.id}`, [{ fileId: c.ref.fileId, mutate: (d) => setClaimTypeField(d, c.ref, name, value || null) }]);
  }

  protected setPv(value: string): void {
    const c = this.ct();
    if (c) this.store.edit(`Set predicate validation of ${c.id}`, [{ fileId: c.ref.fileId, mutate: (d) => setPredicateValidationReference(d, c.ref, value || null) }]);
  }

  protected rename(to: string): void {
    const c = this.ct();
    if (c && this.store.renameEverywhere('claim', c.id, to)) this.store.selection.set({ kind: 'claim', id: to.trim() });
  }

  private writeEnum(items: { text: string; value: string; selectByDefault?: boolean }[]): void {
    const c = this.ct();
    if (!c) return;
    this.enumOverride.set(null);
    this.store.edit(`Edit allowed values of ${c.id}`, [{ fileId: c.ref.fileId, mutate: (d) => setEnumeration(d, c.ref, items) }]);
  }
  protected setEnum(i: number, patch: Partial<{ text: string; value: string; selectByDefault: boolean }>): void {
    const items = [...this.enumDraft()];
    items[i] = { ...items[i], ...patch };
    this.writeEnum(items);
  }
  protected addEnum(): void {
    const n = this.enumDraft().length + 1;
    this.writeEnum([...this.enumDraft(), { text: `Option ${n}`, value: `option${n}` }]);
  }
  protected removeEnum(i: number): void {
    const items = [...this.enumDraft()];
    items.splice(i, 1);
    this.writeEnum(items);
  }
}
