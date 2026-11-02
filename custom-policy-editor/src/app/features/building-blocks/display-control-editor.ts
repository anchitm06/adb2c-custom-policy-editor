import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { idKey } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { ElementXml } from '../xml-editor/element-xml';

@Component({
  selector: 'app-display-control-editor',
  imports: [Icon, ElementXml],
  template: `
    @if (dc(); as c) {
      <header class="ed-head">
        <app-icon name="control" [size]="22" />
        <div class="grow">
          <h2 class="mono">{{ c.id }}</h2>
          <div class="muted small">{{ c.userInterfaceControlType }}, {{ store.layerOf(c.ref.fileId) }}, {{ store.fileName(c.ref.fileId) }}</div>
        </div>
      </header>
      <div class="ed-body">
        <section class="card sec">
          <h3>Claims</h3>
          <div class="grid2">
            <div><h4>Input</h4>@for (x of c.inputClaims; track $index) {<div class="li mono">{{ x.claimTypeReferenceId }}</div>}</div>
            <div><h4>Display</h4>@for (x of c.displayClaims; track $index) {<div class="li mono">{{ x.claimTypeReferenceId ?? x.displayControlReferenceId }}{{ x.required ? ' (required)' : '' }}</div>}</div>
            <div><h4>Output</h4>@for (x of c.outputClaims; track $index) {<div class="li mono">{{ x.claimTypeReferenceId }}</div>}</div>
          </div>
        </section>
        <section class="card sec">
          <h3>Actions</h3>
          @for (a of c.actions; track a.id) {
            <div class="li"><strong>{{ a.id }}</strong> →
              @for (t of a.validationClaimsExchangeTechnicalProfiles; track t) {
                <a href="#" class="mono" (click)="openTp(t); $event.preventDefault()">{{ t }}</a>&nbsp;
              }
            </div>
          } @empty {
            <p class="muted small">No actions.</p>
          }
        </section>
        <section class="card sec">
          <h3>XML</h3>
          <app-element-xml [ref]="c.ref" [label]="'Edit XML of ' + c.id" />
        </section>
      </div>
    } @else {
      <div class="empty">Display control “{{ dcId() }}” is not defined in this policy chain.</div>
    }
  `,
  styleUrl: '../editors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisplayControlEditor {
  protected readonly store = inject(EditorStore);
  readonly dcId = input.required<string>();
  protected readonly dc = computed(() => this.store.eff()?.displayControls.get(idKey(this.dcId()))?.value ?? null);
  protected openTp(id: string): void {
    this.store.view.set('technicalProfiles');
    this.store.selection.set({ kind: 'technicalProfile', id });
  }
}
