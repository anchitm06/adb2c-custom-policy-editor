import { loadSamplePack } from '../../../testing/samples';
import { analyzeJourney } from '../analysis/journey-analyzer';
import { buildChains, resolveChain } from '../resolve/resolve';
import { parseFile, PolicyFile } from '../workspace/workspace';
import { defaultValueProblem, validateChain, validateFile } from './validate';

function run(files: PolicyFile[], leaf: string) {
  const parsed = files.map(parseFile);
  const chain = buildChains(parsed.map((f) => f.doc!)).find((c) => c.leaf.fileName === leaf)!;
  const eff = resolveChain(chain);
  const a = analyzeJourney(eff, eff.relyingParty!.defaultUserJourney!.referenceId);
  return [...parsed.flatMap((f) => validateFile(f, parsed)), ...validateChain(eff, [a])];
}

describe('validation', () => {
  for (const pack of ['SocialAndLocalAccounts', 'LocalAccounts', 'SocialAndLocalAccountsWithMfa']) {
    it(`reports no errors for the ${pack} starter pack`, () => {
      const diags = run(loadSamplePack(pack), 'SignUpOrSignin.xml');
      const errors = diags.filter((d) => d.severity === 'error');
      expect(errors.map((e) => e.message)).toEqual([]);
    });
  }

  it('catches broken references, ordering and selections', () => {
    const files = loadSamplePack('SocialAndLocalAccounts');
    const ext = files.find((f) => f.name === 'TrustFrameworkExtensions.xml')!;
    ext.text = ext.text.replace('<!--UserJourneys>', '<UserJourneys><UserJourney Id="Broken"><OrchestrationSteps>' +
      '<OrchestrationStep Order="1" Type="CombinedSignInAndSignUp" ContentDefinitionReferenceId="api.nope"><ClaimsProviderSelections><ClaimsProviderSelection TargetClaimsExchangeId="Missing" /></ClaimsProviderSelections></OrchestrationStep>' +
      '<OrchestrationStep Order="3" Type="ClaimsExchange"><Preconditions><Precondition Type="ClaimEquals" ExecuteActionsIf="true"><Value>nope</Value><Action>SkipThisOrchestrationStep</Action></Precondition></Preconditions><ClaimsExchanges><ClaimsExchange Id="X" TechnicalProfileReferenceId="NoSuchTP" /></ClaimsExchanges></OrchestrationStep>' +
      '</OrchestrationSteps></UserJourney></UserJourneys><!--');
    const diags = run(files, 'SignUpOrSignin.xml').filter((d) => d.severity === 'error').map((d) => d.code);
    expect(diags).toContain('journey.order');
    expect(diags).toContain('journey.sendClaims');
    expect(diags).toContain('step.selection.target');
    expect(diags).toContain('ref.unresolved');
    expect(diags).toContain('precondition');
  });

  const errorCodes = (files: PolicyFile[]) => run(files, 'SignUpOrSignin.xml').filter((d) => d.severity === 'error').map((d) => d.code);
  const edit = (name: string, from: string, to: string) => {
    const files = loadSamplePack('SocialAndLocalAccounts');
    const f = files.find((x) => x.name === name)!;
    expect(f.text).toContain(from);
    f.text = f.text.replace(from, to);
    return files;
  };

  it('requires a provider selection before a step with several exchanges', () => {
    const files = edit('TrustFrameworkBase.xml', '<ClaimsExchange Id="SelfAsserted-Social" TechnicalProfileReferenceId="SelfAsserted-Social" />', '<ClaimsExchange Id="SelfAsserted-Social" TechnicalProfileReferenceId="SelfAsserted-Social" /><ClaimsExchange Id="Second" TechnicalProfileReferenceId="SelfAsserted-Social" />');
    expect(errorCodes(files)).toContain('step.exchanges.noSelection');
  });

  it('requires a claims exchange step after a provider selection', () => {
    const files = edit('TrustFrameworkBase.xml', '<OrchestrationStep Order="2" Type="ClaimsExchange">', '<OrchestrationStep Order="2" Type="InvokeSubJourney">');
    expect(errorCodes(files)).toContain('step.selection.nextType');
  });

  it('flags relying party claims that no step produces', () => {
    const files = edit('SignUpOrSignin.xml', '<OutputClaim ClaimTypeReferenceId="displayName" />', '<OutputClaim ClaimTypeReferenceId="displayName" /><OutputClaim ClaimTypeReferenceId="loyaltyId" />');
    expect(errorCodes(files)).toContain('rp.outputNotProduced');
    const withDefault = edit('SignUpOrSignin.xml', '<OutputClaim ClaimTypeReferenceId="displayName" />', '<OutputClaim ClaimTypeReferenceId="displayName" /><OutputClaim ClaimTypeReferenceId="loyaltyId" DefaultValue="" />');
    expect(errorCodes(withDefault)).not.toContain('rp.outputNotProduced');
  });

  it('checks that default values fit the claim type', () => {
    expect(defaultValueProblem('int', 'ABCD')).toContain('whole number');
    expect(defaultValueProblem('int', '0')).toBeNull();
    expect(defaultValueProblem('boolean', 'yes')).toContain('true or false');
    expect(defaultValueProblem('boolean', 'True')).toBeNull();
    expect(defaultValueProblem('date', 'not a date')).toContain('date');
    expect(defaultValueProblem('string', 'anything')).toBeNull();
    expect(defaultValueProblem('int', '{Culture:LCID}')).toBeNull();
    expect(defaultValueProblem(undefined, 'x')).toBeNull();
  });
});
