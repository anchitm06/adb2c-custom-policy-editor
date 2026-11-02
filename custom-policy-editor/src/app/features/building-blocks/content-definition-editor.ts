import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DATA_URI_CONTRACTS } from '../../core/catalog/claims-transformations';
import { ORDER, removeAt, setFieldText, setMetadataItem } from '../../core/edit/commands';
import { idKey } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { ElementXml } from '../xml-editor/element-xml';
import { AlertItem } from '../../shared/alert-item';

@Component({
  selector: 'app-content-definition-editor',
  imports: [AlertItem, Icon, ElementXml],
  template: `
    @if (cd(); as c) {
      <header class="ed-head">
        <app-icon name="page" [size]="22" />
        <div class="grow">
          <h2 class="mono">{{ c.id }}</h2>
          <div class="muted small">{{ contract()?.label ?? 'Content definition' }} · {{ store.layerOf(c.ref.fileId) }} · {{ store.fileName(c.ref.fileId) }}</div>
        </div>
      </header>
      <div class="ed-body">
        @for (d of problems(); track d.key) {
          <app-alert-item [severity]="d.severity" [message]="d.message" [code]="d.code" [quickFix]="d.fix" />
        }
        <section class="card sec">
          <h3>Page</h3>
          <div class="field">
            <label for="cd-load">LoadUri (HTML template)</label>
            <input id="cd-load" type="text" class="mono" [value]="c.loadUri ?? ''" (change)="set('LoadUri', $any($event.target).value)" />
            <span class="hint">Use a ~/tenant/templates/… built-in template or the HTTPS URL of your own page.</span>
          </div>
          <div class="field">
            <label for="cd-rec">RecoveryUri</label>
            <input id="cd-rec" type="text" class="mono" [value]="c.recoveryUri ?? ''" (change)="set('RecoveryUri', $any($event.target).value)" />
          </div>
          <div class="field">
            <label for="cd-data">DataUri (page contract and version)</label>
            <input id="cd-data" type="text" class="mono" list="cd-uris" [value]="c.dataUri ?? ''" (change)="set('DataUri', $any($event.target).value)" />
            <datalist id="cd-uris">
              @for (u of uris; track u) {
                <option [value]="u"></option>
              }
            </datalist>
          </div>
        </section>
        <section class="card sec">
          <h3>Metadata</h3>
          <table class="grid">
            <thead><tr><th>Key</th><th>Value</th><th style="width: 30px"></th></tr></thead>
            <tbody>
              @for (m of c.metadata; track m.key) {
                <tr>
                  <td class="mono">{{ m.key }}</td>
                  <td><input type="text" [value]="m.value" [attr.aria-label]="m.key" (change)="setMeta(m.key, $any($event.target).value)" /></td>
                  <td><button class="btn ghost sm icon" title="Remove" (click)="remove(m.ref)"><app-icon name="close" [size]="13" /></button></td>
                </tr>
              }
              <tr class="add">
                <td><input #nk type="text" placeholder="Add key…" aria-label="New key" /></td>
                <td><input #nv type="text" placeholder="value" aria-label="New value" /></td>
                <td><button class="btn sm" (click)="setMeta(nk.value, nv.value); nk.value = ''; nv.value = ''">Add</button></td>
              </tr>
            </tbody>
          </table>
        </section>
        @if (c.localizedResourcesReferences.length) {
          <section class="card sec">
            <h3>Localized resources</h3>
            @for (r of c.localizedResourcesReferences; track r.language) {
              <div class="list-item" role="button" tabindex="0" (click)="store.select({ kind: 'localization', id: r.localizedResourcesReferenceId })" (keydown.enter)="store.select({ kind: 'localization', id: r.localizedResourcesReferenceId })">
                <span class="chip outline">{{ r.language }}</span> <span class="mono">{{ r.localizedResourcesReferenceId }}</span>
              </div>
            }
          </section>
        }
        <section class="card sec">
          <h3>Used by</h3>
          @for (u of usages(); track u.label) {
            <div class="list-item" role="button" tabindex="0" (click)="u.go()" (keydown.enter)="u.go()"><app-icon name="link" [size]="13" /> {{ u.label }}</div>
          } @empty {
            <p class="muted small">Not used by any step or self-asserted page in this chain.</p>
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
      <div class="empty">Content definition “{{ cdId() }}” is not defined in this policy chain.</div>
    }
  `,
  styleUrl: '../editors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentDefinitionEditor {
  protected readonly store = inject(EditorStore);
  readonly cdId = input.required<string>();
  protected readonly showXml = signal(false);
  protected readonly uris = DATA_URI_CONTRACTS.flatMap((c) => c.versions.map((v) => `urn:com:microsoft:aad:b2c:elements:contract:${c.id}:${v}`));
  protected readonly cd = computed(() => this.store.eff()?.contentDefinitions.get(idKey(this.cdId()))?.value ?? null);
  protected readonly contract = computed(() => {
    const m = /contract:([a-z]+):/i.exec(this.cd()?.dataUri ?? '');
    return m ? DATA_URI_CONTRACTS.find((c) => c.id === m[1].toLowerCase()) : undefined;
  });
  protected readonly problems = computed(() => this.store.diagnosticsByTarget().get(`contentDefinition:${idKey(this.cdId())}`) ?? []);
  protected readonly usages = computed(() => {
    const e = this.store.eff();
    const id = idKey(this.cdId());
    const out: { label: string; go: () => void }[] = [];
    if (!e) return out;
    for (const j of e.userJourneys.values())
      for (const s of j.value.steps)
        if (idKey(s.contentDefinitionReferenceId) === id) out.push({ label: `${j.id} step ${s.orderText}`, go: () => this.store.select({ kind: 'step', journeyId: j.id, stepKey: `${j.id}#${s.orderText.trim()}` }) });
    for (const t of e.technicalProfiles.values()) {
      const v = e.tp(t.id);
      if (v?.metadata.some((m) => m.key === 'ContentDefinitionReferenceId' && idKey(m.value) === id))
        out.push({ label: `Technical profile ${t.id}`, go: () => (this.store.view.set('technicalProfiles'), this.store.selection.set({ kind: 'technicalProfile', id: t.id })) });
    }
    return out;
  });

  protected set(name: string, value: string): void {
    const c = this.cd();
    if (c) this.store.edit(`Set ${name} of ${c.id}`, [{ fileId: c.ref.fileId, mutate: (d) => setFieldText(d, c.ref, name, value || null, ORDER.ContentDefinition) }]);
  }
  protected setMeta(key: string, value: string): void {
    const c = this.cd();
    if (c && key.trim()) this.store.edit(`Set metadata ${key}`, [{ fileId: c.ref.fileId, mutate: (d) => setMetadataItem(d, c.ref, key.trim(), value, ORDER.ContentDefinition) }]);
  }
  protected remove(ref: { fileId: string; path: readonly number[]; line: number }): void {
    this.store.edit('Remove metadata', [{ fileId: ref.fileId, mutate: (d) => removeAt(d, ref) }]);
  }
}
