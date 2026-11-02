import { loadSamplePack } from '../../../testing/samples';
import { parseFile } from '../workspace/workspace';
import { buildChains, layerLabel, resolveChain } from './resolve';

function load() {
  const files = loadSamplePack('SocialAndLocalAccounts').map(parseFile);
  const docs = files.map((f) => f.doc!);
  return { files, docs, chains: buildChains(docs) };
}

describe('resolver', () => {
  it('builds one chain per relying party file', () => {
    const { chains } = load();
    expect(chains.map((c) => c.leaf.fileName).sort()).toEqual(['PasswordReset.xml', 'ProfileEdit.xml', 'SignUpOrSignin.xml']);
    const sus = chains.find((c) => c.leaf.fileName === 'SignUpOrSignin.xml')!;
    expect(sus.docs.map((d) => d.fileName)).toEqual(['TrustFrameworkBase.xml', 'TrustFrameworkLocalization.xml', 'TrustFrameworkExtensions.xml', 'SignUpOrSignin.xml']);
    expect(sus.problems).toEqual([]);
    expect(layerLabel(sus, sus.docs[0].fileId)).toBe('Base');
    expect(layerLabel(sus, sus.docs[2].fileId)).toBe('Extensions');
    expect(layerLabel(sus, sus.docs[3].fileId)).toBe('RP');
  });

  it('merges technical profile overrides and includes', () => {
    const { chains } = load();
    const eff = resolveChain(chains.find((c) => c.leaf.fileName === 'SignUpOrSignin.xml')!);
    const fb = eff.technicalProfiles.get('facebook-oauth')!;
    expect(fb.layers.length).toBe(2);
    expect(fb.value.metadata.find((m) => m.key === 'client_id')?.value).toBe('facebook_clientid');
    expect(fb.value.metadata.find((m) => m.key === 'ProviderName')?.value).toBe('facebook');

    const noErr = eff.tp('AAD-UserReadUsingAlternativeSecurityId-NoError')!;
    expect(noErr.kind).toBe('entraId');
    expect(noErr.includeChain).toEqual(['AAD-UserReadUsingAlternativeSecurityId', 'AAD-Common']);
    expect(noErr.metadata.find((m) => m.key === 'RaiseErrorIfClaimsPrincipalDoesNotExist')?.value).toBe('false');
    expect(noErr.outputClaims.map((c) => c.claimTypeReferenceId)).toContain('objectId');

    expect(eff.tp('SelfAsserted-LocalAccountSignin-Email')!.kind).toBe('selfAsserted');
    expect(eff.tp('JwtIssuer')!.kind).toBe('jwtIssuer');
    expect(eff.tp('login-NonInteractive')!.kind).toBe('oidc');
    expect(eff.relyingParty?.defaultUserJourney?.referenceId).toBe('SignUpOrSignIn');
    expect(eff.userJourneys.get('signuporsignin')!.value.steps.length).toBe(7);
  });
});
