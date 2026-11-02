import { classifyTechnicalProfile, TpKind } from '../catalog/technical-profiles';
import {
  ClaimRef,
  ClaimTypeDef,
  ClaimsTransformationDef,
  ContentDefinitionDef,
  DisplayControlDef,
  idKey,
  KeyValue,
  LocalizedResourcesDef,
  OrchestrationStepDef,
  PolicyDoc,
  PredicateDef,
  PredicateValidationDef,
  RelyingPartyDef,
  SourceRef,
  TechnicalProfileDef,
  UserJourneyDef,
} from '../model/types';

export const MAX_INHERITANCE_DEPTH = 10;

export interface PolicyChain {
  /** The most derived file of the chain. */
  leaf: PolicyDoc;
  /** Files of the chain, base first. */
  docs: PolicyDoc[];
  problems: { kind: 'missingBase' | 'cycle' | 'tooDeep'; doc: PolicyDoc; detail: string }[];
}

/** Build one chain per file that is not used as a base by another file. */
export function buildChains(docs: PolicyDoc[]): PolicyChain[] {
  const byId = new Map<string, PolicyDoc>();
  for (const d of docs) if (d.policyId) byId.set(idKey(d.policyId), d);
  const usedAsBase = new Set<string>();
  for (const d of docs) if (d.basePolicy?.policyId) usedAsBase.add(idKey(d.basePolicy.policyId));
  const leaves = docs.filter((d) => !d.policyId || !usedAsBase.has(idKey(d.policyId)));
  return leaves.map((leaf) => chainFor(leaf, byId));
}

export function chainFor(leaf: PolicyDoc, byId: Map<string, PolicyDoc>): PolicyChain {
  const problems: PolicyChain['problems'] = [];
  const list: PolicyDoc[] = [leaf];
  const seen = new Set<string>([leaf.fileId]);
  let cur = leaf;
  while (cur.basePolicy?.policyId) {
    const base = byId.get(idKey(cur.basePolicy.policyId));
    if (!base) {
      problems.push({ kind: 'missingBase', doc: cur, detail: cur.basePolicy.policyId });
      break;
    }
    if (seen.has(base.fileId)) {
      problems.push({ kind: 'cycle', doc: cur, detail: base.policyId ?? base.fileName });
      break;
    }
    seen.add(base.fileId);
    list.push(base);
    cur = base;
  }
  if (list.length > MAX_INHERITANCE_DEPTH) {
    problems.push({ kind: 'tooDeep', doc: leaf, detail: String(list.length) });
  }
  return { leaf, docs: list.reverse(), problems };
}

export interface Effective<T> {
  id: string;
  value: T;
  /** All definitions contributing to this element, base first. */
  layers: T[];
}

export interface FlatTechnicalProfile extends TechnicalProfileDef {
  kind: TpKind;
  /** Ids of included technical profiles, nearest first. */
  includeChain: string[];
  /** Refs of every element (layer overrides and includes) that contributed. */
  contributors: SourceRef[];
}

export interface EffectivePolicy {
  chain: PolicyChain;
  claimTypes: Map<string, Effective<ClaimTypeDef>>;
  claimsTransformations: Map<string, Effective<ClaimsTransformationDef>>;
  contentDefinitions: Map<string, Effective<ContentDefinitionDef>>;
  displayControls: Map<string, Effective<DisplayControlDef>>;
  predicates: Map<string, Effective<PredicateDef>>;
  predicateValidations: Map<string, Effective<PredicateValidationDef>>;
  localizedResources: Map<string, Effective<LocalizedResourcesDef>>;
  supportedLanguages: string[];
  defaultLanguage?: string;
  technicalProfiles: Map<string, Effective<TechnicalProfileDef>>;
  userJourneys: Map<string, Effective<UserJourneyDef>>;
  subJourneys: Map<string, Effective<UserJourneyDef>>;
  relyingParty?: RelyingPartyDef;
  /** Resolve a technical profile, including IncludeTechnicalProfile chains. Cached. */
  tp(id: string): FlatTechnicalProfile | undefined;
  claimType(id: string): ClaimTypeDef | undefined;
}

// ---------------------------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------------------------

