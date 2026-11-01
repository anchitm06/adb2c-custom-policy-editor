import { attr, child, childText, elements, pathOf, textOf, XDocument, XElement } from '../xml/xml';
import {
  ClaimRef,
  ClaimTypeDef,
  ClaimsProviderDef,
  ClaimsTransformationDef,
  ContentDefinitionDef,
  DisplayClaimRef,
  DisplayControlDef,
  KeyValue,
  LocalizationDef,
  OrchestrationStepDef,
  PolicyDoc,
  Precondition,
  PredicateDef,
  PredicateValidationDef,
  RelyingPartyDef,
  SectionName,
  SourceRef,
  TechnicalProfileDef,
  UserJourneyDef,
} from '../model/types';

function boolAttr(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return v.trim().toLowerCase() === 'true';
}

class Ctx {
  constructor(readonly fileId: string) {}
  ref(el: XElement): SourceRef {
    return { fileId: this.fileId, path: pathOf(el), line: el.line };
  }
}

export function parsePolicy(fileId: string, fileName: string, doc: XDocument): PolicyDoc {
  const c = new Ctx(fileId);
  const root = doc.root;
  const sections: PolicyDoc['sections'] = {};
  const sec = (name: SectionName, el: XElement | null) => {
    if (el) sections[name] = c.ref(el);
    return el;
  };

  const bb = sec('BuildingBlocks', child(root, 'BuildingBlocks'));
  const claimsSchema = sec('ClaimsSchema', child(bb, 'ClaimsSchema'));
  const cts = sec('ClaimsTransformations', child(bb, 'ClaimsTransformations'));
  const cds = sec('ContentDefinitions', child(bb, 'ContentDefinitions'));
  const loc = sec('Localization', child(bb, 'Localization'));
  const dcs = sec('DisplayControls', child(bb, 'DisplayControls'));
  const preds = sec('Predicates', child(bb, 'Predicates'));
  const pvs = sec('PredicateValidations', child(bb, 'PredicateValidations'));
  const cps = sec('ClaimsProviders', child(root, 'ClaimsProviders'));
  const ujs = sec('UserJourneys', child(root, 'UserJourneys'));
  const sjs = sec('SubJourneys', child(root, 'SubJourneys'));
  const rp = sec('RelyingParty', child(root, 'RelyingParty'));

  const base = child(root, 'BasePolicy');

  return {
    fileId,
    fileName,
    rootRef: c.ref(root),
    rootName: root.name,
    policyId: attr(root, 'PolicyId'),
    tenantId: attr(root, 'TenantId'),
    publicPolicyUri: attr(root, 'PublicPolicyUri'),
    policySchemaVersion: attr(root, 'PolicySchemaVersion'),
    deploymentMode: attr(root, 'DeploymentMode'),
    basePolicy: base
      ? { tenantId: childText(base, 'TenantId'), policyId: childText(base, 'PolicyId'), ref: c.ref(base) }
      : undefined,
    claimTypes: elements(claimsSchema, 'ClaimType').map((e) => parseClaimType(c, e)),
    claimsTransformations: elements(cts, 'ClaimsTransformation').map((e) => parseClaimsTransformation(c, e)),
    contentDefinitions: elements(cds, 'ContentDefinition').map((e) => parseContentDefinition(c, e)),
    localization: loc ? parseLocalization(c, loc) : undefined,
    displayControls: elements(dcs, 'DisplayControl').map((e) => parseDisplayControl(c, e)),
    predicates: elements(preds, 'Predicate').map((e) => parsePredicate(c, e)),
    predicateValidations: elements(pvs, 'PredicateValidation').map((e) => parsePredicateValidation(c, e)),
    claimsProviders: elements(cps, 'ClaimsProvider').map((e) => parseClaimsProvider(c, e)),
    userJourneys: elements(ujs, 'UserJourney').map((e) => parseJourney(c, e, 'UserJourney')),
    subJourneys: elements(sjs, 'SubJourney').map((e) => parseJourney(c, e, 'SubJourney')),
    relyingParty: rp ? parseRelyingParty(c, rp) : undefined,
    sections,
  };
}

