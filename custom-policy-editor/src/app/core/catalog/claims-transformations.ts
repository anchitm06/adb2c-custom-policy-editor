/**
 * Catalog of claims transformation methods, from the Microsoft Learn reference pages
 * (boolean, date, general, integer, JSON, phone number, social accounts, string, string collection,
 * and StringCollection transformations).
 */

export interface CtParam {
  id: string;
  dataType: string;
  optional?: boolean;
  values?: string[];
  description?: string;
}

export interface CtClaim {
  tct: string;
  dataType?: string;
  optional?: boolean;
}

export interface CtMethod {
  method: string;
  group: string;
  description: string;
  inputs: CtClaim[];
  params: CtParam[];
  outputs: CtClaim[];
  /** Accepts any input claim / parameter names (for example GenerateJson). */
  dynamic?: boolean;
  /** Raises an error instead of producing output (Assert*). */
  assertion?: boolean;
  docs: string;
}

const D = 'https://learn.microsoft.com/azure/active-directory-b2c/';
const S = 'string';
const B = 'boolean';
const SC = 'stringCollection';

function m(group: string, docs: string, method: string, description: string, inputs: CtClaim[], params: CtParam[], outputs: CtClaim[], extra: Partial<CtMethod> = {}): CtMethod {
  return { method, group, description, inputs, params, outputs, docs: D + docs, ...extra };
}

const bool = (method: string, description: string, i: CtClaim[], p: CtParam[], o: CtClaim[], extra?: Partial<CtMethod>) =>
  m('Boolean', 'boolean-transformations#' + method.toLowerCase(), method, description, i, p, o, extra);
const date = (method: string, description: string, i: CtClaim[], p: CtParam[], o: CtClaim[], extra?: Partial<CtMethod>) =>
  m('Date', 'date-transformations#' + method.toLowerCase(), method, description, i, p, o, extra);
const gen = (method: string, description: string, i: CtClaim[], p: CtParam[], o: CtClaim[], extra?: Partial<CtMethod>) =>
  m('General', 'general-transformations#' + method.toLowerCase(), method, description, i, p, o, extra);
const int = (method: string, description: string, i: CtClaim[], p: CtParam[], o: CtClaim[], extra?: Partial<CtMethod>) =>
  m('Integer', 'integer-transformations#' + method.toLowerCase(), method, description, i, p, o, extra);
const json = (method: string, description: string, i: CtClaim[], p: CtParam[], o: CtClaim[], extra?: Partial<CtMethod>) =>
  m('JSON', 'json-transformations#' + method.toLowerCase(), method, description, i, p, o, extra);
const phone = (method: string, description: string, i: CtClaim[], p: CtParam[], o: CtClaim[], extra?: Partial<CtMethod>) =>
  m('Phone number', 'phone-number-claims-transformations#' + method.toLowerCase(), method, description, i, p, o, extra);
const social = (method: string, description: string, i: CtClaim[], p: CtParam[], o: CtClaim[], extra?: Partial<CtMethod>) =>
  m('Social accounts', 'social-transformations#' + method.toLowerCase(), method, description, i, p, o, extra);
const str = (method: string, description: string, i: CtClaim[], p: CtParam[], o: CtClaim[], extra?: Partial<CtMethod>) =>
  m('String', 'string-transformations#' + method.toLowerCase(), method, description, i, p, o, extra);
const coll = (method: string, description: string, i: CtClaim[], p: CtParam[], o: CtClaim[], extra?: Partial<CtMethod>) =>
  m('String collection', 'stringcollection-transformations#' + method.toLowerCase(), method, description, i, p, o, extra);

const OPS = ['Equal', 'NotEqual'];
const CMP = ['ordinal', 'ordinalIgnoreCase'];

