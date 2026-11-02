import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { TP_KINDS, TpKind } from '../../core/catalog/technical-profiles';
import { CLAIMS_TRANSFORMATIONS } from '../../core/catalog/claims-transformations';
import { addClaimsTransformation, addClaimType, addContentDefinition, addJourney, addTechnicalProfile, element } from '../../core/edit/commands';
import { idKey } from '../../core/model/types';
import { EditorStore, Selection, View } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { SelectValue } from '../../shared/select-value';
import { StepOutline } from '../outline/step-outline';
import { tpKindInfo } from '../../shared/present';

interface Item {
  id: string;
  label: string;
  sub?: string;
  icon: string;
  layer: string;
  file: string;
  sel: Selection;
  severity?: 'error' | 'warning';
  group?: string;
  active?: boolean;
}

const VIEW_TITLES: Record<View, string> = {
  journeys: 'User journeys',
  technicalProfiles: 'Technical profiles',
  claims: 'Claims schema',
  transformations: 'Claims transformations',
  contentDefinitions: 'Content definitions',
  localization: 'Localization',
  displayControls: 'Display controls',
  predicates: 'Predicates',
  relyingParty: 'Relying party',
  files: 'Files',
};

const LIBRARY_KINDS: { view: View; label: string }[] = [
  { view: 'technicalProfiles', label: 'Technical profiles' },
  { view: 'claims', label: 'Claims' },
  { view: 'transformations', label: 'Claims transformations' },
  { view: 'contentDefinitions', label: 'Pages (content definitions)' },
  { view: 'localization', label: 'Text (localization)' },
  { view: 'displayControls', label: 'Display controls' },
  { view: 'predicates', label: 'Rules (predicates)' },
];

