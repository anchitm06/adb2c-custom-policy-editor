/**
 * Edit commands. Each command mutates a parsed XDocument in place; the store serializes the
 * result. Element positions follow the XSD sequence order so new elements land where Azure AD
 * B2C expects them.
 */

import { Atom, atomToPrecondition } from '../analysis/preconditions';
import { SourceRef } from '../model/types';
import {
  attr,
  child,
  createElement,
  elementAt,
  elements,
  insertElement,
  moveElement,
  parseXml,
  removeElement,
  serializeElement,
  setAttr,
  setText,
  textOf,
  XDocument,
  XElement,
} from '../xml/xml';

export class EditError extends Error {}

export const ORDER = {
  TrustFrameworkPolicy: ['BasePolicy', 'BuildingBlocks', 'ClaimsProviders', 'UserJourneys', 'SubJourneys', 'RelyingParty'],
  BuildingBlocks: ['ClaimsSchema', 'Predicates', 'PredicateValidations', 'ClaimsTransformations', 'ClientDefinitions', 'ContentDefinitions', 'Localization', 'DisplayControls'],
  ClaimType: ['DisplayName', 'DataType', 'DefaultPartnerClaimTypes', 'Mask', 'AdminHelpText', 'UserHelpText', 'UserInputType', 'Restriction', 'PredicateValidationReference'],
  TechnicalProfile: [
    'Domain', 'DisplayName', 'Description', 'Protocol', 'InputTokenFormat', 'OutputTokenFormat', 'Metadata', 'CryptographicKeys',
    'InputClaimsTransformations', 'InputClaims', 'DisplayClaims', 'PersistedClaims', 'OutputClaims', 'OutputClaimsTransformations',
    'ValidationTechnicalProfiles', 'SubjectNamingInfo', 'IncludeInSso', 'IncludeClaimsFromTechnicalProfile', 'IncludeTechnicalProfile',
    'UseTechnicalProfileForSessionManagement', 'EnabledForUserJourneys',
  ],
  OrchestrationStep: ['Preconditions', 'ClaimsProviderSelections', 'ClaimsExchanges', 'JourneyList'],
  ClaimsTransformation: ['InputClaims', 'InputParameters', 'OutputClaims'],
  ContentDefinition: ['LoadUri', 'RecoveryUri', 'DataUri', 'Metadata', 'LocalizedResourcesReferences'],
  ClaimsProvider: ['Domain', 'DisplayName', 'TechnicalProfiles'],
  RelyingParty: ['DefaultUserJourney', 'Endpoints', 'UserJourneyBehaviors', 'TechnicalProfile'],
} as const;

export function at(doc: XDocument, ref: Pick<SourceRef, 'path'>): XElement {
  const el = elementAt(doc.root, ref.path);
  if (!el) throw new EditError('The element no longer exists. It may have been changed by another edit.');
  return el;
}

/** Get or create a child, inserted according to `order`. */
export function ensureOrdered(parent: XElement, name: string, order: readonly string[]): XElement {
  const existing = child(parent, name);
  if (existing) return existing;
  return insertOrdered(parent, createElement(name), order);
}

export function insertOrdered(parent: XElement, el: XElement, order: readonly string[]): XElement {
  const rank = order.indexOf(el.name);
  const els = elements(parent);
  let idx = els.findIndex((e) => {
    const r = order.indexOf(e.name);
    return r > rank && r >= 0;
  });
  if (rank < 0) idx = -1;
  return insertElement(parent, el, idx < 0 ? undefined : idx);
}

/** Set (or remove when value is null/empty) a simple text child such as DisplayName. */
export function setChildText(parent: XElement, name: string, value: string | null | undefined, order: readonly string[]): void {
  const existing = child(parent, name);
  if (value === null || value === undefined || value === '') {
    if (existing) removeElement(existing);
    return;
  }
  if (existing) {
    if (textOf(existing) !== value) setText(existing, value);
    return;
  }
  insertOrdered(parent, createElement(name, {}, value), order);
}