function metadata(c: Ctx, el: XElement | null): KeyValue[] {
  return elements(el, 'Item').map((i) => ({ key: attr(i, 'Key') ?? '', value: textOf(i).trim(), ref: c.ref(i) }));
}

function parseClaimType(c: Ctx, e: XElement): ClaimTypeDef {
  const restriction = child(e, 'Restriction');
  const mask = child(e, 'Mask');
  const pattern = child(restriction, 'Pattern');
  return {
    id: attr(e, 'Id') ?? '',
    ref: c.ref(e),
    displayName: childText(e, 'DisplayName'),
    dataType: childText(e, 'DataType'),
    userInputType: childText(e, 'UserInputType'),
    userHelpText: childText(e, 'UserHelpText'),
    adminHelpText: childText(e, 'AdminHelpText'),
    mask: mask ? { type: attr(mask, 'Type'), value: textOf(mask).trim() } : undefined,
    predicateValidationReference: attr(child(e, 'PredicateValidationReference'), 'Id'),
    restriction: restriction
      ? {
          mergeBehavior: attr(restriction, 'MergeBehavior'),
          enumeration: elements(restriction, 'Enumeration').map((en) => ({
            text: attr(en, 'Text') ?? '',
            value: attr(en, 'Value') ?? '',
            selectByDefault: boolAttr(attr(en, 'SelectByDefault')),
            ref: c.ref(en),
          })),
          pattern: pattern
            ? { regularExpression: attr(pattern, 'RegularExpression'), helpText: attr(pattern, 'HelpText') }
            : undefined,
        }
      : undefined,
    defaultPartnerClaimTypes: elements(child(e, 'DefaultPartnerClaimTypes'), 'Protocol').map((p) => ({
      protocol: attr(p, 'Name') ?? '',
      partnerClaimType: attr(p, 'PartnerClaimType') ?? '',
    })),
  };
}

function parseClaimsTransformation(c: Ctx, e: XElement): ClaimsTransformationDef {
  const tc = (container: XElement | null, name: string) =>
    elements(container, name).map((x) => ({
      claimTypeReferenceId: attr(x, 'ClaimTypeReferenceId') ?? '',
      transformationClaimType: attr(x, 'TransformationClaimType'),
      ref: c.ref(x),
    }));
  return {
    id: attr(e, 'Id') ?? '',
    method: attr(e, 'TransformationMethod'),
    ref: c.ref(e),
    inputClaims: tc(child(e, 'InputClaims'), 'InputClaim'),
    inputParameters: elements(child(e, 'InputParameters'), 'InputParameter').map((p) => ({
      id: attr(p, 'Id') ?? '',
      dataType: attr(p, 'DataType'),
      value: attr(p, 'Value'),
      ref: c.ref(p),
    })),
    outputClaims: tc(child(e, 'OutputClaims'), 'OutputClaim'),
  };
}

function parseContentDefinition(c: Ctx, e: XElement): ContentDefinitionDef {
  return {
    id: attr(e, 'Id') ?? '',
    ref: c.ref(e),
    loadUri: childText(e, 'LoadUri'),
    recoveryUri: childText(e, 'RecoveryUri'),
    dataUri: childText(e, 'DataUri'),
    metadata: metadata(c, child(e, 'Metadata')),
    localizedResourcesReferences: elements(child(e, 'LocalizedResourcesReferences'), 'LocalizedResourcesReference').map(
      (r) => ({
        language: attr(r, 'Language') ?? '',
        localizedResourcesReferenceId: attr(r, 'LocalizedResourcesReferenceId') ?? '',
        ref: c.ref(r),
      }),
    ),
  };
}