export const CLAIMS_TRANSFORMATIONS: CtMethod[] = [
  // Boolean
  bool('AndClaims', 'Computes a logical AND of two boolean claims.', [{ tct: 'inputClaim1', dataType: B }, { tct: 'inputClaim2', dataType: B }], [], [{ tct: 'outputClaim', dataType: B }]),
  bool('AssertBooleanClaimIsEqualToValue', 'Raises an error unless the boolean claim equals the given value.', [{ tct: 'inputClaim', dataType: B }], [{ id: 'valueToCompareTo', dataType: B }], [], { assertion: true }),
  bool('CompareBooleanClaimToValue', 'Compares a boolean claim to a value and outputs the result.', [{ tct: 'inputClaim', dataType: B }], [{ id: 'valueToCompareTo', dataType: B }], [{ tct: 'compareResult', dataType: B }]),
  bool('NotClaims', 'Computes a logical NOT of a boolean claim.', [{ tct: 'inputClaim', dataType: B }], [], [{ tct: 'outputClaim', dataType: B }]),
  bool('OrClaims', 'Computes a logical OR of two boolean claims.', [{ tct: 'inputClaim1', dataType: B }, { tct: 'inputClaim2', dataType: B }], [], [{ tct: 'outputClaim', dataType: B }]),
  // Date
  date('AssertDateTimeIsGreaterThan', 'Raises an error unless the left date is later than the right date.', [{ tct: 'leftOperand', dataType: S }, { tct: 'rightOperand', dataType: S }], [
    { id: 'AssertIfEqualTo', dataType: B }, { id: 'AssertIfRightOperandIsNotPresent', dataType: B }, { id: 'TreatAsEqualIfWithinMillseconds', dataType: 'int', optional: true },
  ], [], { assertion: true }),
  date('ConvertDateTimeToDateClaim', 'Converts a dateTime claim to a date claim.', [{ tct: 'inputClaim', dataType: 'dateTime' }], [], [{ tct: 'outputClaim', dataType: 'date' }]),
  date('ConvertDateToDateTimeClaim', 'Converts a date claim to a dateTime claim.', [{ tct: 'inputClaim', dataType: 'date' }], [], [{ tct: 'outputClaim', dataType: 'dateTime' }]),
  date('DateTimeComparison', 'Compares two dates and outputs whether the comparison holds.', [{ tct: 'firstDateTime', dataType: 'dateTime' }, { tct: 'secondDateTime', dataType: 'dateTime' }], [
    { id: 'operator', dataType: S, values: ['same as', 'later than', 'earlier than'] }, { id: 'timeSpanInSeconds', dataType: 'int' },
  ], [{ tct: 'result', dataType: B }]),
  date('GetCurrentDateTime', 'Outputs the current UTC date and time.', [], [], [{ tct: 'currentDateTime', dataType: 'dateTime' }]),
  date('IsTermsOfUseConsentRequired', 'Determines whether the user must consent to updated terms of use.', [{ tct: 'termsOfUseConsentDateTime', dataType: 'dateTime', optional: true }], [{ id: 'termsOfUseTextUpdateDateTime', dataType: 'dateTime' }], [{ tct: 'result', dataType: B }]),
  // General
  gen('CopyClaim', 'Copies a claim value to another claim.', [{ tct: 'inputClaim' }], [], [{ tct: 'outputClaim' }]),
  gen('DoesClaimExist', 'Outputs whether the input claim exists.', [{ tct: 'inputClaim' }], [], [{ tct: 'outputClaim', dataType: B }]),
  gen('Hash', 'Hashes plain text with a salt and secret.', [{ tct: 'plaintext', dataType: S }, { tct: 'salt', dataType: S }], [{ id: 'randomizerSecret', dataType: S }], [{ tct: 'hash', dataType: S }]),
  // Integer
  int('AdjustNumber', 'Increases or decreases a number claim.', [{ tct: 'inputClaim', dataType: 'int' }], [{ id: 'Operator', dataType: S, values: ['INCREMENT', 'DECREMENT'] }], [{ tct: 'outputClaim', dataType: 'int' }]),
  int('AssertNumber', 'Raises an error if the number comparison holds.', [{ tct: 'inputClaim', dataType: 'int' }], [
    { id: 'Operator', dataType: S, values: ['Equal', 'NotEqual', 'GreaterThan', 'GreaterThanOrEqual', 'LessThan', 'LessThanOrEqual'] }, { id: 'CompareToValue', dataType: 'int' }, { id: 'throwError', dataType: B, optional: true },
  ], [], { assertion: true }),
  int('ConvertNumberToStringClaim', 'Converts a long claim to a string.', [{ tct: 'inputClaim', dataType: 'long' }], [], [{ tct: 'outputClaim', dataType: S }]),
  // JSON
  json('GenerateJson', 'Builds a JSON string from claims and constants.', [], [], [{ tct: 'outputClaim', dataType: S }], { dynamic: true }),
  json('GetClaimFromJson', 'Extracts one element from JSON data.', [{ tct: 'inputJson', dataType: S }], [{ id: 'claimToExtract', dataType: S }], [{ tct: 'extractedClaim' }]),
  json('GetClaimsFromJsonArray', 'Extracts elements from a JSON array into claims.', [{ tct: 'jsonSourceClaim', dataType: S }], [
    { id: 'errorOnMissingClaims', dataType: B }, { id: 'includeEmptyClaims', dataType: B }, { id: 'jsonSourceKeyName', dataType: S }, { id: 'jsonSourceValueName', dataType: S },
  ], [], { dynamic: true }),
  json('GetNumericClaimFromJson', 'Extracts a numeric element from JSON data.', [{ tct: 'inputJson', dataType: S }], [{ id: 'claimToExtract', dataType: S }], [{ tct: 'extractedClaim', dataType: 'long' }]),
  json('GetSingleItemFromJson', 'Gets the first key/value pair from JSON data.', [{ tct: 'inputJson', dataType: S }], [], [{ tct: 'key', dataType: S }, { tct: 'value', dataType: S }]),
  json('GetSingleValueFromJsonArray', 'Gets the first element of a JSON array.', [{ tct: 'inputJsonClaim', dataType: S }], [], [{ tct: 'extractedClaim', dataType: S }]),
  json('XmlStringToJsonString', 'Converts XML data to JSON.', [{ tct: 'xml', dataType: S }], [], [{ tct: 'json', dataType: S }]),
  // Phone
  phone('ConvertPhoneNumberClaimToString', 'Converts a phoneNumber claim to a string.', [{ tct: 'phoneNumber', dataType: 'phoneNumber' }], [], [{ tct: 'phoneNumberString', dataType: S }]),
  phone('ConvertStringToPhoneNumberClaim', 'Validates and converts a string to a phoneNumber claim.', [{ tct: 'phoneNumberString', dataType: S }, { tct: 'country', dataType: S, optional: true }], [], [{ tct: 'outputClaim', dataType: 'phoneNumber' }]),
  phone('GetNationalNumberAndCountryCodeFromPhoneNumberString', 'Splits a phone number into national number and country code.', [{ tct: 'phoneNumber', dataType: S }], [
    { id: 'ThrowExceptionOnFailure', dataType: B, optional: true }, { id: 'CountryCodeType', dataType: S, optional: true, values: ['CallingCode', 'ISO3166'] },
  ], [{ tct: 'nationalNumber', dataType: S }, { tct: 'countryCode', dataType: S }]),
  // Social
  social('AddItemToAlternativeSecurityIdCollection', 'Adds an alternativeSecurityId to a collection.', [{ tct: 'item', dataType: S }, { tct: 'collection', dataType: 'alternativeSecurityIdCollection' }], [], [{ tct: 'collection', dataType: 'alternativeSecurityIdCollection' }]),
  social('CreateAlternativeSecurityId', 'Creates an alternativeSecurityId from the user ID and identity provider.', [{ tct: 'key', dataType: S }, { tct: 'identityProvider', dataType: S }], [], [{ tct: 'alternativeSecurityId', dataType: S }]),
  social('GetIdentityProvidersFromAlternativeSecurityIdCollectionTransformation', 'Lists identity providers from an alternativeSecurityId collection.', [{ tct: 'alternativeSecurityIdCollection', dataType: 'alternativeSecurityIdCollection' }], [], [{ tct: 'identityProvidersCollection', dataType: SC }]),
  social('RemoveAlternativeSecurityIdByIdentityProvider', 'Removes an identity provider from an alternativeSecurityId collection.', [{ tct: 'identityProvider', dataType: S }, { tct: 'collection', dataType: 'alternativeSecurityIdCollection' }], [], [{ tct: 'collection', dataType: 'alternativeSecurityIdCollection' }]),
  // String
  str('AssertStringClaimsAreEqual', 'Raises an error unless two string claims are equal.', [{ tct: 'inputClaim1', dataType: S }, { tct: 'inputClaim2', dataType: S }], [{ id: 'stringComparison', dataType: S, values: CMP }], [], { assertion: true }),
  str('BuildUri', 'Builds a URI from a path and query parameters.', [{ tct: 'path', dataType: S }], [], [{ tct: 'outputClaim', dataType: S }], { dynamic: true }),
  str('ChangeCase', 'Changes the case of a string claim.', [{ tct: 'inputClaim1', dataType: S }], [{ id: 'toCase', dataType: S, values: ['LOWER', 'UPPER'] }], [{ tct: 'outputClaim1', dataType: S }]),
  str('CompareClaims', 'Compares two string claims.', [{ tct: 'inputClaim1', dataType: S }, { tct: 'inputClaim2', dataType: S }], [{ id: 'operator', dataType: S, values: OPS }, { id: 'ignoreCase', dataType: B }], [{ tct: 'outputClaim', dataType: B }]),
  str('CompareClaimToValue', 'Compares a string claim to a constant.', [{ tct: 'inputClaim1', dataType: S }], [{ id: 'compareTo', dataType: S }, { id: 'operator', dataType: S, values: OPS }, { id: 'ignoreCase', dataType: B }], [{ tct: 'outputClaim', dataType: B }]),
  str('CopyClaimIfPredicateMatch', 'Copies the claim if it matches a predicate.', [{ tct: 'inputClaim', dataType: S }], [], [{ tct: 'outputClaim', dataType: S }], { dynamic: true }),
  str('CreateRandomString', 'Creates a random GUID or integer string.', [], [
    { id: 'randomGeneratorType', dataType: S, values: ['GUID', 'INTEGER'] }, { id: 'stringFormat', dataType: S, optional: true }, { id: 'base64', dataType: B, optional: true }, { id: 'maximumNumber', dataType: 'int', optional: true }, { id: 'seed', dataType: 'int', optional: true },
  ], [{ tct: 'outputClaim', dataType: S }]),
  str('CreateStringClaim', 'Creates a string claim with a constant value.', [], [{ id: 'value', dataType: S }], [{ tct: 'createdClaim', dataType: S }]),
  str('FormatLocalizedString', 'Formats claims using a localized format string.', [], [{ id: 'stringFormatId', dataType: S }], [{ tct: 'outputClaim', dataType: S }], { dynamic: true }),
  str('FormatStringClaim', 'Formats one claim with a format string ({0}).', [{ tct: 'inputClaim', dataType: S }], [{ id: 'stringFormat', dataType: S }], [{ tct: 'outputClaim', dataType: S }]),
  str('FormatStringMultipleClaims', 'Formats two claims with a format string ({0} {1}).', [{ tct: 'inputClaim1', dataType: S }, { tct: 'inputClaim2', dataType: S }], [{ id: 'stringFormat', dataType: S }], [{ tct: 'outputClaim', dataType: S }]),
  str('GetLocalizedStringsTransformation', 'Copies localized strings into claims.', [], [], [], { dynamic: true }),
  str('GetMappedValueFromLocalizedCollection', 'Maps a value to its localized restriction text.', [{ tct: 'mapFromClaim', dataType: S }], [], [{ tct: 'restrictionValueClaim', dataType: S }]),
  str('LookupValue', 'Looks up a value in a list of input parameters.', [{ tct: 'inputParameterId', dataType: S }], [{ id: 'errorOnFailedLookup', dataType: B, optional: true }], [{ tct: 'outputClaim', dataType: S }], { dynamic: true }),
  str('NullClaim', 'Clears the value of a claim.', [], [], [{ tct: 'claim_to_null' }]),
  str('ParseDomain', 'Extracts the domain part of an email address.', [{ tct: 'emailAddress', dataType: S }], [], [{ tct: 'domain', dataType: S }]),
  str('SetClaimIfBooleansMatch', 'Sets a claim if a boolean claim matches a value.', [{ tct: 'claimToMatch', dataType: B }], [{ id: 'matchTo', dataType: B }, { id: 'outputClaimIfMatched', dataType: S }], [{ tct: 'outputClaim', dataType: S }]),
  str('SetClaimsIfRegexMatch', 'Sets claims if a string matches a regular expression.', [{ tct: 'claimToMatch', dataType: S }], [
    { id: 'matchTo', dataType: S }, { id: 'outputClaimIfMatched', dataType: S }, { id: 'extractGroups', dataType: B, optional: true },
  ], [{ tct: 'outputClaim', dataType: S }, { tct: 'regexCompareResultClaim', dataType: B }]),
  str('SetClaimsIfStringsAreEqual', 'Sets claims if two strings are equal.', [{ tct: 'inputClaim1', dataType: S }, { tct: 'inputClaim2', dataType: S }], [
    { id: 'matchTo', dataType: S }, { id: 'stringComparison', dataType: S, values: CMP }, { id: 'stringMatchMsg', dataType: S }, { id: 'stringMatchMsgCode', dataType: S },
  ], [{ tct: 'outputClaim1', dataType: S }, { tct: 'outputClaim2', dataType: S }, { tct: 'stringCompareResultClaim', dataType: B }]),
  str('SetClaimsIfStringsMatch', 'Sets claims if a string matches a constant.', [{ tct: 'claimToMatch', dataType: S }], [
    { id: 'matchTo', dataType: S }, { id: 'stringComparison', dataType: S, values: CMP }, { id: 'outputClaimIfMatched', dataType: S },
  ], [{ tct: 'outputClaim', dataType: S }, { tct: 'stringCompareResultClaim', dataType: B }]),
  str('StringContains', 'Outputs whether a string contains a value.', [{ tct: 'inputClaim', dataType: S }], [{ id: 'contains', dataType: S }, { id: 'ignoreCase', dataType: S }], [{ tct: 'outputClaim', dataType: B }]),
  str('StringIndexOf', 'Outputs the index of a value in a string.', [{ tct: 'inputClaim', dataType: S }], [{ id: 'value', dataType: S }], [{ tct: 'outputClaim', dataType: 'int' }]),
  str('StringJoin', 'Joins a string collection into a string.', [{ tct: 'inputClaim', dataType: SC }], [{ id: 'delimiter', dataType: S }], [{ tct: 'outputClaim', dataType: S }]),
  str('StringReplace', 'Replaces a value in a string.', [{ tct: 'inputClaim', dataType: S }], [{ id: 'oldValue', dataType: S }, { id: 'newValue', dataType: S }], [{ tct: 'outputClaim', dataType: S }]),
  str('StringSplit', 'Splits a string into a string collection.', [{ tct: 'inputClaim', dataType: S }], [{ id: 'delimiter', dataType: S }], [{ tct: 'outputClaim', dataType: SC }]),
  str('StringSubstring', 'Extracts part of a string.', [{ tct: 'inputClaim', dataType: S }], [{ id: 'startIndex', dataType: 'int' }, { id: 'length', dataType: 'int' }], [{ tct: 'outputClaim', dataType: S }]),
  // String collection
  coll('AddItemToStringCollection', 'Adds a string claim to a string collection.', [{ tct: 'item', dataType: S }, { tct: 'collection', dataType: SC, optional: true }], [], [{ tct: 'collection', dataType: SC }]),
  coll('AddParameterToStringCollection', 'Adds a constant to a string collection.', [{ tct: 'collection', dataType: SC, optional: true }], [{ id: 'item', dataType: S }], [{ tct: 'collection', dataType: SC }]),
  coll('GetSingleItemFromStringCollection', 'Gets the first item of a string collection.', [{ tct: 'collection', dataType: SC }], [], [{ tct: 'extractedItem', dataType: S }]),
  coll('StringCollectionContains', 'Outputs whether a collection contains a constant.', [{ tct: 'inputClaim', dataType: SC }], [{ id: 'item', dataType: S }, { id: 'ignoreCase', dataType: S }], [{ tct: 'outputClaim', dataType: B }]),
  coll('StringCollectionContainsClaim', 'Outputs whether a collection contains a claim value.', [{ tct: 'collection', dataType: SC }, { tct: 'item', dataType: S }], [{ id: 'ignoreCase', dataType: S }], [{ tct: 'outputClaim', dataType: B }]),
  coll('RemoveItemFromStringCollection', 'Removes an item from a string collection.', [{ tct: 'item', dataType: S }, { tct: 'collection', dataType: SC }], [{ id: 'ignoreCase', dataType: S, optional: true }], [{ tct: 'collection', dataType: SC }]),
];