export function ensureSection(doc: XDocument, name: 'ClaimsSchema' | 'ClaimsTransformations' | 'ContentDefinitions' | 'Localization' | 'DisplayControls' | 'Predicates' | 'PredicateValidations' | 'ClaimsProviders' | 'UserJourneys' | 'SubJourneys'): XElement {
  const root = doc.root;
  if (name === 'ClaimsProviders' || name === 'UserJourneys' || name === 'SubJourneys') return ensureOrdered(root, name, ORDER.TrustFrameworkPolicy);
  const bb = ensureOrdered(root, 'BuildingBlocks', ORDER.TrustFrameworkPolicy);
  return ensureOrdered(bb, name, ORDER.BuildingBlocks);
}

/** Parse an XML fragment (single element). */
export function parseFragment(xml: string): XElement {
  const d = parseXml(xml.trim());
  const el = d.root;
  el.parent = null;
  return el;
}

function h(name: string, attrs: Record<string, string | undefined> = {}, ...children: (XElement | string)[]): XElement {
  const el = createElement(name, attrs);
  for (const c of children) {
    if (typeof c === 'string') setText(el, c);
    else {
      c.parent = el;
      el.children.push(c);
      el.selfClosing = false;
    }
  }
  return el;
}
export { h as element };

// ---------------------------------------------------------------------------------------------
// Generic
// ---------------------------------------------------------------------------------------------

export function setAttribute(doc: XDocument, ref: SourceRef, name: string, value: string | null): void {
  setAttr(at(doc, ref), name, value === null || value === '' ? null : value);
}

export function removeAt(doc: XDocument, ref: SourceRef): void {
  const el = at(doc, ref);
  const parent = el.parent;
  removeElement(el);
  // Drop empty containers like <InputClaims /> that only held this element? Keep them: B2C accepts empty containers.
  void parent;
}

export function replaceElementXml(doc: XDocument, ref: SourceRef, xml: string): void {
  const el = at(doc, ref);
  const next = parseFragment(xml);
  const parent = el.parent;
  if (!parent) {
    // Root replacement: swap content.
    doc.root = next;
    return;
  }
  const idx = elements(parent).indexOf(el);
  removeElement(el);
  insertElement(parent, next, idx, true);
}

// ---------------------------------------------------------------------------------------------
// Journeys and steps
// ---------------------------------------------------------------------------------------------

function stepsContainer(journey: XElement): XElement {
  return ensureOrdered(journey, 'OrchestrationSteps', ['OrchestrationSteps']);
}

export function renumberSteps(journey: XElement): void {
  const container = child(journey, 'OrchestrationSteps');
  elements(container, 'OrchestrationStep').forEach((s, i) => {
    if (attr(s, 'Order') !== String(i + 1)) setAttr(s, 'Order', String(i + 1));
  });
}

export function renumberStepsAt(doc: XDocument, journeyRef: SourceRef): void {
  renumberSteps(at(doc, journeyRef));
}

export function newStepElement(type: string): XElement {
  switch (type) {
    case 'SendClaims':
      return h('OrchestrationStep', { Order: '0', Type: 'SendClaims', CpimIssuerTechnicalProfileReferenceId: 'JwtIssuer' });
    case 'InvokeSubJourney':
      return h('OrchestrationStep', { Order: '0', Type: 'InvokeSubJourney' }, h('JourneyList', {}, h('Candidate', { SubJourneyReferenceId: '' })));
    case 'CombinedSignInAndSignUp':
    case 'ClaimsProviderSelection':
      return h('OrchestrationStep', { Order: '0', Type: type, ContentDefinitionReferenceId: type === 'CombinedSignInAndSignUp' ? 'api.signuporsignin' : 'api.idpselections' }, h('ClaimsProviderSelections'));
    case 'GetClaims':
      return h('OrchestrationStep', { Order: '0', Type: 'GetClaims', CpimIssuerTechnicalProfileReferenceId: 'IdTokenHint_ExtractClaims' });
    default:
      return h('OrchestrationStep', { Order: '0', Type: 'ClaimsExchange' }, h('ClaimsExchanges'));
  }
}

