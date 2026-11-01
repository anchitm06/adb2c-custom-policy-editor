import { TechnicalProfileDef } from '../model/types';

export type TpKind =
  | 'selfAsserted'
  | 'entraId'
  | 'rest'
  | 'claimsTransformation'
  | 'oauth2'
  | 'oauth1'
  | 'oidc'
  | 'saml'
  | 'jwtIssuer'
  | 'samlIssuer'
  | 'phoneFactor'
  | 'mfa'
  | 'otp'
  | 'session'
  | 'appInsights'
  | 'idTokenHint'
  | 'conditionalAccess'
  | 'oauth2Error'
  | 'engine'
  | 'unknown';

export interface TpKindInfo {
  kind: TpKind;
  label: string;
  icon: string;
  /** Short description for tooltips. */
  description: string;
  docs: string;
  /** Protocol element written when the user picks this kind. */
  protocol?: { name: string; handler?: string };
  outputTokenFormat?: string;
  interactive: boolean;
  metadata: MetadataKeyInfo[];
}

export interface MetadataKeyInfo {
  key: string;
  description: string;
  values?: string[];
  required?: boolean;
}

const H = (cls: string) => `Web.TPEngine.Providers.${cls}, Web.TPEngine, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null`;
const SSO = (cls: string) => `Web.TPEngine.SSO.${cls}, Web.TPEngine, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null`;
const DOCS = 'https://learn.microsoft.com/azure/active-directory-b2c/';

const commonIdp: MetadataKeyInfo[] = [
  { key: 'ProviderName', description: 'Name of the identity provider.' },
  { key: 'client_id', description: 'Application identifier registered with the identity provider.', required: true },
  { key: 'authorization_endpoint', description: 'URL of the authorization endpoint.' },
  { key: 'AccessTokenEndpoint', description: 'URL of the token endpoint.' },
  { key: 'ClaimsEndpoint', description: 'URL of the user info endpoint.' },
  { key: 'METADATA', description: 'URL of the OpenID Connect well-known configuration document.' },
  { key: 'scope', description: 'Scopes requested from the identity provider.' },
  { key: 'HttpBinding', description: 'HTTP binding used for token and claims endpoints.', values: ['GET', 'POST'] },
  { key: 'response_types', description: 'Response type per the OpenID Connect spec.', values: ['code', 'id_token', 'code id_token'] },
  { key: 'response_mode', description: 'Method the provider uses to send the result back.', values: ['query', 'form_post', 'fragment'] },
  { key: 'UsePolicyInRedirectUri', description: 'Whether to use the policy when constructing the redirect URI.', values: ['true', 'false', '0', '1'] },
  { key: 'DiscoverMetadataByTokenIssuer', description: 'Discover metadata using the iss claim in the JWT.', values: ['true', 'false'] },
  { key: 'ValidTokenIssuerPrefixes', description: 'Prefixes used to sign in to each tenant of a multi-tenant provider.' },
  { key: 'AccessTokenResponseFormat', description: 'Format of the access token endpoint call.', values: ['json'] },
  { key: 'token_endpoint_auth_method', description: 'How B2C authenticates to the token endpoint.', values: ['client_secret_post', 'client_secret_basic', 'private_key_jwt'] },
  { key: 'IncludeClaimResolvingInClaimsHandling', description: 'Resolve claim resolvers in input and output claims.', values: ['true', 'false'] },
];

