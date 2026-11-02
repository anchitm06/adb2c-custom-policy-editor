import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { replaceTenantText } from '../../core/edit/commands';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { downloadText } from '../../shared/present';
import { exportZip, readPolicyFiles } from './file-io';
import { SelectValue } from '../../shared/select-value';

@Component({
  selector: 'app-files-view',
  imports: [SelectValue, Icon],
  template: `
    <header class="ed-head">
      <app-icon name="files" [size]="22" />
      <div class="grow">
        <h2>{{ store.workspaceName() }}</h2>
        <div class="muted small">{{ store.files().length }} files · saved in this browser</div>
      </div>
      <label class="btn">
        <input type="file" multiple accept=".xml,.zip" hidden (change)="add($event)" />
        <app-icon name="upload" [size]="14" /> Add files
      </label>
      <button class="btn primary" (click)="zip()"><app-icon name="download" [size]="14" /> Download all (.zip)</button>
    </header>
    <div class="ed-body">
      <section class="card sec">
        <h3>Policy files</h3>
        <table class="grid">
          <thead><tr><th>File</th><th>Layer</th><th>PolicyId</th><th>Base policy</th><th>Status</th><th style="width: 120px"></th></tr></thead>
          <tbody>
            @for (f of rows(); track f.id) {
              <tr [class.selected]="f.id === selectedId()">
                <td><input type="text" [value]="f.name" aria-label="File name" (change)="store.renameFile(f.id, $any($event.target).value)" /></td>
                <td><span class="layer">{{ f.layer || '—' }}</span></td>
                <td class="mono small">{{ f.policyId }}</td>
                <td class="mono small">{{ f.base }}</td>
                <td>
                  @if (f.error) {
                    <span class="chip error" [title]="f.error">XML error</span>
                  } @else if (f.errors) {
                    <span class="chip error">{{ f.errors }} errors</span>
                  } @else if (f.warnings) {
                    <span class="chip warning">{{ f.warnings }} warnings</span>
                  } @else {
                    <span class="chip ok">OK</span>
                  }
                </td>
                <td>
                  <button class="btn ghost sm icon" title="Open XML" (click)="xml(f.id)"><app-icon name="xml" [size]="14" /></button>
                  <button class="btn ghost sm icon" title="Download" (click)="download(f.id)"><app-icon name="download" [size]="14" /></button>
                  <button class="btn ghost sm icon danger" title="Remove from workspace" (click)="store.removeFile(f.id)"><app-icon name="trash" [size]="14" /></button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section class="card sec">
        <h3>Where new elements and overrides go</h3>
        <p class="muted small">Microsoft recommends leaving the base file unchanged and putting changes in the extensions or relying party file. New claims, technical profiles and overrides are written here.</p>
        <select [appValue]="store.targetFile()?.fileId ?? ''" (change)="store.targetFileIdPref.set($any($event.target).value)" aria-label="Target file">
          @for (d of store.activeChain()?.docs ?? []; track d.fileId) {
            <option [value]="d.fileId">{{ store.layerOf(d.fileId) }} — {{ d.fileName }}</option>
          }
        </select>
      </section>

      <section class="card sec">
        <h3>Set tenant</h3>
        <p class="muted small">Replace the starter pack placeholders in every file.</p>
        <div class="grid2">
          <div class="field"><label for="t-name">Tenant</label><input id="t-name" type="text" placeholder="contoso.onmicrosoft.com" [value]="tenant()" (input)="tenant.set($any($event.target).value)" /></div>
          <div class="field"><label for="t-ief">IdentityExperienceFramework app ID</label><input id="t-ief" type="text" class="mono" [value]="ief()" (input)="ief.set($any($event.target).value)" /></div>
          <div class="field"><label for="t-proxy">ProxyIdentityExperienceFramework app ID</label><input id="t-proxy" type="text" class="mono" [value]="proxy()" (input)="proxy.set($any($event.target).value)" /></div>
        </div>
        <button class="btn primary" [disabled]="!tenant()" (click)="setTenant()">Replace in all files</button>
      </section>
    </div>
  `,
  styleUrl: '../editors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilesView {
  protected readonly store = inject(EditorStore);
  protected readonly tenant = signal('');
  protected readonly ief = signal('');
  protected readonly proxy = signal('');
  protected readonly selectedId = computed(() => {
    const s = this.store.selection();
    return s?.kind === 'file' ? s.id : null;
  });
  protected readonly rows = computed(() => {
    const diags = this.store.diagnostics();
    return this.store.parsed().map((f) => ({
      id: f.id,
      name: f.name,
      layer: this.store.layerOf(f.id),
      policyId: f.doc?.policyId,
      base: f.doc?.basePolicy?.policyId,
      error: f.error?.message,
      errors: diags.filter((d) => d.fileId === f.id && d.severity === 'error').length,
      warnings: diags.filter((d) => d.fileId === f.id && d.severity === 'warning').length,
    }));
  });

  protected xml(id: string): void {
    this.store.xmlFileId.set(id);
    this.store.mainMode.set('xml');
  }
  protected download(id: string): void {
    const f = this.store.files().find((x) => x.id === id);
    if (f) downloadText(f.name, f.text);
  }
  protected zip(): void {
    void exportZip(this.store.workspaceName(), this.store.files());
  }
  protected async add(e: Event): Promise<void> {
    const list = (e.target as HTMLInputElement).files;
    if (!list?.length) return;
    const files = await readPolicyFiles(list);
    if (files.length) this.store.openFiles(files, undefined, false);
  }
  protected setTenant(): void {
    const t = this.tenant().trim();
    const files = this.store.files();
    this.store.edit(
      `Set tenant ${t}`,
      files.map((f) => ({
        fileId: f.id,
        mutate: (d) => {
          // Text-level replacement, applied to attribute values and text nodes.
          const walk = (el: typeof d.root) => {
            el.attrs = el.attrs.map((a) => {
              const v = replaceTenantText(a.value, t, this.ief() || undefined, this.proxy() || undefined);
              if (v !== a.value) el.rawAttrText = null;
              return { ...a, value: v };
            });
            for (const c of el.children) {
              if (c.kind === 'element') walk(c);
              else if (c.kind === 'text') {
                const v = replaceTenantText(c.value, t, this.ief() || undefined, this.proxy() || undefined);
                if (v !== c.value) {
                  c.value = v;
                  c.raw = null;
                }
              }
            }
          };
          walk(d.root);
        },
      })),
    );
  }
}
