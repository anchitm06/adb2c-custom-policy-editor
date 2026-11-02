/** Typed, read-only view over a B2C TrustFrameworkPolicy file. */

export interface SourceRef {
  fileId: string;
  /** Element-child index path from the root TrustFrameworkPolicy element. */
  path: readonly number[];
  line: number;
}

export interface Located {
  ref: SourceRef;
}

export interface KeyValue extends Located {
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------

export interface EnumerationItem extends Located {
  text: string;
  value: string;
  selectByDefault?: boolean;
}

export interface ClaimTypeDef extends Located {
  id: string;
  displayName?: string;
  dataType?: string;
  userInputType?: string;
  userHelpText?: string;
  adminHelpText?: string;
  mask?: { type?: string; value: string };
  predicateValidationReference?: string;
  restriction?: {
    mergeBehavior?: string;
    enumeration: EnumerationItem[];
    pattern?: { regularExpression?: string; helpText?: string };
  };
  defaultPartnerClaimTypes: { protocol: string; partnerClaimType: string }[];
}

export interface TransformationClaim extends Located {
  claimTypeReferenceId: string;
  transformationClaimType?: string;
}

export interface TransformationParameter extends Located {
  id: string;
  dataType?: string;
  value?: string;
}

export interface ClaimsTransformationDef extends Located {
  id: string;
  method?: string;
  inputClaims: TransformationClaim[];
  inputParameters: TransformationParameter[];
  outputClaims: TransformationClaim[];
}

export interface ContentDefinitionDef extends Located {
  id: string;
  loadUri?: string;
  recoveryUri?: string;
  dataUri?: string;
  metadata: KeyValue[];
  localizedResourcesReferences: { language: string; localizedResourcesReferenceId: string; ref: SourceRef }[];
}

export interface LocalizedString extends Located {
  elementType?: string;
  elementId?: string;
  stringId?: string;
  value: string;
}

export interface LocalizedResourcesDef extends Located {
  id: string;
  strings: LocalizedString[];
  collections: { elementType?: string; elementId?: string; targetCollection?: string; items: { text: string; value: string }[]; ref: SourceRef }[];
}

export interface LocalizationDef extends Located {
  enabled?: string;
  defaultLanguage?: string;
  mergeBehavior?: string;
  supportedLanguages: string[];
  resources: LocalizedResourcesDef[];
}

export interface DisplayControlDef extends Located {
  id: string;
  userInterfaceControlType?: string;
  inputClaims: ClaimRef[];
  displayClaims: DisplayClaimRef[];
  outputClaims: ClaimRef[];
  actions: { id: string; validationClaimsExchangeTechnicalProfiles: string[]; ref: SourceRef }[];
}

export interface PredicateDef extends Located {
  id: string;
  method?: string;
  helpText?: string;
  parameters: { id: string; value: string; ref: SourceRef }[];
}

export interface PredicateValidationDef extends Located {
  id: string;
  groups: { id: string; userHelpText?: string; matchAtLeast?: string; predicateReferences: string[]; ref: SourceRef }[];
}

// ---------------------------------------------------------------------------------------------
// Technical profiles
// ---------------------------------------------------------------------------------------------

export interface ClaimRef extends Located {
  claimTypeReferenceId: string;
  partnerClaimType?: string;
  defaultValue?: string;
  alwaysUseDefaultValue?: boolean;
  required?: boolean;
}

export interface DisplayClaimRef extends Located {
  claimTypeReferenceId?: string;
  displayControlReferenceId?: string;
  required?: boolean;
}

export interface Precondition extends Located {
  type: string;
  executeActionsIf: string;
  values: string[];
  action?: string;
}

export interface ValidationTPRef extends Located {
  referenceId: string;
  continueOnError?: boolean;
  continueOnSuccess?: boolean;
  preconditions: Precondition[];
}

export interface TechnicalProfileDef extends Located {
  id: string;
  claimsProvider: string;
  displayName?: string;
  description?: string;
  protocol?: { name: string; handler?: string };
  inputTokenFormat?: string;
  outputTokenFormat?: string;
  metadata: KeyValue[];
  cryptographicKeys: { id?: string; storageReferenceId: string; ref: SourceRef }[];
  inputClaimsTransformations: { referenceId: string; ref: SourceRef }[];
  inputClaims: ClaimRef[];
  persistedClaims: ClaimRef[];
  displayClaims: DisplayClaimRef[];
  outputClaims: ClaimRef[];
  outputClaimsTransformations: { referenceId: string; ref: SourceRef }[];
  validationTechnicalProfiles: ValidationTPRef[];
  subjectNamingInfo?: { claimType: string; ref: SourceRef };
  includeInSso?: string;
  includeClaimsFromTechnicalProfile?: string;
  includeTechnicalProfile?: { referenceId: string; ref: SourceRef };
  useTechnicalProfileForSessionManagement?: { referenceId: string; ref: SourceRef };
  enabledForUserJourneys?: string;
}

export interface ClaimsProviderDef extends Located {
  displayName?: string;
  domain?: string;
  technicalProfiles: TechnicalProfileDef[];
}

// ---------------------------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------------------------

export const STEP_TYPES = [
  'CombinedSignInAndSignUp',
  'ClaimsProviderSelection',
  'ClaimsExchange',
  'GetClaims',
  'InvokeSubJourney',
  'SendClaims',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export interface ClaimsProviderSelectionDef extends Located {
  targetClaimsExchangeId?: string;
  validationClaimsExchangeId?: string;
}

export interface ClaimsExchangeDef extends Located {
  id: string;
  technicalProfileReferenceId: string;
}

export interface OrchestrationStepDef extends Located {
  order: number;
  orderText: string;
  type: string;
  contentDefinitionReferenceId?: string;
  cpimIssuerTechnicalProfileReferenceId?: string;
  preconditions: Precondition[];
  /** Whether the step element contains a <Preconditions> element (relevant when merging). */
  hasPreconditions: boolean;
  selectionDisplayOption?: string;
  claimsProviderSelections: ClaimsProviderSelectionDef[];
  claimsExchanges: ClaimsExchangeDef[];
  journeyCandidates: { subJourneyReferenceId: string; ref: SourceRef }[];
}

export interface UserJourneyDef extends Located {
  id: string;
  kind: 'UserJourney' | 'SubJourney';
  /** SubJourney only: Call | Transfer */
  subJourneyType?: string;
  defaultCpimIssuerTechnicalProfileReferenceId?: string;
  authorizationTechnicalProfiles: string[];
  steps: OrchestrationStepDef[];
}

export interface RelyingPartyDef extends Located {
  defaultUserJourney?: { referenceId: string; ref: SourceRef };
  userJourneyBehaviors: KeyValue[];
  endpoints: { id: string; userJourneyReferenceId: string; ref: SourceRef }[];
  technicalProfile?: TechnicalProfileDef;
}

// ---------------------------------------------------------------------------------------------
// Policy file
// ---------------------------------------------------------------------------------------------

export interface PolicyDoc {
  fileId: string;
  fileName: string;
  rootRef: SourceRef;
  rootName: string;
  policyId?: string;
  tenantId?: string;
  publicPolicyUri?: string;
  policySchemaVersion?: string;
  deploymentMode?: string;
  basePolicy?: { tenantId?: string; policyId?: string; ref: SourceRef };
  claimTypes: ClaimTypeDef[];
  claimsTransformations: ClaimsTransformationDef[];
  contentDefinitions: ContentDefinitionDef[];
  localization?: LocalizationDef;
  displayControls: DisplayControlDef[];
  predicates: PredicateDef[];
  predicateValidations: PredicateValidationDef[];
  claimsProviders: ClaimsProviderDef[];
  userJourneys: UserJourneyDef[];
  subJourneys: UserJourneyDef[];
  relyingParty?: RelyingPartyDef;
  /** Refs of the section containers, used by edit commands to know where to insert. */
  sections: Partial<Record<SectionName, SourceRef>>;
}

export type SectionName =
  | 'BuildingBlocks'
  | 'ClaimsSchema'
  | 'ClaimsTransformations'
  | 'ContentDefinitions'
  | 'Localization'
  | 'DisplayControls'
  | 'Predicates'
  | 'PredicateValidations'
  | 'ClaimsProviders'
  | 'UserJourneys'
  | 'SubJourneys'
  | 'RelyingParty';

export function sameRef(a: SourceRef | undefined, b: SourceRef | undefined): boolean {
  if (!a || !b) return false;
  return a.fileId === b.fileId && a.path.length === b.path.length && a.path.every((v, i) => v === b.path[i]);
}

export function refKey(r: SourceRef): string {
  return `${r.fileId}:${r.path.join('.')}`;
}

/** B2C identifiers are compared case-insensitively. */
export function idKey(id: string | undefined | null): string {
  return (id ?? '').trim().toLowerCase();
}
