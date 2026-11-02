import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { addClaimRef, removeAt, setAttribute, setProtocol } from '../../core/edit/commands';
import { idKey } from '../../core/model/types';
import { EditorStore } from '../../state/editor.store';
import { ClaimPicker } from '../../shared/claim-picker';
import { Icon } from '../../shared/icon';
import { AVAILABILITY_CLASS, AVAILABILITY_LABEL } from '../../shared/present';
import { ElementXml } from '../xml-editor/element-xml';
import { SelectValue } from '../../shared/select-value';

@Component({
  selector: 'app-relying-party-editor',
  imports: [SelectValue, Icon, ClaimPicker, ElementXml],
  template: `
    @if (rp(); as r) {
      <header class="ed-head">
        <app-icon name="app" [size]="22" />
        <div class="grow">
          <h2>{{ leaf()?.policyId }}</h2>
          <div class="muted small">Relying party · {{ store.fileName(r.ref.fileId) }}</div>
        </div>
      </header>
      <div class="ed-body">
        <section class="card sec">
          <div class="grid2">
            <div class="field">
              <label for="rp-j">Default user journey</label>
              <select id="rp-j" [appValue]="r.defaultUserJourney?.referenceId ?? ''" (change)="setJourney($any($event.target).value)">
                @for (j of store.journeyIds(); track j) {
                  <option [value]="j">{{ j }}</option>
                }
              </select>
              <span class="hint"><a href="#" (click)="openJourney(); $event.preventDefault()">Open on the canvas</a></span>
            </div>
            @if (r.technicalProfile; as tp) {
              <div class="field">
                <label for="rp-proto">Protocol</label>
                <select id="rp-proto" [appValue]="tp.protocol?.name ?? ''" (change)="setProtocol($any($event.target).value)">
                  <option value="OpenIdConnect">OpenIdConnect</option>
                  <option value="SAML2">SAML2</option>
                </select>
              </div>
              <div class="field">
                <label for="rp-sni">Subject claim (SubjectNamingInfo)</label>
                <input id="rp-sni" type="text" [value]="tp.subjectNamingInfo?.claimType ?? ''" (change)="setSubject($any($event.target).value)" />
              </div>
            }
          </div>
        </section>

        @if (r.technicalProfile; as tp) {
          <section class="card sec">
            <h3>Token claims</h3>
            @if (analysisNote(); as n) {
              <p class="muted small">{{ n }}</p>
            }
            <table class="grid">
              <thead><tr><th>Claim</th><th>Name in token</th><th>Default value</th><th>Always default</th><th>At token issuance</th><th style="width: 30px"></th></tr></thead>
              <tbody>
                @for (c of rows(); track c.claim.claimTypeReferenceId) {
                  <tr>
                    <td class="mono"><a href="#" (click)="store.select({ kind: 'claim', id: c.claim.claimTypeReferenceId }); $event.preventDefault()">{{ c.claim.claimTypeReferenceId }}</a></td>
                    <td><input type="text" [value]="c.claim.partnerClaimType ?? ''" aria-label="Partner claim type" (change)="setAttr(c.claim.ref, 'PartnerClaimType', $any($event.target).value)" /></td>
                    <td><input type="text" [value]="c.claim.defaultValue ?? ''" aria-label="Default value" (change)="setAttr(c.claim.ref, 'DefaultValue', $any($event.target).value)" /></td>
                    <td><input type="checkbox" [checked]="!!c.claim.alwaysUseDefaultValue" aria-label="Always use default" (change)="setAttr(c.claim.ref, 'AlwaysUseDefaultValue', $any($event.target).checked ? 'true' : '')" /></td>
                    <td>
                      @if (c.av; as a) {
                        <span class="chip {{ cls(a) }}" [title]="c.title">{{ lbl(a) }}</span>
                      }
                    </td>
                    <td><button class="btn ghost sm icon" title="Remove" (click)="remove(c.claim.ref)"><app-icon name="close" [size]="13" /></button></td>
                  </tr>
                }
              </tbody>
            </table>
            <div class="row addrow"><app-claim-picker class="grow" placeholder="Add a token claim…" [availability]="finalBag()" (changed)="addClaim($event)" /></div>
          </section>
        }

        @if (r.userJourneyBehaviors.length) {
          <section class="card sec">
            <h3>User journey behaviors</h3>
            @for (b of r.userJourneyBehaviors; track b.key) {
              <div class="li"><span class="mono">{{ b.key }}</span> <span class="muted">{{ b.value }}</span></div>
            }
          </section>
        }
        <section class="card sec">
          <h3>XML</h3>
          <app-element-xml [ref]="r.ref" label="Edit relying party XML" />
        </section>
      </div>
    } @else {
      <div class="empty">The active policy chain has no RelyingParty. Pick a relying party file in the top bar.</div>
    }
  `,
  styleUrl: '../editors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelyingPartyEditor {
  protected readonly store = inject(EditorStore);
  protected readonly rp = computed(() => this.store.eff()?.relyingParty ?? null);
  protected readonly leaf = computed(() => this.store.activeChain()?.leaf ?? null);
  private readonly a = computed(() => {
    const a = this.store.analysis();
    const def = this.rp()?.defaultUserJourney?.referenceId;
    return a && def && idKey(a.journeyId) === idKey(def) ? a : null;
  });
  protected readonly analysisNote = computed(() => (this.a() ? `Availability is computed over the ${this.a()!.paths.length} paths of ${this.a()!.journeyId}.` : 'Open the default journey to see claim availability.'));
  protected readonly finalBag = computed(() => {
    const a = this.a();
    if (!a) return null;
    const last = [...a.steps.values()].filter((s) => s.journeyId === a.journeyId).at(-1);
    return last?.before ?? null;
  });
  protected readonly rows = computed(() => {
    const tp = this.rp()?.technicalProfile;
    const a = this.a();
    return (tp?.outputClaims ?? []).map((c) => {
      const t = a?.tokenClaims.find((x) => idKey(x.claim) === idKey(c.claimTypeReferenceId));
      const av = t?.availability.availability;
      const missing = t ? [...t.availability.absentOn, ...t.availability.maybeOn].map((p) => a!.paths[p]?.label) : [];
      return { claim: c, av, title: av === 'definitely' ? 'Present on every path' : `Missing or uncertain on: ${missing.join('; ')}` };
    });
  });
  protected cls(a: 'definitely' | 'maybe' | 'absent'): string {
    return AVAILABILITY_CLASS[a];
  }
  protected lbl(a: 'definitely' | 'maybe' | 'absent'): string {
    return AVAILABILITY_LABEL[a];
  }
  protected setJourney(id: string): void {
    const r = this.rp();
    const ref = r?.defaultUserJourney?.ref;
    if (ref) this.store.edit(`Use journey ${id}`, [{ fileId: ref.fileId, mutate: (d) => setAttribute(d, ref, 'ReferenceId', id) }]);
  }
  protected openJourney(): void {
    const id = this.rp()?.defaultUserJourney?.referenceId;
    if (id) this.store.openJourney(id);
  }
  protected setAttr(ref: { fileId: string; path: readonly number[]; line: number }, name: string, value: string): void {
    this.store.edit(`Set ${name}`, [{ fileId: ref.fileId, mutate: (d) => setAttribute(d, ref, name, value || null) }]);
  }
  protected setProtocol(name: string): void {
    const tp = this.rp()?.technicalProfile;
    if (!tp) return;
    this.store.edit('Set relying party protocol', [{ fileId: tp.ref.fileId, mutate: (d) => setProtocol(d, tp.ref, name) }]);
  }
  protected setSubject(claim: string): void {
    const tp = this.rp()?.technicalProfile;
    if (tp?.subjectNamingInfo) this.setAttr(tp.subjectNamingInfo.ref, 'ClaimType', claim);
  }
  protected remove(ref: { fileId: string; path: readonly number[]; line: number }): void {
    this.store.edit('Remove token claim', [{ fileId: ref.fileId, mutate: (d) => removeAt(d, ref) }]);
  }
  protected addClaim(id: string): void {
    const tp = this.rp()?.technicalProfile;
    if (tp) this.store.edit(`Add token claim ${id}`, [{ fileId: tp.ref.fileId, mutate: (d) => addClaimRef(d, tp.ref, 'OutputClaims', { ClaimTypeReferenceId: id }) }]);
  }
}