export const TP_KINDS: Record<TpKind, TpKindInfo> = {
  selfAsserted: {
    kind: 'selfAsserted',
    label: 'Self-asserted page',
    icon: 'web',
    description: 'Shows a page to the user to collect or display claims. Can call validation technical profiles.',
    docs: DOCS + 'self-asserted-technical-profile',
    protocol: { name: 'Proprietary', handler: H('SelfAssertedAttributeProvider') },
    interactive: true,
    metadata: [
      { key: 'ContentDefinitionReferenceId', description: 'Content definition (page layout) used by this page.', required: true },
      { key: 'setting.showContinueButton', description: 'Show the continue button.', values: ['true', 'false'] },
      { key: 'setting.showCancelButton', description: 'Show the cancel button.', values: ['true', 'false'] },
      { key: 'setting.operatingMode', description: 'Sign-in page mode.', values: ['Email', 'Username'] },
      { key: 'setting.forgotPasswordLinkLocation', description: 'Where to show the forgot password link.', values: ['AfterLabel', 'AfterInput', 'AfterButtons', 'None'] },
      { key: 'setting.enableRememberMe', description: 'Show the Keep me signed in checkbox.', values: ['true', 'false'] },
      { key: 'setting.inputVerificationDelayTimeInMilliseconds', description: 'Delay before validating input.' },
      { key: 'setting.retryLimit', description: 'Number of retries before the journey fails.' },
      { key: 'SignUpTarget', description: 'Claims exchange (in the next orchestration step) started by the sign-up link.' },
      { key: 'EnforceEmailVerification', description: 'Require email verification on sign-up/password reset.', values: ['true', 'false'] },
      { key: 'IncludeClaimResolvingInClaimsHandling', description: 'Resolve claim resolvers in input and output claims.', values: ['true', 'false'] },
      { key: 'IpAddressClaimReferenceId', description: 'Claim that receives the user IP address.' },
      { key: 'language.button_continue', description: 'Localized label of the continue button.' },
    ],
  },
  entraId: {
    kind: 'entraId',
    label: 'Directory (Entra ID)',
    icon: 'database',
    description: 'Reads, writes or deletes the user account in the B2C directory.',
    docs: DOCS + 'active-directory-technical-profile',
    protocol: { name: 'Proprietary', handler: H('AzureActiveDirectoryProvider') },
    interactive: false,
    metadata: [
      { key: 'Operation', description: 'Directory operation.', values: ['Read', 'Write', 'DeleteClaims', 'DeleteClaimsPrincipal'], required: true },
      { key: 'RaiseErrorIfClaimsPrincipalDoesNotExist', description: 'Raise an error if the user does not exist. When false, the output claims may be missing.', values: ['true', 'false'] },
      { key: 'RaiseErrorIfClaimsPrincipalAlreadyExists', description: 'Raise an error if the user already exists (Write).', values: ['true', 'false'] },
      { key: 'ApplicationObjectId', description: 'Object ID of the extensions app (custom attributes).' },
      { key: 'ClientId', description: 'Application ID of the extensions app (custom attributes).' },
      { key: 'UserMessageIfClaimsPrincipalDoesNotExist', description: 'Error message when the user does not exist.' },
      { key: 'UserMessageIfClaimsPrincipalAlreadyExists', description: 'Error message when the user already exists.' },
    ],
  },
  rest: {
    kind: 'rest',
    label: 'REST API',
    icon: 'api',
    description: 'Calls your REST API to validate, enrich or send claims.',
    docs: DOCS + 'restful-technical-profile',
    protocol: { name: 'Proprietary', handler: H('RestfulProvider') },
    interactive: false,
    metadata: [
      { key: 'ServiceUrl', description: 'URL of the REST API endpoint.', required: true },
      { key: 'AuthenticationType', description: 'Authentication used to call the API.', values: ['None', 'Basic', 'Bearer', 'ClientCertificate', 'ApiKeyHeader'], required: true },
      { key: 'SendClaimsIn', description: 'How input claims are sent.', values: ['Body', 'Form', 'Header', 'Url', 'QueryString'] },
      { key: 'ClaimsFormat', description: 'Format of the claims in the response.', values: ['Body', 'Form', 'Header', 'Url', 'QueryString'] },
      { key: 'ClaimUsedForRequestPayload', description: 'String claim whose value is sent as the request body.' },
      { key: 'DebugMode', description: 'Return detailed error messages.', values: ['true', 'false'] },
      { key: 'AllowInsecureAuthInProduction', description: 'Allow AuthenticationType None in production.', values: ['true', 'false'] },
      { key: 'DefaultUserMessageIfRequestFailed', description: 'Error message for all REST API exceptions.' },
      { key: 'UserMessageIfCircuitOpen', description: 'Error message when the API is unreachable.' },
      { key: 'ResolveJsonPathsInJsonTokens', description: 'Resolve JSON paths in the response.', values: ['true', 'false'] },
      { key: 'UseClaimAsBearerToken', description: 'Claim holding the bearer token.' },
    ],
  },
  claimsTransformation: {
    kind: 'claimsTransformation',
    label: 'Claims transformation',
    icon: 'transform',
    description: 'Runs output claims transformations without any external call.',
    docs: DOCS + 'claims-transformation-technical-profile',
    protocol: { name: 'Proprietary', handler: H('ClaimsTransformationProtocolProvider') },
    interactive: false,
    metadata: [{ key: 'IncludeClaimResolvingInClaimsHandling', description: 'Resolve claim resolvers.', values: ['true', 'false'] }],
  },
  oauth2: {
    kind: 'oauth2',
    label: 'OAuth2 identity provider',
    icon: 'login',
    description: 'Federates with an OAuth 2.0 identity provider (for example Facebook).',
    docs: DOCS + 'oauth2-technical-profile',
    protocol: { name: 'OAuth2' },
    interactive: true,
    metadata: commonIdp,
  },
  oauth1: {
    kind: 'oauth1',
    label: 'OAuth1 identity provider',
    icon: 'login',
    description: 'Federates with an OAuth 1.0 identity provider (for example X/Twitter).',
    docs: DOCS + 'oauth1-technical-profile',
    protocol: { name: 'OAuth1' },
    interactive: true,
    metadata: [
      { key: 'ProviderName', description: 'Name of the identity provider.' },
      { key: 'client_id', description: 'Consumer key.', required: true },
      { key: 'request_token_endpoint', description: 'Request token endpoint.' },
      { key: 'authorization_endpoint', description: 'Authorization endpoint.' },
      { key: 'access_token_endpoint', description: 'Access token endpoint.' },
      { key: 'ClaimsEndpoint', description: 'User info endpoint.' },
    ],
  },
  oidc: {
    kind: 'oidc',
    label: 'OpenID Connect identity provider',
    icon: 'login',
    description: 'Federates with an OpenID Connect identity provider, or signs in a local account (login-NonInteractive).',
    docs: DOCS + 'openid-connect-technical-profile',
    protocol: { name: 'OpenIdConnect' },
    interactive: true,
    metadata: commonIdp,
  },
  saml: {
    kind: 'saml',
    label: 'SAML identity provider',
    icon: 'login',
    description: 'Federates with a SAML 2.0 identity provider.',
    docs: DOCS + 'identity-provider-generic-saml',
    protocol: { name: 'SAML2' },
    interactive: true,
    metadata: [
      { key: 'PartnerEntity', description: 'URL of the identity provider metadata.', required: true },
      { key: 'WantsSignedRequests', description: 'Sign authentication requests.', values: ['true', 'false'] },
      { key: 'XmlSignatureAlgorithm', description: 'Signature algorithm.', values: ['Sha1', 'Sha256', 'Sha384', 'Sha512'] },
      { key: 'IssuerUri', description: 'Issuer URI of the SAML response.' },
    ],
  },
  jwtIssuer: {
    kind: 'jwtIssuer',
    label: 'JWT token issuer',
    icon: 'token',
    description: 'Issues the JWT returned to the relying party application (SendClaims step).',
    docs: DOCS + 'jwt-issuer-technical-profile',
    protocol: { name: 'OpenIdConnect' },
    outputTokenFormat: 'JWT',
    interactive: false,
    metadata: [
      { key: 'client_id', description: 'Usually {service:te}.' },
      { key: 'issuer_refresh_token_user_identity_claim_type', description: 'Claim used as the user identity in refresh tokens.' },
      { key: 'SendTokenResponseBodyWithJsonNumbers', description: 'Send numeric values as JSON numbers.', values: ['true', 'false'] },
      { key: 'token_lifetime_secs', description: 'Access token lifetime in seconds.' },
      { key: 'id_token_lifetime_secs', description: 'ID token lifetime in seconds.' },
      { key: 'refresh_token_lifetime_secs', description: 'Refresh token lifetime in seconds.' },
      { key: 'IssuanceClaimPattern', description: 'Issuer (iss) claim format.', values: ['AuthorityAndTenantGuid', 'AuthorityWithTfp'] },
      { key: 'AuthenticationContextReferenceClaimPattern', description: 'acr claim value.', values: ['None', 'PolicyId'] },
    ],
  },
  samlIssuer: {
    kind: 'samlIssuer',
    label: 'SAML token issuer',
    icon: 'token',
    description: 'Issues the SAML token returned to the relying party application.',
    docs: DOCS + 'saml-issuer-technical-profile',
    protocol: { name: 'SAML2' },
    outputTokenFormat: 'SAML2',
    interactive: false,
    metadata: [
      { key: 'IssuerUri', description: 'Issuer name in the SAML response.' },
      { key: 'TokenLifeTimeInSeconds', description: 'Lifetime of the SAML assertion.' },
    ],
  },
  phoneFactor: {
    kind: 'phoneFactor',
    label: 'Phone factor',
    icon: 'phone',
    description: 'Enrolls and verifies a phone number for MFA.',
    docs: DOCS + 'phone-factor-technical-profile',
    protocol: { name: 'Proprietary', handler: H('PhoneFactorProtocolProvider') },
    interactive: true,
    metadata: [
      { key: 'ContentDefinitionReferenceId', description: 'Content definition of the MFA page.', required: true },
      { key: 'ManualPhoneNumberEntryAllowed', description: 'Allow the user to enter a phone number manually.', values: ['true', 'false'] },
      { key: 'setting.authenticationMode', description: 'Validation method.', values: ['sms', 'phone', 'mixed'] },
      { key: 'setting.autodial', description: 'Call or SMS automatically.', values: ['true', 'false'] },
    ],
  },
  mfa: {
    kind: 'mfa',
    label: 'Entra multifactor authentication',
    icon: 'phone',
    description: 'Sends and verifies codes using Entra multifactor authentication (usually as a validation profile).',
    docs: DOCS + 'multi-factor-auth-technical-profile',
    protocol: { name: 'Proprietary', handler: H('AzureMfaProtocolProvider') },
    interactive: false,
    metadata: [{ key: 'Operation', description: 'MFA operation.', values: ['OneWaySMS', 'Verify'], required: true }],
  },
  otp: {
    kind: 'otp',
    label: 'One-time password',
    icon: 'pin',
    description: 'Generates and verifies one-time codes.',
    docs: DOCS + 'one-time-password-technical-profile',
    protocol: { name: 'Proprietary', handler: H('OneTimePasswordProtocolProvider') },
    interactive: false,
    metadata: [
      { key: 'Operation', description: 'Operation.', values: ['GenerateCode', 'VerifyCode'], required: true },
      { key: 'CodeExpirationInSeconds', description: 'Code lifetime.' },
      { key: 'CodeLength', description: 'Code length.' },
      { key: 'CharacterSet', description: 'Allowed characters.' },
      { key: 'NumRetryAttempts', description: 'Verification attempts before the code is invalid.' },
    ],
  },
  session: {
    kind: 'session',
    label: 'Session management',
    icon: 'session',
    description: 'Manages single sign-on session state for other technical profiles.',
    docs: DOCS + 'custom-policy-reference-sso',
    protocol: { name: 'Proprietary', handler: SSO('DefaultSSOSessionProvider') },
    interactive: false,
    metadata: [{ key: 'AlwaysFetchClaimsFromProvider', description: 'Always call the provider (external login sessions).', values: ['true', 'false'] }],
  },
  appInsights: {
    kind: 'appInsights',
    label: 'Application Insights',
    icon: 'insights',
    description: 'Sends event data to Application Insights.',
    docs: DOCS + 'analytics-with-application-insights',
    protocol: { name: 'Proprietary', handler: 'Web.TPEngine.Providers.Insights.AzureApplicationInsightsProvider, Web.TPEngine, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null' },
    interactive: false,
    metadata: [
      { key: 'InstrumentationKey', description: 'Application Insights instrumentation key.', required: true },
      { key: 'DeveloperMode', description: 'Speed up telemetry for development.', values: ['true', 'false'] },
      { key: 'DisableTelemetry', description: 'Disable telemetry.', values: ['true', 'false'] },
    ],
  },
  idTokenHint: {
    kind: 'idTokenHint',
    label: 'ID token hint',
    icon: 'token',
    description: 'Validates an id_token_hint sent by the relying party and extracts its claims.',
    docs: DOCS + 'id-token-hint',
    protocol: { name: 'None' },
    interactive: false,
    metadata: [
      { key: 'METADATA', description: 'Token issuer metadata URL.' },
      { key: 'IdTokenAudience', description: 'Expected audience.' },
      { key: 'issuer', description: 'Expected issuer.' },
    ],
  },
  conditionalAccess: {
    kind: 'conditionalAccess',
    label: 'Conditional Access',
    icon: 'shield',
    description: 'Evaluates or remediates Entra Conditional Access.',
    docs: DOCS + 'conditional-access-technical-profile',
    protocol: { name: 'Proprietary', handler: H('ConditionalAccessProtocolProvider') },
    interactive: false,
    metadata: [{ key: 'OperationType', description: 'Operation.', values: ['Evaluation', 'Remediation'], required: true }],
  },
  oauth2Error: {
    kind: 'oauth2Error',
    label: 'OAuth2 custom error',
    icon: 'error',
    description: 'Returns a custom error to the relying party application.',
    docs: DOCS + 'oauth2-error-technical-profile',
    protocol: { name: 'None' },
    outputTokenFormat: 'OAuth2Error',
    interactive: false,
    metadata: [],
  },
  engine: {
    kind: 'engine',
    label: 'Policy engine',
    icon: 'settings',
    description: 'Built-in policy engine profile (Protocol None).',
    docs: DOCS + 'technicalprofiles',
    protocol: { name: 'None' },
    interactive: false,
    metadata: [],
  },
  unknown: {
    kind: 'unknown',
    label: 'Technical profile',
    icon: 'settings',
    description: 'Protocol not set yet (it may come from an included technical profile).',
    docs: DOCS + 'technicalprofiles',
    interactive: false,
    metadata: [],
  },
};

