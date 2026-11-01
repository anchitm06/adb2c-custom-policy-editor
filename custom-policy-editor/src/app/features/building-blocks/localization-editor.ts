import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { setElementText } from '../../core/edit/commands';
import { idKey } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { ElementXml } from '../xml-editor/element-xml';

@Component({
  selector: 'app-localization-editor',
  imports: [Icon, ElementXml],
  template: `
    @if (res(); as r) {
      <header class="ed-head">
        <app-icon name="globe" [size]="22" />
        <div class="grow">
          <h2 class="mono">{{ r.id }}</h2>
          <div class="muted small">{{ r.strings.length }} strings · languages: {{ languages().join(', ') || 'none declared' }}{{ defaultLanguage() ? ' (default ' + defaultLanguage() + ')' : '' }}</div>
        </div>
      </header>
      <div class="ed-body">
        <section class="card sec">
          <div class="row" style="margin-bottom: 8px">
            <h3 class="grow">Localized strings</h3>
            <input type="search" placeholder="Filter" [value]="filter()" (input)="filter.set($any($event.target).value)" aria-label="Filter strings" />
          </div>
          <table class="grid">
            <thead><tr><th>Element type</th><th>Element id</th><th>String id</th><th style="width: 45%">Text</th><th>File</th></tr></thead>
            <tbody>
              @for (s of strings(); track $index) {
                <tr>
                  <td class="small">{{ s.elementType }}</td>
                  <td class="mono small">{{ s.elementId }}</td>
                  <td class="mono small">{{ s.stringId }}</td>
                  <td><input type="text" [value]="s.value" [attr.aria-label]="s.stringId ?? 'text'" (change)="setText(s.ref, $any($event.target).value)" /></td>
                  <td><span class="layer">{{ store.layerOf(s.ref.fileId) }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </section>
        @if (r.collections.length) {
          <section class="card sec">
            <h3>Localized collections</h3>
            @for (c of r.collections; track $index) {
              <div class="li"><span class="mono">{{ c.elementId }}</span> · {{ c.targetCollection }} · {{ c.items.length }} items: {{ itemsText(c.items) }}</div>
            }
          </section>
        }
        <section class="card sec">
          <h3 class="row">XML<span class="spacer"></span><button class="btn sm" (click)="showXml.set(!showXml())">{{ showXml() ? 'Hide' : 'Show' }}</button></h3>
          @if (showXml()) {
            <app-element-xml [ref]="r.ref" [label]="'Edit XML of ' + r.id" />
          }
        </section>
      </div>
    } @else {
      <div class="empty">Localized resources “{{ resId() }}” are not defined in this policy chain.</div>
    }
  `,
  styleUrl: '../editors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalizationEditor {
  protected readonly store = inject(EditorStore);
  readonly resId = input.required<string>();
  protected readonly filter = signal('');
  protected readonly showXml = signal(false);
  protected readonly res = computed(() => this.store.eff()?.localizedResources.get(idKey(this.resId()))?.value ?? null);
  protected readonly languages = computed(() => this.store.eff()?.supportedLanguages ?? []);
  protected readonly defaultLanguage = computed(() => this.store.eff()?.defaultLanguage);
  protected readonly strings = computed(() => {
    const f = this.filter().toLowerCase();
    return (this.res()?.strings ?? []).filter((s) => !f || `${s.elementType} ${s.elementId} ${s.stringId} ${s.value}`.toLowerCase().includes(f));
  });
  protected itemsText(items: { text: string; value: string }[]): string {
    return items.map((i) => `${i.text}=${i.value}`).join(', ');
  }
  protected setText(ref: { fileId: string; path: readonly number[]; line: number }, value: string): void {
    this.store.edit('Edit localized string', [{ fileId: ref.fileId, mutate: (d) => setElementText(d, ref, value) }]);
  }
}
