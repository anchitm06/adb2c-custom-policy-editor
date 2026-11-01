import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { setAttribute, setElementText } from '../../core/edit/commands';
import { idKey } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { ElementXml } from '../xml-editor/element-xml';

@Component({
  selector: 'app-predicate-editor',
  imports: [Icon, ElementXml],
  template: `
    @if (pred(); as p) {
      <header class="ed-head">
        <app-icon name="rule" [size]="22" />
        <div class="grow"><h2 class="mono">{{ p.id }}</h2><div class="muted small">Predicate · {{ p.method }}</div></div>
      </header>
      <div class="ed-body">
        <section class="card sec">
          <div class="field">
            <label for="pr-help">Help text</label>
            <input id="pr-help" type="text" [value]="p.helpText ?? ''" (change)="setAttr(p.ref, 'HelpText', $any($event.target).value)" />
          </div>
          <h4>Parameters</h4>
          @for (x of p.parameters; track x.id) {
            <div class="row li"><span class="mono" style="min-width: 160px">{{ x.id }}</span><input class="grow" type="text" [value]="x.value" [attr.aria-label]="x.id" (change)="setText(x.ref, $any($event.target).value)" /></div>
          }
        </section>
        <section class="card sec"><h3>XML</h3><app-element-xml [ref]="p.ref" [label]="'Edit XML of ' + p.id" /></section>
      </div>
    } @else if (pv(); as v) {
      <header class="ed-head">
        <app-icon name="rule" [size]="22" />
        <div class="grow"><h2 class="mono">{{ v.id }}</h2><div class="muted small">Predicate validation · {{ v.groups.length }} groups</div></div>
      </header>
      <div class="ed-body">
        @for (g of v.groups; track g.id) {
          <section class="card sec">
            <h3>{{ g.id }} <span class="muted small">match at least {{ g.matchAtLeast ?? 'all' }}</span></h3>
            <p class="small">{{ g.userHelpText }}</p>
            @for (r of g.predicateReferences; track r) {
              <a class="chip accent clickable" href="#" (click)="store.select({ kind: 'predicate', id: r }); $event.preventDefault()">{{ r }}</a>
            }
          </section>
        }
        <section class="card sec"><h3>XML</h3><app-element-xml [ref]="v.ref" [label]="'Edit XML of ' + v.id" /></section>
      </div>
    } @else {
      <div class="empty">“{{ predId() }}” is not defined in this policy chain.</div>
    }
  `,
  styleUrl: '../editors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PredicateEditor {
  protected readonly store = inject(EditorStore);
  readonly predId = input.required<string>();
  protected readonly pred = computed(() => this.store.eff()?.predicates.get(idKey(this.predId()))?.value ?? null);
  protected readonly pv = computed(() => this.store.eff()?.predicateValidations.get(idKey(this.predId()))?.value ?? null);
  protected setAttr(ref: { fileId: string; path: readonly number[]; line: number }, name: string, value: string): void {
    this.store.edit(`Set ${name}`, [{ fileId: ref.fileId, mutate: (d) => setAttribute(d, ref, name, value || null) }]);
  }
  protected setText(ref: { fileId: string; path: readonly number[]; line: number }, value: string): void {
    this.store.edit('Edit predicate parameter', [{ fileId: ref.fileId, mutate: (d) => setElementText(d, ref, value) }]);
  }
}