function pick<T>(a: T | undefined, b: T | undefined): T | undefined {
  return b !== undefined ? b : a;
}

export function mergeByKey<T>(base: readonly T[], over: readonly T[], key: (t: T) => string, merge: (a: T, b: T) => T): T[] {
  const out = [...base];
  for (const o of over) {
    const k = key(o);
    const i = out.findIndex((x) => key(x) === k);
    if (i >= 0) out[i] = merge(out[i], o);
    else out.push(o);
  }
  return out;
}

const replace = <T>(_a: T, b: T) => b;

function mergeClaimRef(a: ClaimRef, b: ClaimRef): ClaimRef {
  return {
    claimTypeReferenceId: b.claimTypeReferenceId,
    partnerClaimType: pick(a.partnerClaimType, b.partnerClaimType),
    defaultValue: pick(a.defaultValue, b.defaultValue),
    alwaysUseDefaultValue: pick(a.alwaysUseDefaultValue, b.alwaysUseDefaultValue),
    required: pick(a.required, b.required),
    ref: b.ref,
  };
}

const claimKey = (c: { claimTypeReferenceId?: string; displayControlReferenceId?: string }) =>
  idKey(c.claimTypeReferenceId ?? 'dc:' + (c.displayControlReferenceId ?? ''));
const kvKey = (k: KeyValue) => k.key;

export function mergeTechnicalProfile(a: TechnicalProfileDef, b: TechnicalProfileDef): TechnicalProfileDef {
  return {
    id: b.id || a.id,
    claimsProvider: b.claimsProvider || a.claimsProvider,
    ref: b.ref,
    displayName: pick(a.displayName, b.displayName),
    description: pick(a.description, b.description),
    protocol: pick(a.protocol, b.protocol),
    inputTokenFormat: pick(a.inputTokenFormat, b.inputTokenFormat),
    outputTokenFormat: pick(a.outputTokenFormat, b.outputTokenFormat),
    metadata: mergeByKey(a.metadata, b.metadata, kvKey, replace),
    cryptographicKeys: mergeByKey(a.cryptographicKeys, b.cryptographicKeys, (k) => k.id ?? k.storageReferenceId, replace),
    inputClaimsTransformations: mergeByKey(a.inputClaimsTransformations, b.inputClaimsTransformations, (t) => idKey(t.referenceId), replace),
    inputClaims: mergeByKey(a.inputClaims, b.inputClaims, claimKey, mergeClaimRef),
    persistedClaims: mergeByKey(a.persistedClaims, b.persistedClaims, claimKey, mergeClaimRef),
    displayClaims: mergeByKey(a.displayClaims, b.displayClaims, claimKey, replace),
    outputClaims: mergeByKey(a.outputClaims, b.outputClaims, claimKey, mergeClaimRef),
    outputClaimsTransformations: mergeByKey(a.outputClaimsTransformations, b.outputClaimsTransformations, (t) => idKey(t.referenceId), replace),
    validationTechnicalProfiles: mergeByKey(a.validationTechnicalProfiles, b.validationTechnicalProfiles, (v) => idKey(v.referenceId), replace),
    subjectNamingInfo: pick(a.subjectNamingInfo, b.subjectNamingInfo),
    includeInSso: pick(a.includeInSso, b.includeInSso),
    includeClaimsFromTechnicalProfile: pick(a.includeClaimsFromTechnicalProfile, b.includeClaimsFromTechnicalProfile),
    includeTechnicalProfile: pick(a.includeTechnicalProfile, b.includeTechnicalProfile),
    useTechnicalProfileForSessionManagement: pick(a.useTechnicalProfileForSessionManagement, b.useTechnicalProfileForSessionManagement),
    enabledForUserJourneys: pick(a.enabledForUserJourneys, b.enabledForUserJourneys),
  };
}