function parseLocalization(c: Ctx, e: XElement): LocalizationDef {
  const sl = child(e, 'SupportedLanguages');
  return {
    ref: c.ref(e),
    enabled: attr(e, 'Enabled'),
    defaultLanguage: attr(sl, 'DefaultLanguage'),
    mergeBehavior: attr(sl, 'MergeBehavior'),
    supportedLanguages: elements(sl, 'SupportedLanguage').map((l) => textOf(l).trim()),
    resources: elements(e, 'LocalizedResources').map((r) => ({
      id: attr(r, 'Id') ?? '',
      ref: c.ref(r),
      strings: elements(child(r, 'LocalizedStrings'), 'LocalizedString').map((s) => ({
        elementType: attr(s, 'ElementType'),
        elementId: attr(s, 'ElementId'),
        stringId: attr(s, 'StringId'),
        value: textOf(s),
        ref: c.ref(s),
      })),
      collections: elements(child(r, 'LocalizedCollections'), 'LocalizedCollection').map((col) => ({
        elementType: attr(col, 'ElementType'),
        elementId: attr(col, 'ElementId'),
        targetCollection: attr(col, 'TargetCollection'),
        items: elements(col, 'Item').map((i) => ({ text: attr(i, 'Text') ?? '', value: attr(i, 'Value') ?? '' })),
        ref: c.ref(col),
      })),
    })),
  };
}

function claimRefs(c: Ctx, container: XElement | null, name: string): ClaimRef[] {
  return elements(container, name).map((x) => ({
    claimTypeReferenceId: attr(x, 'ClaimTypeReferenceId') ?? '',
    partnerClaimType: attr(x, 'PartnerClaimType'),
    defaultValue: attr(x, 'DefaultValue'),
    alwaysUseDefaultValue: boolAttr(attr(x, 'AlwaysUseDefaultValue')),
    required: boolAttr(attr(x, 'Required')),
    ref: c.ref(x),
  }));
}

function displayClaims(c: Ctx, container: XElement | null): DisplayClaimRef[] {
  return elements(container, 'DisplayClaim').map((x) => ({
    claimTypeReferenceId: attr(x, 'ClaimTypeReferenceId'),
    displayControlReferenceId: attr(x, 'DisplayControlReferenceId'),
    required: boolAttr(attr(x, 'Required')),
    ref: c.ref(x),
  }));
}

function parseDisplayControl(c: Ctx, e: XElement): DisplayControlDef {
  return {
    id: attr(e, 'Id') ?? '',
    ref: c.ref(e),
    userInterfaceControlType: attr(e, 'UserInterfaceControlType'),
    inputClaims: claimRefs(c, child(e, 'InputClaims'), 'InputClaim'),
    displayClaims: displayClaims(c, child(e, 'DisplayClaims')),
    outputClaims: claimRefs(c, child(e, 'OutputClaims'), 'OutputClaim'),
    actions: elements(child(e, 'Actions'), 'Action').map((a) => ({
      id: attr(a, 'Id') ?? '',
      ref: c.ref(a),
      validationClaimsExchangeTechnicalProfiles: elements(
        child(a, 'ValidationClaimsExchange'),
        'ValidationClaimsExchangeTechnicalProfile',
      ).map((v) => attr(v, 'TechnicalProfileReferenceId') ?? ''),
    })),
  };
}

function parsePredicate(c: Ctx, e: XElement): PredicateDef {
  return {
    id: attr(e, 'Id') ?? '',
    method: attr(e, 'Method'),
    helpText: attr(e, 'HelpText') ?? childText(e, 'UserHelpText'),
    ref: c.ref(e),
    parameters: elements(child(e, 'Parameters'), 'Parameter').map((p) => ({
      id: attr(p, 'Id') ?? '',
      value: textOf(p).trim(),
      ref: c.ref(p),
    })),
  };
}

function parsePredicateValidation(c: Ctx, e: XElement): PredicateValidationDef {
  return {
    id: attr(e, 'Id') ?? '',
    ref: c.ref(e),
    groups: elements(child(e, 'PredicateGroups'), 'PredicateGroup').map((g) => {
      const refs = child(g, 'PredicateReferences');
      return {
        id: attr(g, 'Id') ?? '',
        userHelpText: childText(g, 'UserHelpText'),
        matchAtLeast: attr(refs, 'MatchAtLeast'),
        predicateReferences: elements(refs, 'PredicateReference').map((r) => attr(r, 'Id') ?? ''),
        ref: c.ref(g),
      };
    }),
  };
}

