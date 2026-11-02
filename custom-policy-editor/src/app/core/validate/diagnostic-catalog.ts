/**
 * What every alert means and where Microsoft documents the rule behind it.
 *
 * `scripts/check-doc-links.mjs` reads the URLs in this file and checks that each page and
 * anchor still exists, so keep links as plain string literals.
 */

export interface DocLink {
  label: string;
  url: string;
}

export interface CatalogEntry {
  title: string;
  /** Why the rule exists, in one or two sentences. */
  why: string;
  /** How to fix it, when there is a standard fix. */
  fix?: string;
  /** Microsoft Learn pages (first one is the main reference). */
  docs: DocLink[];
  /** Section of this site's Help page that explains the tool's own reasoning (not a Microsoft rule). */
  help?: { label: string; section: string };
}

const B = 'https://learn.microsoft.com/en-us/azure/active-directory-b2c/';

const L = {
  troubleshootValidity: { label: 'Troubleshoot policy validity', url: `${B}troubleshoot#troubleshoot-policy-validity` },
  troubleshootUpload: { label: 'Upload errors and fixes', url: `${B}troubleshoot#upload-policies-and-policy-validation` },
  overview: { label: 'Custom policy overview', url: `${B}custom-policy-overview` },
  inheritance: { label: 'Inheritance model', url: `${B}custom-policy-overview#inheritance-model` },
  bestPractices: { label: 'Best practices', url: `${B}custom-policy-overview#best-practices` },
  claimsBag: { label: 'Orchestration steps and the claims bag', url: `${B}custom-policy-overview#orchestration-steps` },
  policyRoot: { label: 'TrustFrameworkPolicy', url: `${B}trustframeworkpolicy` },
  starterPack: { label: 'Get started with custom policies', url: `${B}tutorial-create-user-flows?pivots=b2c-custom-policy` },
  journeys: { label: 'User journeys', url: `${B}userjourneys` },
  steps: { label: 'Orchestration steps', url: `${B}userjourneys#orchestrationsteps` },
  preconditions: { label: 'Preconditions', url: `${B}userjourneys#preconditions` },
  selection: { label: 'Claims provider selection', url: `${B}userjourneys#claims-provider-selection` },
  exchanges: { label: 'ClaimsExchanges', url: `${B}userjourneys#claimsexchanges` },
  journeyList: { label: 'JourneyList', url: `${B}userjourneys#journeylist` },
  subJourneys: { label: 'Sub journeys', url: `${B}subjourneys` },
  subJourneyBranching: { label: 'User journey branching', url: `${B}subjourneys#user-journey-branching` },
  subJourneyComponents: { label: 'Sub journey components', url: `${B}subjourneys#components` },
  tpFlow: { label: 'Technical profile flow', url: `${B}technicalprofiles#technical-profile-flow` },
  tpProtocol: { label: 'Protocol', url: `${B}technicalprofiles#protocol` },
  tpMetadata: { label: 'Metadata', url: `${B}technicalprofiles#metadata` },
  tpInputClaims: { label: 'Input claims', url: `${B}technicalprofiles#input-claims` },
  tpOutputClaims: { label: 'Output claims', url: `${B}technicalprofiles#output-claims` },
  tpInclude: { label: 'Include technical profile', url: `${B}technicalprofiles#include-technical-profile` },
  tpEnabled: { label: 'Enabled for user journeys', url: `${B}technicalprofiles#enabled-for-user-journeys` },
  validationTp: { label: 'Validation technical profile', url: `${B}validation-technical-profile` },
  selfAsserted: { label: 'Self-asserted technical profile', url: `${B}self-asserted-technical-profile` },
  selfAssertedMetadata: { label: 'Self-asserted metadata', url: `${B}self-asserted-technical-profile#metadata` },
  selfAssertedOutput: { label: 'Output claims of a self-asserted profile', url: `${B}self-asserted-technical-profile#output-claims` },
  claimsSchema: { label: 'ClaimsSchema', url: `${B}claimsschema` },
  claimDataType: { label: 'Claim data types', url: `${B}claimsschema#datatype` },
  claimInputType: { label: 'User input types', url: `${B}claimsschema#userinputtype` },
  claimEnumeration: { label: 'Enumeration', url: `${B}claimsschema#enumeration` },
  claimsTransformations: { label: 'ClaimsTransformations', url: `${B}claimstransformations` },
  relyingParty: { label: 'RelyingParty', url: `${B}relyingparty` },
  rpJourney: { label: 'DefaultUserJourney', url: `${B}relyingparty#defaultuserjourney` },
  rpProfile: { label: 'Relying party technical profile', url: `${B}relyingparty#technicalprofile` },
  rpOutput: { label: 'Relying party output claims', url: `${B}relyingparty#outputclaims` },
  contentDefinitions: { label: 'ContentDefinitions', url: `${B}contentdefinitions` },
  localization: { label: 'Localization', url: `${B}localization` },
  displayControls: { label: 'Display controls', url: `${B}display-controls` },
  predicates: { label: 'Predicates and PredicateValidations', url: `${B}predicates` },
};

