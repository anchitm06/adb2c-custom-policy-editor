import { loadSamplePack } from '../../../testing/samples';
import { idKey } from '../model/types';
import { buildChains, resolveChain } from '../resolve/resolve';
import { parseFile, PolicyFile } from '../workspace/workspace';
import { analyzeJourney, stepKey } from './journey-analyzer';

function effFor(files: PolicyFile[], leaf: string) {
  const docs = files.map(parseFile).map((f) => f.doc!);
  return resolveChain(buildChains(docs).find((c) => c.leaf.fileName === leaf)!);
}

describe('journey analyzer: SocialAndLocalAccounts sign up or sign in', () => {
  const eff = effFor(loadSamplePack('SocialAndLocalAccounts'), 'SignUpOrSignin.xml');
  const a = analyzeJourney(eff, 'SignUpOrSignIn');
  const step = (n: number) => a.steps.get(stepKey('SignUpOrSignIn', n))!;
  const before = (n: number, c: string) => step(n).before.get(idKey(c))?.availability ?? 'absent';
  const label = (id: number) => a.paths[id].label;

  it('finds the four named paths', () => {
    expect(a.truncated).toBe(false);
    const labels = a.paths.map((p) => p.label).sort();
    expect(labels).toEqual([
      'Email signup',
      'Facebook · account found (objectId)',
      'Facebook · no account found (objectId missing)',
      'Local Account Signin',
    ]);
    expect(a.paths.every((p) => p.outcome === 'token')).toBe(true);
  });

  it('knows when each step runs', () => {
    expect(step(1).runs).toBe('always');
    expect(step(2).runPaths.map(label).sort()).toEqual(['Email signup', 'Facebook · account found (objectId)', 'Facebook · no account found (objectId missing)']);
    expect(step(3).runPaths.map(label).sort()).toEqual(['Facebook · account found (objectId)', 'Facebook · no account found (objectId missing)']);
    expect(step(4).runPaths.map(label)).toEqual(['Facebook · no account found (objectId missing)']);
    expect(step(5).runPaths.map(label).sort()).toEqual(['Email signup', 'Local Account Signin']);
    expect(step(6).runs).toBe('never');
    expect(step(7).runs).toBe('always');
  });

  it('tracks the claims bag', () => {
    expect(before(1, 'objectId')).toBe('absent');
    expect(before(2, 'authenticationSource')).toBe('maybe');
    expect(before(4, 'objectId')).toBe('maybe');
    expect(before(7, 'objectId')).toBe('definitely');
    expect(step(5).before.get('authenticationsource')!.values.sort()).toEqual(['localAccountAuthentication', 'socialIdpAuthentication']);
    expect(step(2).produced).toContain('authenticationSource');
    const tc = new Map(a.tokenClaims.map((t) => [t.claim, t.availability.availability]));
    expect(tc.get('objectId')).toBe('definitely');
    expect(tc.get('tenantId')).toBe('definitely');
    expect(tc.get('identityProvider')).toBe('maybe');
  });
});

describe('journey analyzer: other packs', () => {
  it('handles the MFA pack and profile edit without blowing up', () => {
    const files = loadSamplePack('SocialAndLocalAccountsWithMfa');
    const eff = effFor(files, 'SignUpOrSignin.xml');
    const a = analyzeJourney(eff, eff.relyingParty!.defaultUserJourney!.referenceId);
    expect(a.paths.length).toBeGreaterThan(2);
    expect(a.truncated).toBe(false);
    const pe = effFor(files, 'ProfileEdit.xml');
    const b = analyzeJourney(pe, 'ProfileEdit');
    expect(b.paths.map((p) => p.label).sort()).toEqual(['Facebook', 'Local Account Signin']);
  });
});