export function parsePreconditions(c: { ref(el: XElement): SourceRef }, container: XElement | null): Precondition[] {
  return elements(container, 'Precondition').map((p) => ({
    type: attr(p, 'Type') ?? '',
    executeActionsIf: attr(p, 'ExecuteActionsIf') ?? '',
    values: elements(p, 'Value').map((v) => textOf(v).trim()),
    action: childText(p, 'Action'),
    ref: c.ref(p),
  }));
}

function parseTechnicalProfile(c: Ctx, e: XElement, claimsProvider: string): TechnicalProfileDef {
  const protocol = child(e, 'Protocol');
  const include = child(e, 'IncludeTechnicalProfile');
  const sm = child(e, 'UseTechnicalProfileForSessionManagement');
  const sni = child(e, 'SubjectNamingInfo');
  const icfp = child(e, 'IncludeClaimsFromTechnicalProfile');
  return {
    id: attr(e, 'Id') ?? '',
    claimsProvider,
    ref: c.ref(e),
    displayName: childText(e, 'DisplayName'),
    description: childText(e, 'Description'),
    protocol: protocol ? { name: attr(protocol, 'Name') ?? '', handler: attr(protocol, 'Handler') } : undefined,
    inputTokenFormat: childText(e, 'InputTokenFormat'),
    outputTokenFormat: childText(e, 'OutputTokenFormat'),
    metadata: metadata(c, child(e, 'Metadata')),
    cryptographicKeys: elements(child(e, 'CryptographicKeys'), 'Key').map((k) => ({
      id: attr(k, 'Id'),
      storageReferenceId: attr(k, 'StorageReferenceId') ?? '',
      ref: c.ref(k),
    })),
    inputClaimsTransformations: elements(child(e, 'InputClaimsTransformations'), 'InputClaimsTransformation').map(
      (t) => ({ referenceId: attr(t, 'ReferenceId') ?? '', ref: c.ref(t) }),
    ),
    inputClaims: claimRefs(c, child(e, 'InputClaims'), 'InputClaim'),
    persistedClaims: claimRefs(c, child(e, 'PersistedClaims'), 'PersistedClaim'),
    displayClaims: displayClaims(c, child(e, 'DisplayClaims')),
    outputClaims: claimRefs(c, child(e, 'OutputClaims'), 'OutputClaim'),
    outputClaimsTransformations: elements(child(e, 'OutputClaimsTransformations'), 'OutputClaimsTransformation').map(
      (t) => ({ referenceId: attr(t, 'ReferenceId') ?? '', ref: c.ref(t) }),
    ),
    validationTechnicalProfiles: elements(child(e, 'ValidationTechnicalProfiles'), 'ValidationTechnicalProfile').map(
      (v) => ({
        referenceId: attr(v, 'ReferenceId') ?? '',
        continueOnError: boolAttr(attr(v, 'ContinueOnError')),
        continueOnSuccess: boolAttr(attr(v, 'ContinueOnSuccess')),
        preconditions: parsePreconditions(c, child(v, 'Preconditions')),
        ref: c.ref(v),
      }),
    ),
    subjectNamingInfo: sni ? { claimType: attr(sni, 'ClaimType') ?? '', ref: c.ref(sni) } : undefined,
    includeInSso: childText(e, 'IncludeInSso'),
    includeClaimsFromTechnicalProfile: icfp ? (attr(icfp, 'ReferenceId') ?? textOf(icfp).trim()) : undefined,
    includeTechnicalProfile: include ? { referenceId: attr(include, 'ReferenceId') ?? '', ref: c.ref(include) } : undefined,
    useTechnicalProfileForSessionManagement: sm ? { referenceId: attr(sm, 'ReferenceId') ?? '', ref: c.ref(sm) } : undefined,
    enabledForUserJourneys: childText(e, 'EnabledForUserJourneys'),
  };
}

