import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { setAttribute } from '../../core/edit/commands';
import { idKey } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { ElementXml } from '../xml-editor/element-xml';
import { SelectValue } from '../../shared/select-value';

@Component({
  selector: 'app-journey-inspector',
  imports: [SelectValue, Icon, ElementXml],
  template: `
    @if (journey(); as j) {
      <div class="head">
        <app-icon [name]="j.kind === 'SubJourney' ? 'subjourney' : 'journey'" [size]="20" />
        <div class="grow">
          <div class="title">{{ j.id }}</div>
          <div class="muted small">{{ j.kind === 'SubJourney' ? 'Sub journey (' + (j.subJourneyType ?? '?') + ')' : 'User journey' }} · <span class="layer">{{ store.layerOf(j.ref.fileId) }}</span> {{ store.fileName(j.ref.fileId) }}</div>
        </div>
      </div>
      <div class="body">
        <div class="stat">
          <div><strong>{{ j.steps.length }}</strong><span class="muted small">steps</span></div>
          <div><strong>{{ a()?.paths?.length ?? 0 }}</strong><span class="muted small">paths</span></div>
          <div><strong>{{ problems().length }}</strong><span class="muted small">problems</span></div>
        </div>
        <div class="field">
          <label for="j-id">Id</label>
          <input id="j-id" type="text" [value]="j.id" (change)="rename($any($event.target).value)" />
          <span class="hint">Renaming updates the relying party and every reference in all loaded files.</span>
        </div>
        @if (j.kind === 'SubJourney') {
          <div class="field">
            <label for="j-type">Type</label>
            <select id="j-type" [appValue]="j.subJourneyType ?? ''" (change)="setAttr('Type', $any($event.target).value)">
              <option value="Call">Call — returns to the calling journey</option>
              <option value="Transfer">Transfer — ends with its own SendClaims</option>
            </select>
          </div>
        }
        <div class="field">
          <label for="j-iss">Default token issuer (DefaultCpimIssuerTechnicalProfileReferenceId)</label>
          <input id="j-iss" type="text" [value]="j.defaultCpimIssuerTechnicalProfileReferenceId ?? ''" (change)="setAttr('DefaultCpimIssuerTechnicalProfileReferenceId', $any($event.target).value)" />
        </div>
        <h4>Paths through this journey</h4>
        <p class="muted small">Every combination of buttons, sign-up links and claim states that changes which steps run. Pick one to trace it on the canvas.</p>
        @for (p of a()?.paths ?? []; track p.id) {
          <div class="list-item" [class.selected]="store.selectedPath() === p.id" role="button" tabindex="0" (click)="store.selectedPath.set(p.id)" (keydown.enter)="store.selectedPath.set(p.id)">
            <app-icon name="path" [size]="14" />
            <span class="grow truncate">{{ p.label }}</span>
            <span class="chip {{ p.outcome === 'token' ? 'ok' : 'warning' }}">{{ p.outcome === 'token' ? 'token' : p.outcome }}</span>
            <span class="muted small">{{ ran(p) }} steps</span>
          </div>
        }
        @if (problems().length) {
          <h4>Problems</h4>
          @for (d of problems(); track d.key) {
            <div class="list-item small" role="button" tabindex="0" (click)="store.goTo(d)" (keydown.enter)="store.goTo(d)"><app-icon [name]="d.severity" [size]="13" /> <span class="grow">{{ d.message }}</span></div>
          }
        }
        <h4>XML</h4>
        <app-element-xml [ref]="j.ref" [label]="'Edit XML of ' + j.id" />
      </div>
    }
  `,
  styleUrl: './inspector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JourneyInspector {
  protected readonly store = inject(EditorStore);
  readonly journeyId = input.required<string>();
  protected readonly journey = computed(() => {
    const e = this.store.eff();
    const id = idKey(this.journeyId());
    return e?.userJourneys.get(id)?.value ?? e?.subJourneys.get(id)?.value ?? null;
  });
  protected readonly a = computed(() => {
    const a = this.store.analysis();
    return a && idKey(a.journeyId) === idKey(this.journeyId()) ? a : null;
  });
  protected readonly problems = computed(() => {
    const id = idKey(this.journeyId());
    return this.store.diagnostics().filter((d) => d.target && ((d.target.kind === 'journey' && idKey(d.target.id) === id) || (d.target.kind === 'step' && idKey(d.target.journeyId) === id)) && d.severity !== 'info');
  });

  protected ran(p: { visits: { ran: boolean }[] }): number {
    return p.visits.filter((v) => v.ran).length;
  }

  protected setAttr(name: string, value: string): void {
    const j = this.journey();
    if (j) this.store.edit(`Set ${name}`, [{ fileId: j.ref.fileId, mutate: (d) => setAttribute(d, j.ref, name, value || null) }]);
  }

  protected rename(to: string): void {
    const j = this.journey();
    if (!j || !to || to === j.id) return;
    const from = j.id;
    if (this.store.renameEverywhere('journey', from, to)) this.store.openJourney(to);
  }
}