export function addStep(doc: XDocument, journeyRef: SourceRef, index: number, type: string, exchange?: { id: string; technicalProfileId: string }): number[] {
  const journey = at(doc, journeyRef);
  const container = stepsContainer(journey);
  const step = newStepElement(type);
  if (exchange && type === 'ClaimsExchange') {
    const xs = child(step, 'ClaimsExchanges')!;
    const x = h('ClaimsExchange', { Id: exchange.id, TechnicalProfileReferenceId: exchange.technicalProfileId });
    x.parent = xs;
    xs.children.push(x);
    xs.selfClosing = false;
  }
  insertElement(container, step, index);
  renumberSteps(journey);
  return [...journeyRef.path, elements(journey).indexOf(container), elements(container).indexOf(step)];
}

export function removeStep(doc: XDocument, stepRef: SourceRef): void {
  const step = at(doc, stepRef);
  const journey = step.parent?.parent;
  removeElement(step);
  if (journey) renumberSteps(journey);
}

export function moveStep(doc: XDocument, stepRef: SourceRef, toIndex: number): void {
  const step = at(doc, stepRef);
  const journey = step.parent?.parent;
  moveElement(step, toIndex);
  if (journey) renumberSteps(journey);
}

export function duplicateStep(doc: XDocument, stepRef: SourceRef): void {
  const step = at(doc, stepRef);
  const container = step.parent!;
  const xml = serializeForClone(step);
  const copy = parseFragment(xml);
  // Exchange ids must be unique within a journey.
  for (const x of elements(child(copy, 'ClaimsExchanges'), 'ClaimsExchange')) setAttr(x, 'Id', `${attr(x, 'Id') ?? 'Exchange'}-copy`);
  insertElement(container, copy, elements(container).indexOf(step) + 1, true);
  if (container.parent) renumberSteps(container.parent);
}

function serializeForClone(el: XElement): string {
  return serializeElement(el);
}

/** Replace the preconditions of a step or validation technical profile reference. */
export function setPreconditions(doc: XDocument, ownerRef: SourceRef, atoms: readonly Atom[], action: string): void {
  const owner = at(doc, ownerRef);
  const existing = child(owner, 'Preconditions');
  if (!atoms.length) {
    if (existing) removeElement(existing);
    return;
  }
  const pcs = h('Preconditions');
  for (const a of atoms) {
    const p = atomToPrecondition(a);
    const pe = h('Precondition', { Type: p.type, ExecuteActionsIf: p.executeActionsIf });
    for (const v of p.values) {
      const ve = h('Value', {}, v);
      ve.parent = pe;
      pe.children.push(ve);
    }
    const ae = h('Action', {}, action);
    ae.parent = pe;
    pe.children.push(ae);
    pe.selfClosing = false;
    pe.parent = pcs;
    pcs.children.push(pe);
    pcs.selfClosing = false;
  }
  if (existing) {
    const idx = elements(owner).indexOf(existing);
    removeElement(existing);
    insertElement(owner, pcs, idx);
  } else if (owner.name === 'OrchestrationStep') {
    insertOrdered(owner, pcs, ORDER.OrchestrationStep);
  } else {
    insertElement(owner, pcs, 0);
  }
}

export function addClaimsExchange(doc: XDocument, stepRef: SourceRef, id: string, technicalProfileId: string): void {
  const step = at(doc, stepRef);
  const xs = ensureOrdered(step, 'ClaimsExchanges', ORDER.OrchestrationStep);
  insertElement(xs, h('ClaimsExchange', { Id: id, TechnicalProfileReferenceId: technicalProfileId }));
}

export function addSelection(doc: XDocument, stepRef: SourceRef, sel: { target?: string; validation?: string }): void {
  const step = at(doc, stepRef);
  const xs = ensureOrdered(step, 'ClaimsProviderSelections', ORDER.OrchestrationStep);
  insertElement(xs, h('ClaimsProviderSelection', sel.target ? { TargetClaimsExchangeId: sel.target } : { ValidationClaimsExchangeId: sel.validation }));
}

export function setStepType(doc: XDocument, stepRef: SourceRef, type: string): void {
  const step = at(doc, stepRef);
  setAttr(step, 'Type', type);
  if (type === 'ClaimsExchange') ensureOrdered(step, 'ClaimsExchanges', ORDER.OrchestrationStep);
  if (type === 'InvokeSubJourney' && !child(step, 'JourneyList')) insertOrdered(step, h('JourneyList', {}, h('Candidate', { SubJourneyReferenceId: '' })), ORDER.OrchestrationStep);
}