function parseClaimsProvider(c: Ctx, e: XElement): ClaimsProviderDef {
  const displayName = childText(e, 'DisplayName');
  return {
    ref: c.ref(e),
    displayName,
    domain: childText(e, 'Domain'),
    technicalProfiles: elements(child(e, 'TechnicalProfiles'), 'TechnicalProfile').map((t) =>
      parseTechnicalProfile(c, t, displayName ?? ''),
    ),
  };
}

function parseStep(c: Ctx, e: XElement): OrchestrationStepDef {
  const orderText = attr(e, 'Order') ?? '';
  const pre = child(e, 'Preconditions');
  const cps = child(e, 'ClaimsProviderSelections');
  return {
    order: Number.parseInt(orderText, 10),
    orderText,
    type: attr(e, 'Type') ?? '',
    contentDefinitionReferenceId: attr(e, 'ContentDefinitionReferenceId'),
    cpimIssuerTechnicalProfileReferenceId: attr(e, 'CpimIssuerTechnicalProfileReferenceId'),
    ref: c.ref(e),
    preconditions: parsePreconditions(c, pre),
    hasPreconditions: !!pre,
    selectionDisplayOption: attr(cps, 'DisplayOption'),
    claimsProviderSelections: elements(cps, 'ClaimsProviderSelection').map((s) => ({
      targetClaimsExchangeId: attr(s, 'TargetClaimsExchangeId'),
      validationClaimsExchangeId: attr(s, 'ValidationClaimsExchangeId'),
      ref: c.ref(s),
    })),
    claimsExchanges: elements(child(e, 'ClaimsExchanges'), 'ClaimsExchange').map((x) => ({
      id: attr(x, 'Id') ?? '',
      technicalProfileReferenceId: attr(x, 'TechnicalProfileReferenceId') ?? '',
      ref: c.ref(x),
    })),
    journeyCandidates: elements(child(e, 'JourneyList'), 'Candidate').map((x) => ({
      subJourneyReferenceId: attr(x, 'SubJourneyReferenceId') ?? '',
      ref: c.ref(x),
    })),
  };
}

function parseJourney(c: Ctx, e: XElement, kind: 'UserJourney' | 'SubJourney'): UserJourneyDef {
  return {
    id: attr(e, 'Id') ?? '',
    kind,
    subJourneyType: kind === 'SubJourney' ? attr(e, 'Type') : undefined,
    defaultCpimIssuerTechnicalProfileReferenceId: attr(e, 'DefaultCpimIssuerTechnicalProfileReferenceId'),
    authorizationTechnicalProfiles: elements(
      child(child(e, 'Authorization'), 'AuthorizationTechnicalProfiles') ?? child(e, 'AuthorizationTechnicalProfiles'),
      'AuthorizationTechnicalProfile',
    ).map((a) => attr(a, 'ReferenceId') ?? ''),
    ref: c.ref(e),
    steps: elements(child(e, 'OrchestrationSteps'), 'OrchestrationStep').map((s) => parseStep(c, s)),
  };
}

function parseRelyingParty(c: Ctx, e: XElement): RelyingPartyDef {
  const duj = child(e, 'DefaultUserJourney');
  const tp = child(e, 'TechnicalProfile');
  const behaviors = child(e, 'UserJourneyBehaviors');
  const kvs: KeyValue[] = [];
  for (const b of elements(behaviors)) {
    kvs.push({
      key: b.name,
      value: b.attrs.length ? b.attrs.map((a) => `${a.name}=${a.value}`).join('; ') : textOf(b).trim(),
      ref: c.ref(b),
    });
  }
  return {
    ref: c.ref(e),
    defaultUserJourney: duj ? { referenceId: attr(duj, 'ReferenceId') ?? '', ref: c.ref(duj) } : undefined,
    userJourneyBehaviors: kvs,
    endpoints: elements(child(e, 'Endpoints'), 'Endpoint').map((x) => ({
      id: attr(x, 'Id') ?? '',
      userJourneyReferenceId: attr(x, 'UserJourneyReferenceId') ?? '',
      ref: c.ref(x),
    })),
    technicalProfile: tp ? parseTechnicalProfile(c, tp, 'RelyingParty') : undefined,
  };
}