@Component({
  selector: 'app-explorer',
  imports: [Icon, StepOutline, SelectValue],
  template: `
    <div class="panel-header">
      @if (isLibrary()) {
        <label class="visually-hidden" for="lib-kind">Library section</label>
        <select id="lib-kind" class="kind grow" [appValue]="store.view()" (change)="setKind($any($event.target).value)">
          @for (k of libraryKinds; track k.view) {
            <option [value]="k.view">{{ k.label }}</option>
          }
        </select>
      } @else {
        <strong class="grow truncate">{{ title() }}</strong>
      }
      <span class="muted small">{{ items().length }}</span>
      @if (canCreate()) {
        <button class="btn ghost sm icon" [title]="'New ' + newNoun()" (click)="creating.set(!creating()); newKind.set('')"><app-icon name="plus" [size]="15" /></button>
      }
    </div>
    @if (creating()) {
      <div class="create">
        <input #nid type="text" [placeholder]="'New ' + newNoun() + ' Id'" aria-label="Id" (keydown.enter)="create(nid.value, newKind())" />
        @if (store.view() === 'technicalProfiles') {
          <select aria-label="Kind" (change)="newKind.set($any($event.target).value)">
            @for (k of tpKinds; track k.kind) {
              <option [value]="k.kind">{{ k.label }}</option>
            }
          </select>
        }
        @if (store.view() === 'transformations') {
          <select aria-label="Method" (change)="newKind.set($any($event.target).value)">
            @for (m of methods; track m.method) {
              <option [value]="m.method">{{ m.method }}</option>
            }
          </select>
        }
        @if (store.view() === 'journeys') {
          <select aria-label="Kind" (change)="newKind.set($any($event.target).value)">
            <option value="UserJourney">User journey</option>
            <option value="Call">Sub journey (Call)</option>
            <option value="Transfer">Sub journey (Transfer)</option>
          </select>
        }
        <div class="row">
          <span class="muted small grow truncate">in {{ store.targetFile()?.fileName }}</span>
          <button class="btn sm primary" (click)="create(nid.value, newKind())">Create</button>
        </div>
      </div>
    }
    <div class="search">
      <app-icon name="search" [size]="14" />
      <input type="search" placeholder="Filter" [value]="filter()" (input)="filter.set($any($event.target).value)" aria-label="Filter" />
    </div>
    <div class="list">
      @for (g of groups(); track g.name) {
        @if (g.name) {
          <div class="group">{{ g.name }} <span class="muted">{{ g.items.length }}</span></div>
        }
        @for (it of g.items; track it.id) {
          <div class="list-item" [class.selected]="isSelected(it)" role="button" tabindex="0" [title]="it.sub ?? it.label" (click)="pick(it)" (keydown.enter)="pick(it)">
            <app-icon [name]="it.icon" [size]="14" />
            <div class="grow txt">
              <div class="truncate" [class.active]="it.active">{{ it.label }}</div>
              @if (it.sub) {
                <div class="truncate muted small">{{ it.sub }}</div>
              }
            </div>
            @if (it.severity) {
              <span class="dot {{ it.severity }}"></span>
            }
            <span class="layer" [title]="it.file">{{ it.layer }}</span>
          </div>
        }
      } @empty {
        <div class="empty small">Nothing here in this policy chain.</div>
      }
    </div>
    @if (store.view() === 'journeys' && store.activeJourney()) {
      <app-step-outline class="outline" (picked)="picked.emit()" />
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--surface); }
    .search { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--border); color: var(--text-3); }
    .search input { flex: 1; height: 26px; }
    .list { flex: 1 1 35%; overflow: auto; padding: 4px 6px 12px; min-height: 120px; }
    .outline { flex: 1 1 55%; border-top: 1px solid var(--border); min-height: 160px; }
    .group { font-family: var(--font-display); font-size: var(--text-sm); color: var(--text-3); font-weight: 500; padding: var(--space-sm) var(--space-xs) var(--space-2xs); }
    .kind { font-family: var(--font-display); font-weight: 600; font-size: var(--text-md); border-color: transparent; background: transparent; padding-left: 0; }
    .txt { line-height: 1.3; }
    .active { font-weight: 600; }
    .create { padding: 8px 10px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; background: var(--surface-2); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Explorer {
  protected readonly store = inject(EditorStore);
  /** Something was chosen from the list (used to close the list drawer on narrow screens). */
  readonly picked = output<void>();
  protected readonly filter = signal('');
  protected readonly creating = signal(false);
  protected readonly tpKinds = (['selfAsserted', 'rest', 'entraId', 'claimsTransformation', 'oidc', 'oauth2', 'saml', 'jwtIssuer', 'otp', 'phoneFactor', 'session'] as TpKind[]).map((k) => TP_KINDS[k]);
  protected readonly methods = CLAIMS_TRANSFORMATIONS;
  protected readonly newKind = signal('');

  protected readonly title = computed(() => VIEW_TITLES[this.store.view()]);
  protected readonly libraryKinds = LIBRARY_KINDS;
  protected readonly isLibrary = computed(() => LIBRARY_KINDS.some((k) => k.view === this.store.view()));

  protected setKind(v: View): void {
    this.store.view.set(v);
    this.store.selection.set(null);
    this.filter.set('');
    this.creating.set(false);
  }
  protected readonly canCreate = computed(() => ['journeys', 'technicalProfiles', 'claims', 'transformations', 'contentDefinitions'].includes(this.store.view()) && !!this.store.targetFile());
  protected readonly newNoun = computed(
    () => ({ journeys: 'journey', technicalProfiles: 'technical profile', claims: 'claim', transformations: 'claims transformation', contentDefinitions: 'content definition' })[this.store.view() as 'claims'] ?? 'item',
  );

  private sev(kind: string, id: string): 'error' | 'warning' | undefined {
    const list = this.store.diagnosticsByTarget().get(`${kind}:${idKey(id)}`) ?? [];
    if (list.some((d) => d.severity === 'error')) return 'error';
    if (list.some((d) => d.severity === 'warning')) return 'warning';
    return undefined;
  }

  protected readonly items = computed<Item[]>(() => {
    const e = this.store.eff();
    if (!e) return [];
    const L = (f: string) => this.store.layerOf(f);
    const F = (f: string) => this.store.fileName(f);
    switch (this.store.view()) {
      case 'journeys': {
        const def = idKey(e.relyingParty?.defaultUserJourney?.referenceId);
        const steps = this.store.diagnosticsByStep();
        const jsev = (id: string) => {
          let s = this.sev('journey', id);
          for (const [k, list] of steps) if (idKey(k.split('#')[0]) === idKey(id)) for (const d of list) if (d.severity === 'error') s = 'error'; else if (d.severity === 'warning' && !s) s = 'warning';
          return s;
        };
        return [
          ...[...e.userJourneys.values()].map((j) => ({ id: j.id, label: j.id, sub: `${j.value.steps.length} steps${idKey(j.id) === def ? ', relying party default' : ''}`, icon: 'journey', layer: L(j.value.ref.fileId), file: F(j.value.ref.fileId), sel: { kind: 'journey', id: j.id } as Selection, group: 'User journeys', severity: jsev(j.id), active: idKey(j.id) === idKey(this.store.activeJourneyId()) })),
          ...[...e.subJourneys.values()].map((j) => ({ id: 'sub:' + j.id, label: j.id, sub: `${j.value.subJourneyType ?? '?'}, ${j.value.steps.length} steps`, icon: 'subjourney', layer: L(j.value.ref.fileId), file: F(j.value.ref.fileId), sel: { kind: 'journey', id: j.id } as Selection, group: 'Sub journeys', severity: jsev(j.id), active: idKey(j.id) === idKey(this.store.activeJourneyId()) })),
        ];
      }
      case 'technicalProfiles':
        return [...e.technicalProfiles.values()].map((t) => {
          const f = e.tp(t.id);
          const k = tpKindInfo(f?.kind);
          return { id: t.id, label: t.id, sub: f?.displayName && f.displayName !== t.id ? f.displayName : undefined, icon: k.icon, layer: t.layers.map((l) => L(l.ref.fileId)).join('+'), file: t.layers.map((l) => F(l.ref.fileId)).join(', '), sel: { kind: 'technicalProfile', id: t.id } as Selection, group: k.label, severity: this.sev('technicalProfile', t.id) };
        });
      case 'claims':
        return [...e.claimTypes.values()].map((c) => ({ id: c.id, label: c.id, sub: [c.value.displayName, c.value.dataType].filter(Boolean).join(', '), icon: 'claim', layer: L(c.value.ref.fileId), file: F(c.value.ref.fileId), sel: { kind: 'claim', id: c.id } as Selection, severity: this.sev('claim', c.id) }));
      case 'transformations':
        return [...e.claimsTransformations.values()].map((c) => ({ id: c.id, label: c.id, sub: c.value.method, icon: 'transform', layer: L(c.value.ref.fileId), file: F(c.value.ref.fileId), sel: { kind: 'transformation', id: c.id } as Selection, severity: this.sev('transformation', c.id) }));
      case 'contentDefinitions':
        return [...e.contentDefinitions.values()].map((c) => ({ id: c.id, label: c.id, sub: c.value.dataUri?.replace('urn:com:microsoft:aad:b2c:elements:contract:', ''), icon: 'page', layer: L(c.value.ref.fileId), file: F(c.value.ref.fileId), sel: { kind: 'contentDefinition', id: c.id } as Selection, severity: this.sev('contentDefinition', c.id) }));
      case 'localization':
        return [...e.localizedResources.values()].map((c) => ({ id: c.id, label: c.id, sub: `${c.value.strings.length} strings`, icon: 'globe', layer: L(c.value.ref.fileId), file: F(c.value.ref.fileId), sel: { kind: 'localization', id: c.id } as Selection }));
      case 'displayControls':
        return [...e.displayControls.values()].map((c) => ({ id: c.id, label: c.id, sub: c.value.userInterfaceControlType, icon: 'control', layer: L(c.value.ref.fileId), file: F(c.value.ref.fileId), sel: { kind: 'displayControl', id: c.id } as Selection }));
      case 'predicates':
        return [
          ...[...e.predicates.values()].map((c) => ({ id: c.id, label: c.id, sub: c.value.method, icon: 'rule', layer: L(c.value.ref.fileId), file: F(c.value.ref.fileId), sel: { kind: 'predicate', id: c.id } as Selection, group: 'Predicates' })),
          ...[...e.predicateValidations.values()].map((c) => ({ id: 'pv:' + c.id, label: c.id, sub: `${c.value.groups.length} groups`, icon: 'rule', layer: L(c.value.ref.fileId), file: F(c.value.ref.fileId), sel: { kind: 'predicate', id: c.id } as Selection, group: 'Predicate validations' })),
        ];
      case 'relyingParty':
        return this.store.relyingPartyChains().map((c) => ({ id: c.leaf.fileId, label: c.leaf.policyId ?? c.leaf.fileName, sub: `${c.leaf.relyingParty?.defaultUserJourney?.referenceId ?? ''}, ${c.leaf.fileName}`, icon: 'app', layer: 'RP', file: c.leaf.fileName, sel: { kind: 'relyingParty' } as Selection, active: c.leaf.fileId === this.store.activeChain()?.leaf.fileId }));
      case 'files':
        return this.store.parsed().map((f) => ({ id: f.id, label: f.name, sub: f.doc?.policyId ?? f.error?.message, icon: 'file', layer: this.store.layerOf(f.id) || 'none', file: f.name, sel: { kind: 'file', id: f.id } as Selection, severity: f.error ? 'error' : undefined }));
    }
  });

  protected readonly groups = computed(() => {
    const f = this.filter().toLowerCase();
    const list = this.items().filter((i) => !f || i.label.toLowerCase().includes(f) || (i.sub ?? '').toLowerCase().includes(f));
    const names = [...new Set(list.map((i) => i.group ?? ''))];
    const view = this.store.view();
    if (view !== 'journeys' && view !== 'predicates') names.sort();
    return names.map((name) => ({ name, items: list.filter((i) => (i.group ?? '') === name).sort((a, b) => (view === 'journeys' ? 0 : a.label.localeCompare(b.label))) }));
  });

  protected isSelected(it: Item): boolean {
    const s = this.store.selection();
    if (this.store.view() === 'journeys' && it.sel?.kind === 'journey') return !!it.active;
    if (!s || !it.sel) return false;
    if (s.kind === 'relyingParty' && it.sel.kind === 'relyingParty') return !!it.active;
    if (this.store.view() === 'journeys' && it.sel.kind === 'journey') return !!it.active;
    if (s.kind === 'step' && it.sel.kind === 'journey') return idKey(s.journeyId) === idKey(it.sel.id);
    return s.kind === it.sel.kind && 'id' in s && 'id' in it.sel && idKey(s.id) === idKey(it.sel.id);
  }

  protected pick(it: Item): void {
    this.picked.emit();
    const v = this.store.view();
    if (v === 'journeys' && it.sel?.kind === 'journey') {
      this.store.openJourney(it.sel.id);
      return;
    }
    if (v === 'relyingParty') this.store.activeLeafId.set(it.id);
    if (v === 'files') {
      this.store.xmlFileId.set(it.id);
    }
    this.store.mainMode.set(v === 'files' ? this.store.mainMode() : 'visual');
    this.store.selection.set(it.sel);
  }

  protected create(rawId: string, kind?: string): void {
    const id = rawId.trim();
    const t = this.store.targetFile();
    if (!id || !t) return;
    const e = this.store.eff();
    const v = this.store.view();
    const exists =
      (v === 'claims' && e?.claimTypes.has(idKey(id))) ||
      (v === 'technicalProfiles' && e?.technicalProfiles.has(idKey(id))) ||
      (v === 'transformations' && e?.claimsTransformations.has(idKey(id))) ||
      (v === 'contentDefinitions' && e?.contentDefinitions.has(idKey(id))) ||
      (v === 'journeys' && (e?.userJourneys.has(idKey(id)) || e?.subJourneys.has(idKey(id))));
    if (exists) {
      this.store.toast({ kind: 'error', title: 'Already defined', lines: [`"${id}" already exists in this policy chain.`] });
      return;
    }
    let ok = false;
    switch (v) {
      case 'claims':
        ok = this.store.edit(`Add claim ${id}`, [{ fileId: t.fileId, mutate: (d) => addClaimType(d, id) }]);
        if (ok) this.store.selection.set({ kind: 'claim', id });
        break;
      case 'technicalProfiles': {
        const k = TP_KINDS[(kind || 'selfAsserted') as TpKind];
        const tp = element('TechnicalProfile', { Id: id }, element('DisplayName', {}, id), element('Protocol', { Name: k.protocol?.name ?? 'None', Handler: k.protocol?.handler }));
        if (k.outputTokenFormat) tp.children.push(element('OutputTokenFormat', {}, k.outputTokenFormat));
        const md = element('Metadata');
        for (const m of k.metadata.filter((x) => x.required)) md.children.push(element('Item', { Key: m.key }, m.values?.[0] ?? ''));
        if (md.children.length) tp.children.push(md);
        for (const c of tp.children) if (c.kind === 'element') c.parent = tp;
        for (const c of md.children) if (c.kind === 'element') c.parent = md;
        md.selfClosing = md.children.length === 0;
        tp.selfClosing = false;
        ok = this.store.edit(`Add technical profile ${id}`, [{ fileId: t.fileId, mutate: (d) => addTechnicalProfile(d, k.label, tp) }]);
        if (ok) this.store.selection.set({ kind: 'technicalProfile', id });
        break;
      }
      case 'transformations': {
        const m = CLAIMS_TRANSFORMATIONS.find((x) => x.method === kind) ?? CLAIMS_TRANSFORMATIONS[0];
        ok = this.store.edit(`Add claims transformation ${id}`, [
          { fileId: t.fileId, mutate: (d) => addClaimsTransformation(d, id, m.method, m.inputs.filter((i) => !i.optional).map((i) => ({ claim: '', tct: i.tct })), m.params.filter((p) => !p.optional).map((p) => ({ id: p.id, dataType: p.dataType, value: p.values?.[0] ?? '' })), m.outputs.map((o) => ({ claim: '', tct: o.tct }))) },
        ]);
        if (ok) this.store.selection.set({ kind: 'transformation', id });
        break;
      }
      case 'contentDefinitions':
        ok = this.store.edit(`Add content definition ${id}`, [{ fileId: t.fileId, mutate: (d) => addContentDefinition(d, id, 'urn:com:microsoft:aad:b2c:elements:contract:selfasserted:2.1.30', '~/tenant/templates/AzureBlue/selfAsserted.cshtml') }]);
        if (ok) this.store.selection.set({ kind: 'contentDefinition', id });
        break;
      case 'journeys':
        ok = this.store.edit(`Add ${kind === 'UserJourney' || !kind ? 'user journey' : 'sub journey'} ${id}`, [{ fileId: t.fileId, mutate: (d) => addJourney(d, kind === 'UserJourney' || !kind ? 'UserJourney' : 'SubJourney', id, kind === 'Transfer' ? 'Transfer' : 'Call') }]);
        if (ok) this.store.openJourney(id);
        break;
    }
    if (ok) this.creating.set(false);
  }
}