export function setCandidate(doc: XDocument, stepRef: SourceRef, subJourneyId: string): void {
  const step = at(doc, stepRef);
  const jl = ensureOrdered(step, 'JourneyList', ORDER.OrchestrationStep);
  const c = child(jl, 'Candidate');
  if (c) setAttr(c, 'SubJourneyReferenceId', subJourneyId);
  else insertElement(jl, h('Candidate', { SubJourneyReferenceId: subJourneyId }));
}

export function addJourney(doc: XDocument, kind: 'UserJourney' | 'SubJourney', id: string, subType = 'Call'): void {
  const section = ensureSection(doc, kind === 'UserJourney' ? 'UserJourneys' : 'SubJourneys');
  const steps = h('OrchestrationSteps');
  const j = h(kind, kind === 'SubJourney' ? { Id: id, Type: subType } : { Id: id }, steps);
  if (kind === 'UserJourney') {
    const s = newStepElement('SendClaims');
    setAttr(s, 'Order', '1');
    s.parent = steps;
    steps.children.push(s);
    steps.selfClosing = false;
  }
  insertElement(section, j);
}

/** Copy an (effective) journey into another file with a new Id, as Microsoft recommends. */
export function copyJourneyXml(doc: XDocument, xml: string, newId: string): void {
  const el = parseFragment(xml);
  setAttr(el, 'Id', newId);
  const section = ensureSection(doc, el.name === 'SubJourney' ? 'SubJourneys' : 'UserJourneys');
  insertElement(section, el, undefined, true);
}

// ---------------------------------------------------------------------------------------------
// Technical profiles
// ---------------------------------------------------------------------------------------------

export function setMetadataItem(doc: XDocument, tpRef: SourceRef, key: string, value: string | null, containerOrder: readonly string[] = ORDER.TechnicalProfile): void {
  const tp = at(doc, tpRef);
  const md = child(tp, 'Metadata');
  const item = elements(md, 'Item').find((i) => attr(i, 'Key') === key);
  if (value === null) {
    if (item) removeElement(item);
    return;
  }
  if (item) {
    if (textOf(item) !== value) setText(item, value);
    return;
  }
  const container = md ?? ensureOrdered(tp, 'Metadata', containerOrder);
  insertElement(container, h('Item', { Key: key }, value));
}

export type ClaimCollection = 'InputClaims' | 'OutputClaims' | 'PersistedClaims' | 'DisplayClaims';
const ITEM_NAME: Record<ClaimCollection, string> = { InputClaims: 'InputClaim', OutputClaims: 'OutputClaim', PersistedClaims: 'PersistedClaim', DisplayClaims: 'DisplayClaim' };

export function addClaimRef(doc: XDocument, ownerRef: SourceRef, collection: ClaimCollection, attrs: Record<string, string | undefined>, order: readonly string[] = ORDER.TechnicalProfile): void {
  const owner = at(doc, ownerRef);
  const container = ensureOrdered(owner, collection, order);
  insertElement(container, h(ITEM_NAME[collection], attrs));
}

export function addReference(doc: XDocument, tpRef: SourceRef, container: 'InputClaimsTransformations' | 'OutputClaimsTransformations' | 'ValidationTechnicalProfiles', referenceId: string): void {
  const tp = at(doc, tpRef);
  const c = ensureOrdered(tp, container, ORDER.TechnicalProfile);
  const itemName = container === 'ValidationTechnicalProfiles' ? 'ValidationTechnicalProfile' : container.slice(0, -1);
  insertElement(c, h(itemName, { ReferenceId: referenceId }));
}

export function setSingleReference(doc: XDocument, tpRef: SourceRef, name: 'IncludeTechnicalProfile' | 'UseTechnicalProfileForSessionManagement', referenceId: string | null): void {
  const tp = at(doc, tpRef);
  const existing = child(tp, name);
  if (!referenceId) {
    if (existing) removeElement(existing);
    return;
  }
  if (existing) setAttr(existing, 'ReferenceId', referenceId);
  else insertOrdered(tp, h(name, { ReferenceId: referenceId }), ORDER.TechnicalProfile);
}

