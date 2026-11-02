import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TP_KINDS, TpKind } from '../../core/catalog/technical-profiles';
import {
  addClaimRef,
  addReference,
  ClaimCollection,
  removeAt,
  setAttribute,
  setMetadataItem,
  setProtocol,
  setSingleReference,
  setTpText,
} from '../../core/edit/commands';
import { ClaimRef, idKey, SourceRef } from '../../core/model/types';
import { attr, child, elementAt, elements, setAttr, XDocument } from '../../core/xml/xml';
import { EditorStore } from '../../state/editor.store';
import { ClaimPicker } from '../../shared/claim-picker';
import { Icon } from '../../shared/icon';
import { tpKindInfo } from '../../shared/present';
import { PreconditionEditor } from '../preconditions/precondition-editor';
import { ElementXml } from '../xml-editor/element-xml';
import { SelectValue } from '../../shared/select-value';
import { AlertItem } from '../../shared/alert-item';

interface Row<T> {
  item: T;
  own: boolean;
  from: string;
}

const KIND_ORDER: TpKind[] = ['selfAsserted', 'entraId', 'rest', 'claimsTransformation', 'oidc', 'oauth2', 'oauth1', 'saml', 'jwtIssuer', 'samlIssuer', 'phoneFactor', 'mfa', 'otp', 'session', 'idTokenHint', 'conditionalAccess', 'appInsights', 'oauth2Error'];