const BY_METHOD = new Map(CLAIMS_TRANSFORMATIONS.map((c) => [c.method.toLowerCase(), c]));

export function findTransformationMethod(method: string | undefined): CtMethod | undefined {
  return method ? BY_METHOD.get(method.toLowerCase()) : undefined;
}

export const DATA_TYPES = [
  'boolean',
  'date',
  'dateTime',
  'duration',
  'int',
  'long',
  'string',
  'stringCollection',
  'phoneNumber',
  'alternativeSecurityId',
  'alternativeSecurityIdCollection',
  'userIdentity',
  'userIdentityCollection',
] as const;

export const USER_INPUT_TYPES = [
  'TextBox',
  'EmailBox',
  'Password',
  'DateTimeDropdown',
  'RadioSingleSelect',
  'DropdownSingleSelect',
  'CheckboxMultiSelect',
  'Paragraph',
  'Readonly',
] as const;

export const SELECTION_INPUT_TYPES = ['RadioSingleSelect', 'DropdownSingleSelect', 'CheckboxMultiSelect'];

export const DATA_URI_CONTRACTS: { id: string; label: string; versions: string[] }[] = [
  { id: 'globalexception', label: 'Error page', versions: ['1.2.1', '1.2.0', '1.1.0'] },
  { id: 'providerselection', label: 'Identity provider selection', versions: ['1.2.1', '1.2.0', '1.0.0'] },
  { id: 'unifiedssp', label: 'Sign-in + sign-up (local accounts)', versions: ['2.1.18', '2.1.17', '2.1.10', '2.1.7', '1.2.0'] },
  { id: 'unifiedssd', label: 'Sign-in (social, unified)', versions: ['2.1.18', '1.2.0'] },
  { id: 'selfasserted', label: 'Self-asserted page', versions: ['2.1.30', '2.1.29', '2.1.17', '2.1.9', '1.2.0', '1.1.0'] },
  { id: 'multifactor', label: 'Multifactor authentication', versions: ['1.2.20', '1.2.12', '1.2.5', '1.2.0', '1.1.0'] },
];

export const PREDICATE_METHODS = [
  { method: 'IsLengthRange', params: ['Minimum', 'Maximum'] },
  { method: 'MatchesRegex', params: ['RegularExpression'] },
  { method: 'IncludesCharacters', params: ['CharacterSet'] },
  { method: 'IsDateRange', params: ['Minimum', 'Maximum'] },
];

export const DISPLAY_CONTROL_TYPES = ['VerificationControl', 'TOTPControl', 'CaptchaControl'];

export const USER_JOURNEY_BEHAVIOR_ELEMENTS = [
  'SingleSignOn',
  'SessionExpiryType',
  'SessionExpiryInSeconds',
  'JourneyInsights',
  'ContentDefinitionParameters',
  'JourneyFraming',
  'ScriptExecution',
];
