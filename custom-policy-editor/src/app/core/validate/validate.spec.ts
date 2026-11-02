import { loadSamplePack } from '../../../testing/samples';
import { analyzeJourney } from '../analysis/journey-analyzer';
import { buildChains, resolveChain } from '../resolve/resolve';
import { parseFile, PolicyFile } from '../workspace/workspace';
import { validateChain, validateFile } from './validate';

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
});