function mergeClaimType(a: ClaimTypeDef, b: ClaimTypeDef): ClaimTypeDef {
  return {
    id: b.id,
    ref: b.ref,
    displayName: pick(a.displayName, b.displayName),
    dataType: pick(a.dataType, b.dataType),
    userInputType: pick(a.userInputType, b.userInputType),
    userHelpText: pick(a.userHelpText, b.userHelpText),
    adminHelpText: pick(a.adminHelpText, b.adminHelpText),
    mask: pick(a.mask, b.mask),
    predicateValidationReference: pick(a.predicateValidationReference, b.predicateValidationReference),
    restriction:
      b.restriction && a.restriction && b.restriction.mergeBehavior && b.restriction.mergeBehavior !== 'ReplaceAll'
        ? {
            ...b.restriction,
            enumeration:
              b.restriction.mergeBehavior === 'Prepend'
                ? [...b.restriction.enumeration, ...a.restriction.enumeration]
                : [...a.restriction.enumeration, ...b.restriction.enumeration],
          }
        : pick(a.restriction, b.restriction),
    defaultPartnerClaimTypes: mergeByKey(a.defaultPartnerClaimTypes, b.defaultPartnerClaimTypes, (p) => p.protocol, replace),
  };
}

function mergeContentDefinition(a: ContentDefinitionDef, b: ContentDefinitionDef): ContentDefinitionDef {
  return {
    id: b.id,
    ref: b.ref,
    loadUri: pick(a.loadUri, b.loadUri),
    recoveryUri: pick(a.recoveryUri, b.recoveryUri),
    dataUri: pick(a.dataUri, b.dataUri),
    metadata: mergeByKey(a.metadata, b.metadata, kvKey, replace),
    localizedResourcesReferences: mergeByKey(a.localizedResourcesReferences, b.localizedResourcesReferences, (r) => r.language.toLowerCase(), replace),
  };
}

function mergeStep(a: OrchestrationStepDef, b: OrchestrationStepDef): OrchestrationStepDef {
  return {
    order: b.order,
    orderText: b.orderText,
    type: b.type || a.type,
    ref: b.ref,
    contentDefinitionReferenceId: pick(a.contentDefinitionReferenceId, b.contentDefinitionReferenceId),
    cpimIssuerTechnicalProfileReferenceId: pick(a.cpimIssuerTechnicalProfileReferenceId, b.cpimIssuerTechnicalProfileReferenceId),
    preconditions: b.hasPreconditions ? b.preconditions : a.preconditions,
    hasPreconditions: a.hasPreconditions || b.hasPreconditions,
    selectionDisplayOption: pick(a.selectionDisplayOption, b.selectionDisplayOption),
    claimsProviderSelections: mergeByKey(
      a.claimsProviderSelections,
      b.claimsProviderSelections,
      (s) => idKey(s.targetClaimsExchangeId ?? 'v:' + s.validationClaimsExchangeId),
      replace,
    ),
    claimsExchanges: mergeByKey(a.claimsExchanges, b.claimsExchanges, (x) => idKey(x.id), replace),
    journeyCandidates: b.journeyCandidates.length ? b.journeyCandidates : a.journeyCandidates,
  };
}

function mergeJourney(a: UserJourneyDef, b: UserJourneyDef): UserJourneyDef {
  const steps = mergeByKey(a.steps, b.steps, (s) => s.orderText.trim(), mergeStep);
  steps.sort((x, y) => (Number.isNaN(x.order) ? 1e9 : x.order) - (Number.isNaN(y.order) ? 1e9 : y.order));
  return {
    id: b.id,
    kind: b.kind,
    ref: b.ref,
    subJourneyType: pick(a.subJourneyType, b.subJourneyType),
    defaultCpimIssuerTechnicalProfileReferenceId: pick(a.defaultCpimIssuerTechnicalProfileReferenceId, b.defaultCpimIssuerTechnicalProfileReferenceId),
    authorizationTechnicalProfiles: b.authorizationTechnicalProfiles.length ? b.authorizationTechnicalProfiles : a.authorizationTechnicalProfiles,
    steps,
  };
}

function mergeLocalizedResources(a: LocalizedResourcesDef, b: LocalizedResourcesDef): LocalizedResourcesDef {
  return {
    id: b.id,
    ref: b.ref,
    strings: mergeByKey(a.strings, b.strings, (s) => `${s.elementType}|${s.elementId ?? ''}|${s.stringId ?? ''}`.toLowerCase(), replace),
    collections: mergeByKey(a.collections, b.collections, (c) => `${c.elementType}|${c.elementId}|${c.targetCollection}`.toLowerCase(), replace),
  };
}