export const PROTOCOL_NAMES = ['OAuth1', 'OAuth2', 'SAML2', 'OpenIdConnect', 'Proprietary', 'None'] as const;

export function classifyTechnicalProfile(tp: Pick<TechnicalProfileDef, 'protocol' | 'outputTokenFormat' | 'id' | 'metadata'>): TpKind {
  const name = tp.protocol?.name?.trim();
  const handler = tp.protocol?.handler ?? '';
  const fmt = tp.outputTokenFormat?.toUpperCase();
  if (!name) return 'unknown';
  if (name === 'Proprietary') {
    if (/SelfAssertedAttributeProvider/i.test(handler)) return 'selfAsserted';
    if (/AzureActiveDirectoryProvider/i.test(handler)) return 'entraId';
    if (/RestfulProvider/i.test(handler)) return 'rest';
    if (/ClaimsTransformationProtocolProvider/i.test(handler)) return 'claimsTransformation';
    if (/PhoneFactorProtocolProvider/i.test(handler)) return 'phoneFactor';
    if (/AzureMfaProtocolProvider/i.test(handler)) return 'mfa';
    if (/OneTimePasswordProtocolProvider/i.test(handler)) return 'otp';
    if (/\.SSO\./i.test(handler) || /SSOSessionProvider/i.test(handler)) return 'session';
    if (/ApplicationInsights/i.test(handler)) return 'appInsights';
    if (/ConditionalAccess/i.test(handler)) return 'conditionalAccess';
    return 'unknown';
  }
  if (name === 'OAuth2') return 'oauth2';
  if (name === 'OAuth1') return 'oauth1';
  if (name === 'SAML2') return fmt === 'SAML2' || fmt === 'SAML11' ? 'samlIssuer' : 'saml';
  if (name === 'OpenIdConnect') {
    const hasMetadataUrl = tp.metadata.some((m) => m.key === 'METADATA' || m.key === 'authorization_endpoint');
    if (fmt === 'JWT' && !hasMetadataUrl) return 'jwtIssuer';
    return 'oidc';
  }
  if (name === 'None') {
    if (fmt === 'OAUTH2ERROR') return 'oauth2Error';
    if (tp.metadata.some((m) => m.key === 'IdTokenAudience' || m.key === 'issuer')) return 'idTokenHint';
    return 'engine';
  }
  return 'unknown';
}