export function setProtocol(doc: XDocument, tpRef: SourceRef, name: string | null, handler?: string): void {
  const tp = at(doc, tpRef);
  const existing = child(tp, 'Protocol');
  if (!name) {
    if (existing) removeElement(existing);
    return;
  }
  if (existing) {
    setAttr(existing, 'Name', name);
    setAttr(existing, 'Handler', handler ?? null);
  } else insertOrdered(tp, h('Protocol', { Name: name, Handler: handler }), ORDER.TechnicalProfile);
}

export function setTpText(doc: XDocument, tpRef: SourceRef, name: string, value: string | null): void {
  setChildText(at(doc, tpRef), name, value, ORDER.TechnicalProfile);
}

/** Find a technical profile element by Id anywhere in the file. */
export function findTechnicalProfile(doc: XDocument, id: string): XElement | null {
  for (const cp of elements(child(doc.root, 'ClaimsProviders'), 'ClaimsProvider')) {
    for (const tp of elements(child(cp, 'TechnicalProfiles'), 'TechnicalProfile')) if ((attr(tp, 'Id') ?? '').toLowerCase() === id.toLowerCase()) return tp;
  }
  return null;
}

/** Create a technical profile (inside a ClaimsProvider with the given display name). */
export function addTechnicalProfile(doc: XDocument, claimsProviderName: string, tp: XElement): void {
  const cps = ensureSection(doc, 'ClaimsProviders');
  let cp = elements(cps, 'ClaimsProvider').find((c) => textOf(child(c, 'DisplayName')).trim() === claimsProviderName);
  if (!cp) {
    cp = h('ClaimsProvider', {}, h('DisplayName', {}, claimsProviderName), h('TechnicalProfiles'));
    insertElement(cps, cp);
  }
  const tps = ensureOrdered(cp, 'TechnicalProfiles', ORDER.ClaimsProvider);
  insertElement(tps, tp, undefined, true);
}

/**
 * Make sure the file contains (at least an empty) TechnicalProfile with this Id so overrides
 * can be written to it. Returns the element.
 */
export function ensureTechnicalProfileOverride(doc: XDocument, id: string, claimsProviderName: string): XElement {
  const existing = findTechnicalProfile(doc, id);
  if (existing) return existing;
  addTechnicalProfile(doc, claimsProviderName, h('TechnicalProfile', { Id: id }));
  return findTechnicalProfile(doc, id)!;
}

// ---------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------

export function addClaimType(doc: XDocument, id: string, fields: { displayName?: string; dataType?: string; userHelpText?: string; userInputType?: string } = {}): void {
  const schema = ensureSection(doc, 'ClaimsSchema');
  const ct = h('ClaimType', { Id: id }, h('DisplayName', {}, fields.displayName ?? id), h('DataType', {}, fields.dataType ?? 'string'));
  if (fields.userHelpText) {
    const u = h('UserHelpText', {}, fields.userHelpText);
    u.parent = ct;
    ct.children.push(u);
  }
  if (fields.userInputType) {
    const u = h('UserInputType', {}, fields.userInputType);
    u.parent = ct;
    ct.children.push(u);
  }
  insertElement(schema, ct);
}

export function setClaimTypeField(doc: XDocument, ref: SourceRef, name: string, value: string | null): void {
  setChildText(at(doc, ref), name, value, ORDER.ClaimType);
}

export function setEnumeration(doc: XDocument, claimRef: SourceRef, items: { text: string; value: string; selectByDefault?: boolean }[]): void {
  const ct = at(doc, claimRef);
  const restriction = child(ct, 'Restriction');
  if (restriction) for (const e of elements(restriction, 'Enumeration')) removeElement(e);
  if (!items.length) {
    if (restriction && !elements(restriction).length) removeElement(restriction);
    return;
  }
  const r = restriction ?? insertOrdered(ct, h('Restriction'), ORDER.ClaimType);
  const pattern = child(r, 'Pattern');
  if (pattern) removeElement(pattern);
  for (const it of items) insertElement(r, h('Enumeration', { Text: it.text, Value: it.value, SelectByDefault: it.selectByDefault ? 'true' : undefined }));
}