@Component({
  selector: 'app-technical-profile-editor',
  imports: [AlertItem, SelectValue, Icon, ClaimPicker, PreconditionEditor, ElementXml, NgTemplateOutlet],
  templateUrl: './technical-profile-editor.html',
  styleUrl: '../editors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TechnicalProfileEditor {
  protected readonly store = inject(EditorStore);
  readonly tpId = input.required<string>();
  protected readonly kinds = KIND_ORDER.map((k) => TP_KINDS[k]);
  protected readonly newMetaKey = signal('');
  protected readonly openVtp = signal<string | null>(null);
  protected readonly showXml = signal(false);

  protected readonly eff = this.store.eff;
  protected readonly entry = computed(() => this.eff()?.technicalProfiles.get(idKey(this.tpId())) ?? null);
  protected readonly tp = computed(() => this.eff()?.tp(this.tpId()) ?? null);
  protected readonly kind = computed(() => tpKindInfo(this.tp()?.kind));
  protected readonly writeFile = computed(() => this.store.tpWriteFile(this.tpId()));
  protected readonly layerFiles = computed(() => (this.entry()?.layers ?? []).map((l) => l.ref.fileId));
  protected readonly isOverride = computed(() => {
    const w = this.writeFile();
    return !!w && !this.layerFiles().includes(w);
  });
  protected readonly writeOptions = computed(() => {
    const chain = this.store.activeChain();
    if (!chain) return [];
    const files = new Set([...this.layerFiles(), this.store.targetFile()?.fileId].filter((x): x is string => !!x));
    return chain.docs.filter((d) => files.has(d.fileId)).map((d) => ({ id: d.fileId, label: `${this.store.layerOf(d.fileId)} — ${d.fileName}${this.layerFiles().includes(d.fileId) ? '' : ' (new override)'}` }));
  });

  /** Path of this technical profile's element in the write file, if it exists. */
  private readonly ownPath = computed(() => {
    const w = this.writeFile();
    const e = this.entry();
    const layer = e?.layers.find((l) => l.ref.fileId === w);
    return layer ? layer.ref.path : null;
  });

  private isOwn(ref: SourceRef): boolean {
    const p = this.ownPath();
    return !!p && ref.fileId === this.writeFile() && p.every((v, i) => ref.path[i] === v);
  }

  private fromLabel(ref: SourceRef): string {
    const tp = this.tp();
    const layer = this.store.layerOf(ref.fileId);
    // Which technical profile element (this one or an included one) defines the item?
    for (const inc of tp?.includeChain ?? []) {
      const e = this.eff()?.technicalProfiles.get(idKey(inc));
      if (e?.layers.some((l) => l.ref.fileId === ref.fileId && l.ref.path.every((v, i) => ref.path[i] === v))) return `${inc} (${layer})`;
    }
    return layer;
  }

  private rows<T extends { ref: SourceRef }>(items: readonly T[]): Row<T>[] {
    return items.map((item) => ({ item, own: this.isOwn(item.ref), from: this.fromLabel(item.ref) }));
  }

  protected readonly metadata = computed(() => this.rows(this.tp()?.metadata ?? []));
  protected readonly inputClaims = computed(() => this.rows(this.tp()?.inputClaims ?? []));
  protected readonly outputClaims = computed(() => this.rows(this.tp()?.outputClaims ?? []));
  protected readonly persistedClaims = computed(() => this.rows(this.tp()?.persistedClaims ?? []));
  protected readonly displayClaims = computed(() => this.rows(this.tp()?.displayClaims ?? []));
  protected readonly inputCts = computed(() => this.rows(this.tp()?.inputClaimsTransformations ?? []));
  protected readonly outputCts = computed(() => this.rows(this.tp()?.outputClaimsTransformations ?? []));
  protected readonly vtps = computed(() => this.rows(this.tp()?.validationTechnicalProfiles ?? []));

  protected readonly metaKeys = computed(() => this.kind().metadata);
  protected metaHelp(key: string): string {
    return this.kind().metadata.find((m) => m.key === key)?.description ?? '';
  }
  protected metaValues(key: string): string[] {
    return this.kind().metadata.find((m) => m.key === key)?.values ?? [];
  }

  protected readonly allTpIds = computed(() => [...(this.eff()?.technicalProfiles.values() ?? [])].map((t) => t.id).sort());
  protected readonly sessionTps = computed(() => {
    const e = this.eff();
    return e ? [...e.technicalProfiles.values()].filter((t) => e.tp(t.id)?.kind === 'session').map((t) => t.id) : [];
  });
  protected readonly ctIds = computed(() => [...(this.eff()?.claimsTransformations.values() ?? [])].map((t) => t.id).sort());
  protected readonly contentDefs = computed(() => [...(this.eff()?.contentDefinitions.values() ?? [])].map((t) => t.id).sort());

  protected readonly usages = computed(() => {
    const e = this.eff();
    const id = idKey(this.tpId());
    const out: { label: string; go: () => void }[] = [];
    if (!e) return out;
    for (const j of [...e.userJourneys.values(), ...e.subJourneys.values()]) {
      for (const st of j.value.steps) {
        if (st.claimsExchanges.some((x) => idKey(x.technicalProfileReferenceId) === id) || idKey(st.cpimIssuerTechnicalProfileReferenceId) === id) {
          out.push({ label: `${j.id} · step ${st.orderText}`, go: () => this.store.select({ kind: 'step', journeyId: j.id, stepKey: `${j.id}#${st.orderText.trim()}` }) });
        }
      }
    }
    for (const t of e.technicalProfiles.values()) {
      const v = t.value;
      if (v.validationTechnicalProfiles.some((x) => idKey(x.referenceId) === id)) out.push({ label: `Validation profile of ${t.id}`, go: () => this.open(t.id) });
      if (idKey(v.includeTechnicalProfile?.referenceId) === id) out.push({ label: `Included by ${t.id}`, go: () => this.open(t.id) });
      if (idKey(v.useTechnicalProfileForSessionManagement?.referenceId) === id) out.push({ label: `Session manager of ${t.id}`, go: () => this.open(t.id) });
    }
    for (const dc of e.displayControls.values()) {
      if (dc.value.actions.some((a) => a.validationClaimsExchangeTechnicalProfiles.some((x) => idKey(x) === id))) out.push({ label: `Display control ${dc.id}`, go: () => this.store.select({ kind: 'displayControl', id: dc.id }) });
    }
    return out;
  });

  protected readonly problems = computed(() => (this.store.diagnosticsByTarget().get(`technicalProfile:${idKey(this.tpId())}`) ?? []).filter((d) => d.severity !== 'info'));

  protected readonly xmlRef = computed(() => {
    const e = this.entry();
    const w = this.writeFile();
    return e?.layers.find((l) => l.ref.fileId === w)?.ref ?? e?.value.ref ?? null;
  });

  // ------------------------------------------------------------------ edits

  private edit(label: string, fn: (d: XDocument, ref: SourceRef) => void): void {
    this.store.editTp(this.tpId(), label, fn);
  }

  protected open(id: string): void {
    this.store.selection.set({ kind: 'technicalProfile', id });
  }

  protected setWrite(fileId: string): void {
    this.store.tpWritePref.update((p) => ({ ...p, [idKey(this.tpId())]: fileId }));
  }

  protected setText(name: string, value: string): void {
    this.edit(`Set ${name} of ${this.tpId()}`, (d, r) => setTpText(d, r, name, value || null));
  }

  protected setKind(kind: TpKind): void {
    const k = TP_KINDS[kind];
    this.edit(`Change ${this.tpId()} to ${k.label}`, (d, r) => {
      setProtocol(d, r, k.protocol?.name ?? null, k.protocol?.handler);
      if (k.outputTokenFormat) setTpText(d, r, 'OutputTokenFormat', k.outputTokenFormat);
    });
  }

  protected setRef(name: 'IncludeTechnicalProfile' | 'UseTechnicalProfileForSessionManagement', value: string): void {
    this.edit(`Set ${name} of ${this.tpId()}`, (d, r) => setSingleReference(d, r, name, value || null));
  }

  protected setMeta(key: string, value: string | null): void {
    if (!key.trim()) return;
    this.edit(value === null ? `Remove metadata ${key}` : `Set metadata ${key}`, (d, r) => setMetadataItem(d, r, key.trim(), value));
  }

  protected addMeta(key: string, value: string): void {
    this.setMeta(key, value);
    this.newMetaKey.set('');
  }

  protected removeOwn(ref: SourceRef, label: string): void {
    this.store.edit(label, [{ fileId: ref.fileId, mutate: (d) => removeAt(d, ref) }]);
  }

  protected setClaimAttr(collection: ClaimCollection, row: Row<ClaimRef>, name: string, value: string | null): void {
    const c = row.item;
    if (row.own) {
      this.store.edit(`Set ${name} of ${c.claimTypeReferenceId}`, [{ fileId: c.ref.fileId, mutate: (d) => setAttribute(d, c.ref, name, value) }]);
      return;
    }
    // Inherited: write a partial override of the claim reference in the write file.
    this.edit(`Override ${name} of ${c.claimTypeReferenceId}`, (d, r) => {
      const tpEl = elementAt(d.root, r.path)!;
      const itemName = collection.slice(0, -1);
      const existing = elements(child(tpEl, collection), itemName).find((x) => idKey(attr(x, 'ClaimTypeReferenceId')) === idKey(c.claimTypeReferenceId));
      if (existing) {
        setAttr(existing, name, value);
      } else {
        addClaimRef(d, r, collection, { ClaimTypeReferenceId: c.claimTypeReferenceId, [name]: value ?? undefined });
      }
    });
  }

  protected addClaim(collection: ClaimCollection, claim: string): void {
    if (!claim) return;
    this.edit(`Add ${claim} to ${collection} of ${this.tpId()}`, (d, r) => addClaimRef(d, r, collection, { ClaimTypeReferenceId: claim }));
  }

  protected addRef(container: 'InputClaimsTransformations' | 'OutputClaimsTransformations' | 'ValidationTechnicalProfiles', id: string): void {
    if (!id) return;
    this.edit(`Add ${id} to ${container}`, (d, r) => addReference(d, r, container, id));
  }

  protected setVtpAttr(ref: SourceRef, name: string, value: string | null, own: boolean): void {
    if (!own) {
      this.store.toast({ kind: 'info', title: 'Inherited validation profile', lines: ['Change it in the file that defines it (use “Write changes to”), or edit the XML.'] });
      return;
    }
    this.store.edit(`Set ${name}`, [{ fileId: ref.fileId, mutate: (d) => setAttribute(d, ref, name, value) }]);
  }

  protected openStepOrClaim(id: string): void {
    this.store.select({ kind: 'claim', id });
  }

  protected docs(): string {
    return this.kind().docs;
  }
}