const e = (title: string, why: string, docs: DocLink[], fix?: string, help?: CatalogEntry['help']): CatalogEntry => ({ title, why, docs, fix, help });

export const DIAGNOSTIC_CATALOG: Record<string, CatalogEntry> = {
  // File and policy
  xml: e('XML is not well-formed', 'The file cannot be read as XML, so nothing in it can be checked or analysed. This is the most common reason a custom policy fails to upload.', [L.troubleshootValidity], 'Fix the tag or attribute at the reported line. Check closing tags and quotes.'),
  root: e('Unexpected root element', 'A policy file must have TrustFrameworkPolicy as its root element.', [L.policyRoot, L.overview], 'Wrap the content in a TrustFrameworkPolicy element.'),
  'root.policyId': e('PolicyId missing or invalid', 'Each policy file needs a PolicyId. Custom policies in a tenant are prefixed with B2C_1A_.', [L.starterPack, L.policyRoot], 'Set PolicyId to a unique name that starts with B2C_1A_.'),
  'root.tenantId': e('TenantId missing', 'TenantId must name the tenant the policy is uploaded to.', [L.policyRoot, L.troubleshootUpload], 'Set TenantId to yourtenant.onmicrosoft.com.'),
  'root.publicPolicyUri': e('PublicPolicyUri missing', 'PublicPolicyUri identifies the policy and is part of the standard policy header.', [L.policyRoot], 'Set it to http://<tenant>.onmicrosoft.com/<PolicyId>.'),
  base: e('BasePolicy has no PolicyId', 'A child policy points to its parent through BasePolicy/PolicyId.', [L.inheritance, L.policyRoot], 'Add the PolicyId of the parent policy.'),
  'base.missing': e('Base policy is not loaded', 'The parent policy is not among the loaded files, so references to things it defines cannot be checked.', [L.inheritance], 'Add the missing base file to the workspace (Files).'),
  'base.tenant': e('BasePolicy tenant differs', 'A policy and its parent must belong to the same tenant, otherwise upload fails.', [L.troubleshootUpload, L.policyRoot], 'Use the same TenantId in the policy and in BasePolicy.'),
  'root.duplicate': e('Two files share a PolicyId', 'Each policy in a tenant needs a unique PolicyId. Uploading a second file with the same id overwrites or is rejected.', [L.troubleshootUpload], 'Rename one of the policies.'),
  placeholder: e('Starter pack placeholder still present', 'The Microsoft starter pack contains placeholders such as yourtenant and IdentityExperienceFrameworkAppId that must be replaced before upload.', [L.starterPack], 'Use Menu, Set tenant to replace them in every file.'),
  'id.missing': e('Element without an Id', 'Elements that other elements refer to need an Id.', [L.troubleshootValidity]),
  'id.duplicate': e('Duplicate Id', 'Ids must be unique within a file, otherwise references are ambiguous.', [L.troubleshootUpload], 'Rename or remove one of the elements.'),
  // References
  'ref.empty': e('Empty reference', 'A reference attribute is empty, so it points to nothing.', [L.troubleshootUpload], 'Choose the element it should point to.'),
  'ref.unresolved': e('Reference to something that is not defined', 'Every reference must resolve to an element in this policy or one of its parent policies. Upload fails otherwise.', [L.troubleshootUpload, L.inheritance], 'Check the spelling, or add the missing definition to this file or to a parent file.'),
  'ref.forward': e('Reference to something defined in a child file', 'A policy can only use elements defined in itself or in its parents. This one is only defined further down the chain, so this file cannot be uploaded on its own.', [L.inheritance], 'Move the definition up to this file or a parent, or move the reference down.'),
  'chain.cycle': e('Inheritance cycle', 'Policies inherit from each other in a loop, so there is no base to start from.', [L.inheritance], 'Break the loop by changing one BasePolicy.'),
  'chain.depth': e('Inheritance chain too long', 'Azure AD B2C allows up to 10 levels of inheritance.', [L.inheritance], 'Merge some of the intermediate files.'),
  'chain.tenant': e('Files use different tenants', 'All files of a chain must use the same TenantId.', [L.troubleshootUpload, L.policyRoot], 'Use one TenantId everywhere (Menu, Set tenant).'),
  // Claims
  'claim.dataType': e('Claim data type missing or unknown', 'Every ClaimType needs a DataType from the supported list.', [L.claimDataType], 'Pick one of boolean, date, dateTime, duration, int, long, string, stringCollection and so on.'),
  'claim.userInputType': e('Unknown user input type', 'UserInputType controls how a claim is collected on a page and must be a supported value.', [L.claimInputType], 'Choose a supported input type for the claim data type.'),
  'claim.enumeration': e('Selection claim without values', 'Dropdowns, radio buttons and checkboxes need Enumeration values (or localized collections) to show.', [L.claimEnumeration, L.claimInputType], 'Add Enumeration entries under Restriction.'),
  'claim.defaultValue.type': e('Default value does not match the claim type', 'A DefaultValue that cannot be parsed as the claim data type makes the policy fail at run time with "Input string was not in a correct format".', [L.troubleshootUpload, L.claimDataType], 'Use a valid number, true/false or date for the claim type.'),
  // Claims transformations
  'ct.method': e('Transformation method', 'A claims transformation needs a TransformationMethod that Azure AD B2C supports.', [L.claimsTransformations], 'Pick a method from the list.'),
  'ct.tct': e('Unexpected transformation claim', 'Each transformation method defines which input and output claims (by TransformationClaimType) it accepts.', [L.claimsTransformations]),
  'ct.tct.missing': e('Required transformation claim missing', 'The method needs this input or output claim to run.', [L.claimsTransformations]),
  'ct.dataType': e('Claim type does not fit the transformation', 'The method expects a particular data type for this claim.', [L.claimsTransformations, L.claimDataType]),
  'ct.param': e('Unexpected input parameter', 'The method does not define this input parameter.', [L.claimsTransformations]),
  'ct.param.missing': e('Required input parameter missing', 'The method needs this input parameter to run.', [L.claimsTransformations]),
  // Technical profiles
  'tp.include.cycle': e('Technical profile includes itself', 'IncludeTechnicalProfile chains must end at a profile that does not include another one.', [L.tpInclude]),
  'tp.protocol': e('Protocol missing or unknown', 'Every technical profile needs a Protocol, directly or through the profile it includes.', [L.tpProtocol], 'Add a Protocol element or include a profile that has one.'),
  'tp.handler': e('Protocol handler', 'Proprietary protocols need a Handler; protocol None must not have one.', [L.tpProtocol]),
  'tp.vtp': e('Validation profile on the wrong kind of profile', 'Only self-asserted technical profiles can call validation technical profiles.', [L.validationTp, L.tpFlow], 'Move the validation to a self-asserted profile, or add another orchestration step.'),
  'tp.vtp.input': e('Validation profile input is not collected', 'All input claims of a validation technical profile must appear in the output claims of the profile that calls it.', [L.validationTp], 'Add the claim to the output claims of the calling profile.'),
  'tp.contentDefinition': e('Page without a content definition', 'A self-asserted profile needs ContentDefinitionReferenceId to know which page to show.', [L.selfAssertedMetadata, L.contentDefinitions], 'Add the ContentDefinitionReferenceId metadata item.'),
  'tp.metadata': e('Required metadata missing', 'This kind of technical profile needs this metadata item to work.', [L.tpMetadata]),
  'tp.enabledFor': e('EnabledForUserJourneys', 'EnabledForUserJourneys accepts a fixed set of values, and the On... values need the ClaimTypeOnWhichToEnable metadata.', [L.tpEnabled]),
  precondition: e('Invalid precondition', 'A precondition needs a valid Type, ExecuteActionsIf, claim Value and Action.', [L.preconditions], 'Use ClaimsExist or ClaimEquals, true or false, and the Skip action.'),
  // Journeys and steps
  'journey.empty': e('Journey without steps', 'A user journey needs at least one orchestration step.', [L.journeys]),
  'subjourney.type': e('Sub journey type', 'A sub journey is either Call (returns to the caller) or Transfer (continues on its own and issues the token).', [L.subJourneyComponents, L.subJourneys]),
  'journey.order': e('Steps are not numbered 1 to N', 'Order must start at 1 and continue without gaps. Upload fails with "duplicate key sequence" or "expected to have step with order".', [L.steps, L.troubleshootUpload], 'Use the Renumber quick fix.'),
  'journey.sendClaims': e('Token step', 'A user must reach a SendClaims step to get a token. It has to be the last step of a user journey and of a Transfer sub journey.', [L.claimsBag, L.steps], 'End the journey with a SendClaims step.'),
  'step.type': e('Unknown step type', 'Step Type must be one of the supported values.', [L.steps]),
  'step.exchangeId': e('Duplicate claims exchange Id', 'ClaimsExchange Ids must be unique within a journey, because provider selections refer to them.', [L.exchanges, L.troubleshootUpload], 'Give each exchange its own Id.'),
  'step.exchanges': e('Claims exchange step without an exchange', 'A ClaimsExchange step runs a technical profile, so it needs a ClaimsExchange.', [L.exchanges]),
  'step.exchanges.noSelection': e('Several exchanges without a selection', 'A ClaimsExchange step with more than one exchange must follow a claims provider selection step, which says which exchange to run. Upload fails otherwise.', [L.troubleshootUpload, L.selection], 'Split it into one step per exchange, or put a selection step before it.'),
  'step.contentDefinition': e('Selection step without a page', 'Provider selection and combined sign-in pages need a content definition to show.', [L.steps, L.contentDefinitions], 'Set ContentDefinitionReferenceId.'),
  'step.selections': e('Selection step without choices', 'The step shows buttons, so it needs ClaimsProviderSelection entries.', [L.selection]),
  'step.selection': e('Selection needs a target or a validation exchange', 'Each ClaimsProviderSelection has either TargetClaimsExchangeId (runs in the next step) or ValidationClaimsExchangeId (runs on this page), never both.', [L.selection]),
  'step.selection.target': e('Selection target is not in the next step', 'TargetClaimsExchangeId must match a ClaimsExchange in the step right after the selection.', [L.selection, L.troubleshootUpload]),
  'step.selection.validation': e('Selection validation exchange is not in this step', 'ValidationClaimsExchangeId must match a ClaimsExchange in the same step.', [L.selection]),
  'step.selection.nextType': e('Step after a selection must be a claims exchange', 'The step that follows a provider selection runs the chosen exchange, so it must be of type ClaimsExchange.', [L.troubleshootUpload, L.selection], 'Change the next step to a ClaimsExchange step.'),
  'step.candidate': e('Sub journey step needs one candidate', 'InvokeSubJourney needs a JourneyList with exactly one Candidate.', [L.journeyList, L.subJourneys]),
  'step.nested': e('Sub journey calls a sub journey', 'A sub journey is called from a user journey and should not call another sub journey.', [L.subJourneyBranching]),
  'step.issuer': e('Token step without an issuer', 'Without an issuer technical profile no token is created.', [L.steps], 'Set CpimIssuerTechnicalProfileReferenceId or a journey default issuer.'),
  'step.sendClaims.position': e('Steps after the token step never run', 'A SendClaims step ends the journey.', [L.steps]),
  // Relying party
  'rp.journey': e('Relying party without a default journey', 'The relying party names the user journey to run.', [L.rpJourney]),
  'rp.tp': e('Relying party without a technical profile', 'The relying party technical profile (PolicyProfile) defines the token contract.', [L.rpProfile]),
  'rp.outputNotProduced': e('Token claim that no step produces', 'A claim in the relying party output claims must be an output claim of some step in the journey, or have a DefaultValue. Upload fails otherwise.', [L.troubleshootUpload, L.rpOutput], 'Produce the claim in a step, or set DefaultValue on the output claim.'),
  // This tool's own analysis (not Microsoft rules)
  'flow.neverRuns': e('Step never runs', 'Following the preconditions through every scenario, this step is always skipped. It may be left over, or a precondition may be wrong. Single sign-on sessions are not modelled.', [L.preconditions, L.claimsBag], undefined, { label: 'How the analysis works', section: 'analysis' }),
  'flow.input': e('Input claim may be missing', 'A technical profile reads a claim that is not in the claims bag in every scenario. Profiles that call an API or the directory can fail without it.', [L.tpFlow, L.tpInputClaims], 'Produce the claim earlier, give the input claim a DefaultValue, or skip the step when it is missing.', { label: 'How the analysis works', section: 'analysis' }),
  'flow.token': e('Token claim may be missing', 'In some scenarios the claims bag has no value for this token claim when the token is issued.', [L.rpOutput, L.claimsBag], 'Make sure every path produces it, or set a DefaultValue.', { label: 'How the analysis works', section: 'analysis' }),
  'analysis.approximate': e('Some branches were merged', 'The journey has many independent branches. To stay fast the analysis merged some of them, which can show "maybe" where the answer is certain. Nothing is skipped.', [L.claimsBag], 'Choose a scenario to get exact results for one case.', { label: 'How the analysis works', section: 'analysis' }),
  // Precondition lints (shown in the precondition editor)
  'pre.duplicate': e('Same precondition twice', 'The second copy never changes the outcome.', [L.preconditions], 'Remove one of them.'),
  'pre.never': e('The step can never run', 'These preconditions together skip the step whatever the claims are.', [L.preconditions]),
  'pre.claimUndefined': e('Claim is not defined', 'Preconditions refer to claim types, which must be defined in a ClaimsSchema of this chain.', [L.preconditions, L.claimsSchema]),
  'pre.boolean': e('Boolean value spelling', 'ClaimEquals compares case-sensitively, and boolean claims are written True or False.', [L.preconditions]),
  'pre.enumeration': e('Value is not an allowed value', 'The compared value is not in the claim\'s list of allowed values, so the comparison can never be true.', [L.preconditions, L.claimEnumeration]),
  'pre.neverDecides': e('Precondition never decides', 'Another precondition always decides first, or the step is always reached the same way.', [L.preconditions]),
  'pre.neverSatisfied': e('Precondition is never satisfied', 'The claim is never in the claims bag when this step is reached, so the check is always false.', [L.preconditions, L.claimsBag], undefined, { label: 'How the analysis works', section: 'analysis' }),
  'pre.alwaysSkips': e('Precondition always skips the step', 'The claim is never in the claims bag here, so a "missing" check is always true.', [L.preconditions, L.claimsBag], undefined, { label: 'How the analysis works', section: 'analysis' }),
  'pre.alwaysPresent': e('Claim is always present', 'The claim is in the claims bag in every scenario, so the step is always skipped.', [L.preconditions, L.claimsBag], undefined, { label: 'How the analysis works', section: 'analysis' }),
  'pre.maybeMissing': e('ClaimEquals ignores a missing claim', 'If the claim does not exist, a ClaimEquals precondition is ignored, so the step runs. Check that the claim exists first.', [L.preconditions], 'Add a ClaimsExist precondition before the ClaimEquals one.'),
  'pre.coversAll': e('Preconditions cover every case', 'In every analysed scenario one of these preconditions skips the step.', [L.preconditions]),
};

const GENERIC: CatalogEntry = e('Policy check', 'This check follows the rules of the custom policy schema.', [L.troubleshootValidity, L.overview]);

export function lookupAlert(code: string | undefined): CatalogEntry {
  return (code && DIAGNOSTIC_CATALOG[code]) || GENERIC;
}

/** The Help page section for tool-specific reasoning, as a hash route. */
export function helpHref(section: string): string {
  return `#/help/${section}`;
}

/** Every distinct Microsoft Learn link used by an alert. */
export function allDocLinks(): DocLink[] {
  const seen = new Map<string, DocLink>();
  for (const entry of Object.values(DIAGNOSTIC_CATALOG)) for (const d of entry.docs) if (!seen.has(d.url)) seen.set(d.url, d);
  return [...seen.values()];
}