function collect<T extends { id: string }>(
  docs: PolicyDoc[],
  get: (d: PolicyDoc) => readonly T[],
  merge: (a: T, b: T) => T,
): Map<string, Effective<T>> {
  const map = new Map<string, Effective<T>>();
  for (const d of docs) {
    for (const item of get(d)) {
      const k = idKey(item.id);
      const existing = map.get(k);
      if (existing) {
        existing.value = merge(existing.value, item);
        existing.layers.push(item);
      } else {
        map.set(k, { id: item.id, value: item, layers: [item] });
      }
    }
  }
  return map;
}

export function resolveChain(chain: PolicyChain): EffectivePolicy {
  const docs = chain.docs;
  const technicalProfiles = collect(
    docs,
    (d) => d.claimsProviders.flatMap((cp) => cp.technicalProfiles),
    mergeTechnicalProfile,
  );
  const claimTypes = collect(docs, (d) => d.claimTypes, mergeClaimType);
  let relyingParty: RelyingPartyDef | undefined;
  for (const d of docs) if (d.relyingParty) relyingParty = d.relyingParty;

  const supported: string[] = [];
  let defaultLanguage: string | undefined;
  for (const d of docs) {
    if (!d.localization) continue;
    if (d.localization.defaultLanguage) defaultLanguage = d.localization.defaultLanguage;
    if (d.localization.mergeBehavior === 'ReplaceAll') supported.length = 0;
    for (const l of d.localization.supportedLanguages) if (!supported.includes(l)) supported.push(l);
  }

  const cache = new Map<string, FlatTechnicalProfile | null>();
  const tp = (id: string): FlatTechnicalProfile | undefined => {
    const k = idKey(id);
    if (cache.has(k)) return cache.get(k) ?? undefined;
    cache.set(k, null); // cycle guard
    const eff = technicalProfiles.get(k);
    if (!eff) return undefined;
    let merged: TechnicalProfileDef = eff.value;
    let includeChain: string[] = [];
    const contributors: SourceRef[] = eff.layers.map((l) => l.ref);
    const incId = eff.value.includeTechnicalProfile?.referenceId;
    if (incId) {
      const base = tp(incId);
      if (base) {
        merged = mergeTechnicalProfile(base, eff.value);
        merged = { ...merged, id: eff.value.id, claimsProvider: eff.value.claimsProvider, ref: eff.value.ref };
        includeChain = [base.id, ...base.includeChain];
        contributors.push(...base.contributors);
      }
    }
    const flat: FlatTechnicalProfile = { ...merged, kind: classifyTechnicalProfile(merged), includeChain, contributors };
    cache.set(k, flat);
    return flat;
  };

  return {
    chain,
    claimTypes,
    claimsTransformations: collect(docs, (d) => d.claimsTransformations, replace),
    contentDefinitions: collect(docs, (d) => d.contentDefinitions, mergeContentDefinition),
    displayControls: collect(docs, (d) => d.displayControls, replace),
    predicates: collect(docs, (d) => d.predicates, replace),
    predicateValidations: collect(docs, (d) => d.predicateValidations, replace),
    localizedResources: collect(docs, (d) => d.localization?.resources ?? [], mergeLocalizedResources),
    supportedLanguages: supported,
    defaultLanguage,
    technicalProfiles,
    userJourneys: collect(docs, (d) => d.userJourneys, mergeJourney),
    subJourneys: collect(docs, (d) => d.subJourneys, mergeJourney),
    relyingParty,
    tp,
    claimType: (id: string) => claimTypes.get(idKey(id))?.value,
  };
}

/** Which file in the chain an element ref belongs to, as a short layer label. */
export function layerLabel(chain: PolicyChain, fileId: string): string {
  const idx = chain.docs.findIndex((d) => d.fileId === fileId);
  if (idx < 0) return '?';
  const d = chain.docs[idx];
  const name = (d.policyId ?? d.fileName).replace(/^B2C_1A_/i, '');
  if (/base$/i.test(name)) return 'Base';
  if (/locali[sz]ation$/i.test(name)) return 'Localization';
  if (/extensions?$/i.test(name)) return 'Extensions';
  if (d.relyingParty) return 'RP';
  return name;
}