export function addClaimsTransformation(doc: XDocument, id: string, method: string, inputs: { claim: string; tct: string }[], params: { id: string; dataType: string; value: string }[], outputs: { claim: string; tct: string }[]): void {
  const section = ensureSection(doc, 'ClaimsTransformations');
  const ct = h('ClaimsTransformation', { Id: id, TransformationMethod: method });
  const add = (parent: XElement, el: XElement) => {
    el.parent = parent;
    parent.children.push(el);
    parent.selfClosing = false;
  };
  if (inputs.length) {
    const ic = h('InputClaims');
    for (const i of inputs) add(ic, h('InputClaim', { ClaimTypeReferenceId: i.claim, TransformationClaimType: i.tct }));
    add(ct, ic);
  }
  if (params.length) {
    const ip = h('InputParameters');
    for (const p of params) add(ip, h('InputParameter', { Id: p.id, DataType: p.dataType, Value: p.value }));
    add(ct, ip);
  }
  if (outputs.length) {
    const oc = h('OutputClaims');
    for (const o of outputs) add(oc, h('OutputClaim', { ClaimTypeReferenceId: o.claim, TransformationClaimType: o.tct }));
    add(ct, oc);
  }
  insertElement(section, ct);
}

export function setInputParameter(doc: XDocument, ctRef: SourceRef, id: string, dataType: string, value: string | null): void {
  const ct = at(doc, ctRef);
  const ip = child(ct, 'InputParameters');
  const p = elements(ip, 'InputParameter').find((x) => (attr(x, 'Id') ?? '').toLowerCase() === id.toLowerCase());
  if (value === null) {
    if (p) removeElement(p);
    return;
  }
  if (p) {
    setAttr(p, 'Value', value);
    if (!attr(p, 'DataType')) setAttr(p, 'DataType', dataType);
    return;
  }
  const container = ip ?? ensureOrdered(ct, 'InputParameters', ORDER.ClaimsTransformation);
  insertElement(container, h('InputParameter', { Id: id, DataType: dataType, Value: value }));
}

export function setTransformationClaim(doc: XDocument, ctRef: SourceRef, collection: 'InputClaims' | 'OutputClaims', tct: string, claim: string | null): void {
  const ct = at(doc, ctRef);
  const c = child(ct, collection);
  const itemName = collection === 'InputClaims' ? 'InputClaim' : 'OutputClaim';
  const item = elements(c, itemName).find((x) => (attr(x, 'TransformationClaimType') ?? '').toLowerCase() === tct.toLowerCase());
  if (!claim) {
    if (item) removeElement(item);
    return;
  }
  if (item) {
    setAttr(item, 'ClaimTypeReferenceId', claim);
    return;
  }
  const container = c ?? ensureOrdered(ct, collection, ORDER.ClaimsTransformation);
  insertElement(container, h(itemName, { ClaimTypeReferenceId: claim, TransformationClaimType: tct }));
}

export function addContentDefinition(doc: XDocument, id: string, dataUri: string, loadUri: string): void {
  const section = ensureSection(doc, 'ContentDefinitions');
  insertElement(section, h('ContentDefinition', { Id: id }, h('LoadUri', {}, loadUri), h('RecoveryUri', {}, '~/common/default_page_error.html'), h('DataUri', {}, dataUri), h('Metadata', {}, h('Item', { Key: 'DisplayName' }, id))));
}

// ---------------------------------------------------------------------------------------------
// Refactoring: rename across files
// ---------------------------------------------------------------------------------------------

export type RenameKind = 'claim' | 'technicalProfile' | 'transformation' | 'contentDefinition' | 'journey' | 'displayControl';

