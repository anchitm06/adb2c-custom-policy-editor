import type { PolicyFile } from '../app/core/workspace/workspace';

/**
 * Builds a large single-file policy for performance and scale tests.
 *
 * The journey has `steps` orchestration steps. `optional` independent optional claims are each
 * collected on a page (so their presence is unknown), tested by a precondition soon after
 * (which forks the analysis) and read again near the end (which keeps the fork alive). That is
 * the worst case for a path-sensitive analysis: 2^optional distinct complete paths.
 */
export interface SyntheticOptions {
  steps?: number;
  optional?: number;
  /** When false the optional claims are never read after their own precondition. */
  readLate?: boolean;
}

const H = (cls: string) => `Web.TPEngine.Providers.${cls}, Web.TPEngine, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null`;

export function syntheticPolicy(opts: SyntheticOptions = {}): PolicyFile {
  const total = opts.steps ?? 44;
  const n = opts.optional ?? 12;
  const readLate = opts.readLate ?? true;

  const claims: string[] = ['objectId', 'authenticationSource', 'email', 'displayName', 'restResult'];
  for (let i = 0; i < n; i++) claims.push(`opt${i}`);
  const claimsSchema = claims.map((c) => `<ClaimType Id="${c}"><DisplayName>${c}</DisplayName><DataType>string</DataType><UserInputType>TextBox</UserInputType></ClaimType>`).join('\n');

  const tps: string[] = [];
  const addTp = (id: string, inner: string) => tps.push(`<ClaimsProvider><DisplayName>${id}</DisplayName><TechnicalProfiles><TechnicalProfile Id="${id}"><DisplayName>${id}</DisplayName>${inner}</TechnicalProfile></TechnicalProfiles></ClaimsProvider>`);
  const sa = H('SelfAssertedAttributeProvider');
  addTp('Local-Signin', `<Protocol Name="Proprietary" Handler="${sa}" /><Metadata><Item Key="ContentDefinitionReferenceId">api.signin</Item></Metadata><OutputClaims><OutputClaim ClaimTypeReferenceId="email" Required="true" /><OutputClaim ClaimTypeReferenceId="objectId" Required="true" /><OutputClaim ClaimTypeReferenceId="authenticationSource" DefaultValue="local" /></OutputClaims>`);
  addTp('Social-IdP', `<Protocol Name="OAuth2" /><OutputClaims><OutputClaim ClaimTypeReferenceId="email" /><OutputClaim ClaimTypeReferenceId="authenticationSource" DefaultValue="social" AlwaysUseDefaultValue="true" /></OutputClaims>`);
  addTp(
    'AAD-Read-NoError',
    `<Protocol Name="Proprietary" Handler="${H('AzureActiveDirectoryProvider')}" /><Metadata><Item Key="Operation">Read</Item><Item Key="RaiseErrorIfClaimsPrincipalDoesNotExist">false</Item></Metadata><InputClaims><InputClaim ClaimTypeReferenceId="email" /></InputClaims><OutputClaims><OutputClaim ClaimTypeReferenceId="objectId" /><OutputClaim ClaimTypeReferenceId="displayName" /></OutputClaims>`,
  );
  for (let i = 0; i < n; i++) {
    addTp(`Page-${i}`, `<Protocol Name="Proprietary" Handler="${sa}" /><Metadata><Item Key="ContentDefinitionReferenceId">api.page</Item></Metadata><OutputClaims><OutputClaim ClaimTypeReferenceId="opt${i}" /></OutputClaims>`);
  }
  const rest = (id: string, reads: string[]) =>
    addTp(id, `<Protocol Name="Proprietary" Handler="${H('RestfulProvider')}" /><Metadata><Item Key="ServiceUrl">https://example.test/${id}</Item><Item Key="AuthenticationType">None</Item></Metadata><InputClaims>${['email', ...reads].map((c) => `<InputClaim ClaimTypeReferenceId="${c}" />`).join('')}</InputClaims><OutputClaims><OutputClaim ClaimTypeReferenceId="restResult" /></OutputClaims>`);
  const lateReads = readLate ? Array.from({ length: n }, (_, i) => `opt${i}`) : [];
  for (let i = 0; i < 40; i++) rest(`Rest-${i}`, i === 0 ? lateReads : []);
  addTp('JwtIssuer', `<Protocol Name="OpenIdConnect" /><OutputTokenFormat>JWT</OutputTokenFormat>`);

  const skipIfMissing = (claim: string) => `<Preconditions><Precondition Type="ClaimsExist" ExecuteActionsIf="false"><Value>${claim}</Value><Action>SkipThisOrchestrationStep</Action></Precondition></Preconditions>`;
  const skipIfExists = (claim: string) => `<Preconditions><Precondition Type="ClaimsExist" ExecuteActionsIf="true"><Value>${claim}</Value><Action>SkipThisOrchestrationStep</Action></Precondition></Preconditions>`;
  const exch = (id: string, tp: string) => `<ClaimsExchanges><ClaimsExchange Id="${id}" TechnicalProfileReferenceId="${tp}" /></ClaimsExchanges>`;

  const main: string[] = [];
  const sub = (name: string, steps: string[]) => `<SubJourney Id="${name}" Type="Call"><OrchestrationSteps>${steps.map((s, i) => s.replace('ORDER', String(i + 1))).join('')}</OrchestrationSteps></SubJourney>`;
  main.push(`<OrchestrationStep Order="ORDER" Type="CombinedSignInAndSignUp" ContentDefinitionReferenceId="api.signin"><ClaimsProviderSelections><ClaimsProviderSelection TargetClaimsExchangeId="IdpExchange" /><ClaimsProviderSelection ValidationClaimsExchangeId="LocalExchange" /></ClaimsProviderSelections>${exch('LocalExchange', 'Local-Signin')}</OrchestrationStep>`);
  main.push(`<OrchestrationStep Order="ORDER" Type="ClaimsExchange">${skipIfExists('objectId')}${exch('IdpExchange', 'Social-IdP')}</OrchestrationStep>`);
  main.push(`<OrchestrationStep Order="ORDER" Type="ClaimsExchange">${exch('ReadUser', 'AAD-Read-NoError')}</OrchestrationStep>`);
  // Collect an optional claim on a page, then test it.
  for (let i = 0; i < n; i++) {
    main.push(`<OrchestrationStep Order="ORDER" Type="ClaimsExchange">${exch(`Collect${i}`, `Page-${i}`)}</OrchestrationStep>`);
    main.push(`<OrchestrationStep Order="ORDER" Type="ClaimsExchange">${skipIfMissing(`opt${i}`)}${exch(`UseOpt${i}`, `Rest-${i + 1}`)}</OrchestrationStep>`);
  }
  // Two sub journeys.
  const subs: string[] = [];
  for (const name of ['SubA', 'SubB']) {
    subs.push(sub(name, [`<OrchestrationStep Order="ORDER" Type="ClaimsExchange">${exch(`${name}1`, 'Rest-30')}</OrchestrationStep>`, `<OrchestrationStep Order="ORDER" Type="ClaimsExchange">${skipIfMissing('opt0')}${exch(`${name}2`, 'Rest-31')}</OrchestrationStep>`]));
    main.push(`<OrchestrationStep Order="ORDER" Type="InvokeSubJourney"><JourneyList><Candidate SubJourneyReferenceId="${name}" /></JourneyList></OrchestrationStep>`);
  }
  // Filler steps that read the optional claims late.
  let filler = 0;
  while (main.length < total - 1) {
    const claim = readLate && n ? `opt${filler % n}` : 'restResult';
    main.push(`<OrchestrationStep Order="ORDER" Type="ClaimsExchange">${skipIfExists(claim)}${exch(`Late${filler}`, `Rest-${(filler % 8) + 2}`)}</OrchestrationStep>`);
    filler++;
  }
  main.length = Math.min(main.length, total - 1);
  main.push(`<OrchestrationStep Order="ORDER" Type="SendClaims" CpimIssuerTechnicalProfileReferenceId="JwtIssuer" />`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TrustFrameworkPolicy xmlns="http://schemas.microsoft.com/online/cpim/schemas/2013/06" PolicySchemaVersion="0.3.0.0" TenantId="synthetic.onmicrosoft.com" PolicyId="B2C_1A_Synthetic" PublicPolicyUri="http://synthetic.onmicrosoft.com/B2C_1A_Synthetic">
<BuildingBlocks><ClaimsSchema>${claimsSchema}</ClaimsSchema><ContentDefinitions>${['api.signin', 'api.page'].map((id) => `<ContentDefinition Id="${id}"><LoadUri>~/x.html</LoadUri><RecoveryUri>~/e.html</RecoveryUri><DataUri>urn:com:microsoft:aad:b2c:elements:contract:selfasserted:2.1.30</DataUri></ContentDefinition>`).join('')}</ContentDefinitions></BuildingBlocks>
<ClaimsProviders>${tps.join('\n')}</ClaimsProviders>
<SubJourneys>${subs.join('')}</SubJourneys>
<UserJourneys><UserJourney Id="Big"><OrchestrationSteps>${main.map((s, i) => s.replace('ORDER', String(i + 1))).join('\n')}</OrchestrationSteps></UserJourney></UserJourneys>
<RelyingParty><DefaultUserJourney ReferenceId="Big" /><TechnicalProfile Id="PolicyProfile"><DisplayName>PolicyProfile</DisplayName><Protocol Name="OpenIdConnect" /><OutputClaims><OutputClaim ClaimTypeReferenceId="objectId" PartnerClaimType="sub" /><OutputClaim ClaimTypeReferenceId="email" /><OutputClaim ClaimTypeReferenceId="restResult" /></OutputClaims><SubjectNamingInfo ClaimType="sub" /></TechnicalProfile></RelyingParty>
</TrustFrameworkPolicy>`;
  return { id: 'synthetic', name: 'Synthetic.xml', text: xml };
}
