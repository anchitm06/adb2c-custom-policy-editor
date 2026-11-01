import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CLAIMS_TRANSFORMATIONS, findTransformationMethod } from '../../core/catalog/claims-transformations';
import { removeAt, setAttribute, setInputParameter, setTransformationClaim } from '../../core/edit/commands';
import { idKey } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';
import { ClaimPicker } from '../../shared/claim-picker';
import { Icon } from '../../shared/icon';
import { ElementXml } from '../xml-editor/element-xml';
import { SelectValue } from '../../shared/select-value';

@Component({
  selector: 'app-transformation-editor',
  imports: [SelectValue, Icon, ClaimPicker, ElementXml],
  template: `
    @if (ct(); as c) {
      <header class="ed-head">
        <app-icon name="transform" [size]="22" />
        <div class="grow">
          <h2 class="mono">{{ c.id }}</h2>
          <div class="muted small">{{ c.method }} · {{ store.layerOf(c.ref.fileId) }} · {{ store.fileName(c.ref.fileId) }}</div>
        </div>
      </header>
      <div class="ed-body">
        @for (d of problems(); track d.key) {
          <div class="banner {{ d.severity === 'info' ? '' : d.severity }} small"><app-icon [name]="d.severity" [size]="14" /> {{ d.message }}</div>
        }
        <section class="card sec">
          <div class="grid2">
            <div class="field">
              <label for="ct-id">Id</label>
              <div class="row">
                <input id="ct-id" class="grow mono" type="text" [value]="c.id" #rid />
                <button class="btn sm" [disabled]="rid.value === c.id" (click)="rename(rid.value)">Rename everywhere</button>
              </div>
            </div>
            <div class="field">
              <label for="ct-m">Transformation method</label>
              <select id="ct-m" [appValue]="c.method ?? ''" (change)="setMethod($any($event.target).value)">
                @if (!method()) {
                  <option [value]="c.method ?? ''">{{ c.method || '(choose)' }}</option>
                }
                @for (g of groups; track g.name) {
                  <optgroup [label]="g.name">
                    @for (m of g.items; track m.method) {
                      <option [value]="m.method">{{ m.method }}</option>
                    }
                  </optgroup>
                }
              </select>
            </div>
          </div>
          @if (method(); as m) {
            <p class="small">{{ m.description }} <a [href]="m.docs" target="_blank" rel="noopener">Reference</a></p>
          }
        </section>

        <section class="card sec">
          <h3>Input claims</h3>
          @for (slot of inputSlots(); track slot.tct) {
            <div class="slot">
              <span class="tct mono">{{ slot.tct }}</span>
              <span class="muted small">{{ slot.dataType }}{{ slot.optional ? ' · optional' : '' }}</span>
              <app-claim-picker class="grow" [value]="slot.claim ?? ''" placeholder="(not set)" (changed)="setClaim('InputClaims', slot.tct, $event)" />
              @if (slot.claim && slot.ref) {
                <button class="btn ghost sm icon" title="Remove" (click)="remove(slot.ref)"><app-icon name="close" [size]="13" /></button>
              }
            </div>
          } @empty {
            <p class="muted small">This method takes no input claims.</p>
          }
        </section>

        <section class="card sec">
          <h3>Input parameters</h3>
          @for (p of paramSlots(); track p.id) {
            <div class="slot">
              <span class="tct mono">{{ p.id }}</span>
              <span class="muted small">{{ p.dataType }}{{ p.optional ? ' · optional' : '' }}</span>
              @if (p.values?.length) {
                <select class="grow" [appValue]="p.value ?? ''" [attr.aria-label]="p.id" (change)="setParam(p.id, p.dataType, $any($event.target).value)">
                  <option value="">(not set)</option>
                  @for (v of p.values; track v) {
                    <option [value]="v">{{ v }}</option>
                  }
                </select>
              } @else {
                <input class="grow" type="text" [value]="p.value ?? ''" [attr.aria-label]="p.id" placeholder="(not set)" (change)="setParam(p.id, p.dataType, $any($event.target).value)" />
              }
            </div>
          } @empty {
            <p class="muted small">No parameters.</p>
          }
        </section>

        <section class="card sec">
          <h3>Output claims</h3>
          @for (slot of outputSlots(); track slot.tct) {
            <div class="slot">
              <span class="tct mono">{{ slot.tct }}</span>
              <span class="muted small">{{ slot.dataType }}</span>
              <app-claim-picker class="grow" [value]="slot.claim ?? ''" placeholder="(not set)" (changed)="setClaim('OutputClaims', slot.tct, $event)" />
              @if (slot.claim && slot.ref) {
                <button class="btn ghost sm icon" title="Remove" (click)="remove(slot.ref)"><app-icon name="close" [size]="13" /></button>
              }
            </div>
          } @empty {
            <p class="muted small">{{ method()?.assertion ? 'Assertion: raises an error instead of producing claims.' : 'No output claims.' }}</p>
          }
        </section>

        <section class="card sec">
          <h3>Used by</h3>
          @for (u of usages(); track u) {
            <div class="list-item" role="button" tabindex="0" (click)="openTp(u)" (keydown.enter)="openTp(u)"><app-icon name="tp" [size]="13" /> {{ u }}</div>
          } @empty {
            <p class="muted small">No technical profile runs this transformation.</p>
          }
        </section>

        <section class="card sec">
          <h3 class="row">XML<span class="spacer"></span><button class="btn sm" (click)="showXml.set(!showXml())">{{ showXml() ? 'Hide' : 'Show' }}</button></h3>
          @if (showXml()) {
            <app-element-xml [ref]="c.ref" [label]="'Edit XML of ' + c.id" />
          }
        </section>
      </div>
    } @else {
      <div class="empty">Claims transformation “{{ ctId() }}” is not defined in this policy chain.</div>
    }
  `,
  styleUrl: '../editors.scss',
  styles: `
    .slot { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--border); }
    .tct { min-width: 160px; font-weight: 600; }
    .slot .muted { min-width: 110px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransformationEditor {
  protected readonly store = inject(EditorStore);
  readonly ctId = input.required<string>();
  protected readonly showXml = signal(false);
  protected readonly groups = [...new Set(CLAIMS_TRANSFORMATIONS.map((m) => m.group))].map((g) => ({ name: g, items: CLAIMS_TRANSFORMATIONS.filter((m) => m.group === g) }));

  protected readonly ct = computed(() => this.store.eff()?.claimsTransformations.get(idKey(this.ctId()))?.value ?? null);
  protected readonly method = computed(() => findTransformationMethod(this.ct()?.method));
  protected readonly problems = computed(() => this.store.diagnosticsByTarget().get(`transformation:${idKey(this.ctId())}`) ?? []);

  private slots(kind: 'inputs' | 'outputs') {
    const c = this.ct();
    const m = this.method();
    const items = kind === 'inputs' ? (c?.inputClaims ?? []) : (c?.outputClaims ?? []);
    const spec = m ? m[kind] : [];
    const out = spec.map((s) => {
      const it = items.find((i) => (i.transformationClaimType ?? '').toLowerCase() === s.tct.toLowerCase());
      return { tct: s.tct, dataType: s.dataType, optional: s.optional, claim: it?.claimTypeReferenceId, ref: it?.ref };
    });
    for (const it of items) {
      if (!out.some((o) => o.tct.toLowerCase() === (it.transformationClaimType ?? '').toLowerCase()))
        out.push({ tct: it.transformationClaimType ?? '(none)', dataType: undefined, optional: true, claim: it.claimTypeReferenceId, ref: it.ref });
    }
    return out;
  }
  protected readonly inputSlots = computed(() => this.slots('inputs'));
  protected readonly outputSlots = computed(() => this.slots('outputs'));
  protected readonly paramSlots = computed(() => {
    const c = this.ct();
    const m = this.method();
    const out: { id: string; dataType: string; optional?: boolean; values?: string[]; value?: string }[] = (m?.params ?? []).map((p) => ({
      ...p,
      value: c?.inputParameters.find((x) => x.id.toLowerCase() === p.id.toLowerCase())?.value,
    }));
    for (const p of c?.inputParameters ?? []) if (!out.some((o) => o.id.toLowerCase() === p.id.toLowerCase())) out.push({ id: p.id, dataType: p.dataType ?? 'string', value: p.value, optional: true });
    return out;
  });

  protected readonly usages = computed(() => {
    const e = this.store.eff();
    const id = idKey(this.ctId());
    if (!e) return [];
    return [...e.technicalProfiles.values()]
      .filter((t) => [...t.value.inputClaimsTransformations, ...t.value.outputClaimsTransformations].some((x) => idKey(x.referenceId) === id))
      .map((t) => t.id);
  });

  protected setMethod(m: string): void {
    const c = this.ct();
    if (c) this.store.edit(`Set method of ${c.id}`, [{ fileId: c.ref.fileId, mutate: (d) => setAttribute(d, c.ref, 'TransformationMethod', m) }]);
  }
  protected setClaim(col: 'InputClaims' | 'OutputClaims', tct: string, claim: string): void {
    const c = this.ct();
    if (c) this.store.edit(`Set ${tct} of ${c.id}`, [{ fileId: c.ref.fileId, mutate: (d) => setTransformationClaim(d, c.ref, col, tct, claim) }]);
  }
  protected setParam(id: string, dataType: string, value: string): void {
    const c = this.ct();
    if (c) this.store.edit(`Set parameter ${id} of ${c.id}`, [{ fileId: c.ref.fileId, mutate: (d) => setInputParameter(d, c.ref, id, dataType, value === '' ? null : value) }]);
  }
  protected remove(ref: { fileId: string; path: readonly number[]; line: number }): void {
    this.store.edit('Remove claim from transformation', [{ fileId: ref.fileId, mutate: (d) => removeAt(d, ref) }]);
  }
  protected rename(to: string): void {
    const c = this.ct();
    if (c && this.store.renameEverywhere('transformation', c.id, to)) this.store.selection.set({ kind: 'transformation', id: to.trim() });
  }
  protected openTp(id: string): void {
    this.store.view.set('technicalProfiles');
    this.store.selection.set({ kind: 'technicalProfile', id });
  }
}