const RENAME_ATTRS: Record<RenameKind, { def: [string, string][]; refs: [string, string][]; metadataKeys?: string[] }> = {
  claim: {
    def: [['ClaimType', 'Id']],
    refs: [['*', 'ClaimTypeReferenceId'], ['SubjectNamingInfo', 'ClaimType']],
    metadataKeys: ['ClaimTypeOnWhichToEnable', 'IpAddressClaimReferenceId', 'issuer_refresh_token_user_identity_claim_type', 'ClaimUsedForRequestPayload', 'UseClaimAsBearerToken'],
  },
  technicalProfile: {
    def: [['TechnicalProfile', 'Id']],
    refs: [
      ['*', 'TechnicalProfileReferenceId'],
      ['ValidationTechnicalProfile', 'ReferenceId'],
      ['IncludeTechnicalProfile', 'ReferenceId'],
      ['UseTechnicalProfileForSessionManagement', 'ReferenceId'],
      ['AuthorizationTechnicalProfile', 'ReferenceId'],
      ['OrchestrationStep', 'CpimIssuerTechnicalProfileReferenceId'],
      ['UserJourney', 'DefaultCpimIssuerTechnicalProfileReferenceId'],
      ['SubJourney', 'DefaultCpimIssuerTechnicalProfileReferenceId'],
    ],
  },
  transformation: {
    def: [['ClaimsTransformation', 'Id']],
    refs: [['InputClaimsTransformation', 'ReferenceId'], ['OutputClaimsTransformation', 'ReferenceId']],
  },
  contentDefinition: {
    def: [['ContentDefinition', 'Id']],
    refs: [['OrchestrationStep', 'ContentDefinitionReferenceId']],
    metadataKeys: ['ContentDefinitionReferenceId'],
  },
  journey: {
    def: [['UserJourney', 'Id'], ['SubJourney', 'Id']],
    refs: [['DefaultUserJourney', 'ReferenceId'], ['Endpoint', 'UserJourneyReferenceId'], ['Candidate', 'SubJourneyReferenceId']],
  },
  displayControl: {
    def: [['DisplayControl', 'Id']],
    refs: [['DisplayClaim', 'DisplayControlReferenceId']],
  },
};

/** Rename an identifier and every reference to it in this document. Returns the number of changes. */
export function renameInDocument(doc: XDocument, kind: RenameKind, from: string, to: string): number {
  const spec = RENAME_ATTRS[kind];
  const f = from.toLowerCase();
  let n = 0;
  const visit = (el: XElement) => {
    for (const [en, an] of [...spec.def, ...spec.refs]) {
      if (en !== '*' && en !== el.name) continue;
      const v = attr(el, an);
      if (v !== undefined && v.toLowerCase() === f) {
        setAttr(el, an, to);
        n++;
      }
    }
    if (kind === 'claim' && el.name === 'Precondition') {
      const first = elements(el, 'Value')[0];
      if (first && textOf(first).trim().toLowerCase() === f) {
        setText(first, to);
        n++;
      }
    }
    if (spec.metadataKeys && el.name === 'Item' && spec.metadataKeys.includes(attr(el, 'Key') ?? '') && textOf(el).trim().toLowerCase() === f) {
      setText(el, to);
      n++;
    }
    for (const c of el.children) if (c.kind === 'element') visit(c);
  };
  visit(doc.root);
  return n;
}

/** Count references (excluding definitions) in a document. */
export function countReferences(doc: XDocument, kind: RenameKind, id: string): number {
  const spec = RENAME_ATTRS[kind];
  const f = id.toLowerCase();
  let n = 0;
  const visit = (el: XElement) => {
    for (const [en, an] of spec.refs) {
      if (en !== '*' && en !== el.name) continue;
      if ((attr(el, an) ?? '').toLowerCase() === f) n++;
    }
    if (kind === 'claim' && el.name === 'Precondition' && textOf(elements(el, 'Value')[0]).trim().toLowerCase() === f) n++;
    for (const c of el.children) if (c.kind === 'element') visit(c);
  };
  visit(doc.root);
  return n;
}

/** Replace placeholder tenant names and IEF application ids across a document's text. */
export function replaceTenantText(text: string, tenant: string, iefAppId?: string, proxyAppId?: string): string {
  let t = text.replace(/yourtenant\.onmicrosoft\.com/gi, tenant).replace(/yourtenant/gi, tenant.replace(/\.onmicrosoft\.com$/i, ''));
  if (proxyAppId) t = t.replace(/\bProxyIdentityExperienceFrameworkAppId\b/g, proxyAppId);
  if (iefAppId) t = t.replace(/(?<!Proxy)\bIdentityExperienceFrameworkAppId\b/g, iefAppId);
  return t;
}
