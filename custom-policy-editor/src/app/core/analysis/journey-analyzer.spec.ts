import { loadSamplePack } from '../../../testing/samples';
import { idKey } from '../model/types';
import { buildChains, resolveChain } from '../resolve/resolve';
import { parseFile, PolicyFile } from '../workspace/workspace';
import { analyzeJourney, JourneyAnalysis, stepKey } from './journey-analyzer';

function effFor(files: PolicyFile[], leaf: string) {
  const docs = files.map(parseFile).map((f) => f.doc!);
  return resolveChain(buildChains(docs).find((c) => c.leaf.fileName === leaf)!);
}

describe('journey analyzer: SocialAndLocalAccounts sign up or sign in', () => {
  const eff = effFor(loadSamplePack('SocialAndLocalAccounts'), 'SignUpOrSignin.xml');
  const a = analyzeJourney(eff, 'SignUpOrSignIn');
  const step = (n: number, an: JourneyAnalysis = a) => an.steps.get(stepKey('SignUpOrSignIn', n))!;
  const before = (n: number, c: string) => step(n).before.get(idKey(c))?.availability ?? 'absent';
  /** Re-run the analysis assuming everything a named path decided. */
  const on = (label: string): JourneyAnalysis => {
    const p = a.namedPaths!.find((x) => x.label === label);
    if (!p) throw new Error(`no path ${label}: ${a.namedPaths!.map((x) => x.label).join(' | ')}`);
    return analyzeJourney(eff, 'SignUpOrSignIn', { assume: new Map(p.assume) });
  };

  it('lists the four named paths and the choices behind them', () => {
    expect(a.approximate).toBe(false);
    expect(a.namedPaths!.map((p) => p.label).sort()).toEqual([
      'Email signup',
      'Facebook, account found (objectId)',
      'Facebook, no account found (objectId missing)',
      'Local Account Signin',
    ]);
    expect(a.namedPaths!.every((p) => p.outcome === 'token')).toBe(true);
    const select = a.decisions.find((d) => d.id === 'select:SignUpOrSignIn#1')!;
    expect(select.options.map((o) => o.label).sort()).toEqual(['Email signup', 'Facebook', 'Local Account Signin']);
    expect(a.decisions.some((d) => d.id === 'claim:objectid')).toBe(true);
  });

  it('knows when each step runs overall', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => step(n).runs)).toEqual(['always', 'sometimes', 'sometimes', 'sometimes', 'sometimes', 'never', 'always']);
    expect(step(4).ranWhen).toEqual(['Facebook, no account found (objectId missing)']);
    expect(step(3).skipCount).toBeGreaterThan(0);
  });

  it('gives exact results for a scenario', () => {
    const runs = (label: string) => [1, 2, 3, 4, 5, 6, 7].map((n) => step(n, on(label)).runs);
    expect(runs('Local Account Signin')).toEqual(['always', 'never', 'never', 'never', 'always', 'never', 'always']);
    expect(runs('Email signup')).toEqual(['always', 'always', 'never', 'never', 'always', 'never', 'always']);
    expect(runs('Facebook, account found (objectId)')).toEqual(['always', 'always', 'always', 'never', 'never', 'never', 'always']);
    expect(runs('Facebook, no account found (objectId missing)')).toEqual(['always', 'always', 'always', 'always', 'never', 'never', 'always']);
    // Skipped by the first precondition (objectId exists) on the Facebook path where the account was found.
    expect(step(4, on('Facebook, account found (objectId)')).skippedBy.get(0)?.count).toBe(1);
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

  it('explains where a claim is missing', () => {
    const av = step(4).before.get('objectid')!;
    expect(av.availability).toBe('maybe');
    expect(av.missingIn.length).toBeGreaterThan(0);
  });

  it('keeps a password out of the claims bag after the page that collected it', () => {
    expect(step(2).before.has('password')).toBe(false);
    expect(step(7).before.has('password')).toBe(false);
  });
});

describe('journey analyzer: other packs', () => {
  it('handles the MFA pack and profile edit', () => {
    const files = loadSamplePack('SocialAndLocalAccountsWithMfa');
    const eff = effFor(files, 'SignUpOrSignin.xml');
    const a = analyzeJourney(eff, eff.relyingParty!.defaultUserJourney!.referenceId);
    expect(a.approximate).toBe(false);
    expect([...a.steps.values()].every((s) => s.runs !== 'unreached')).toBe(true);
    const pe = effFor(files, 'ProfileEdit.xml');
    const b = analyzeJourney(pe, 'ProfileEdit');
    expect(b.namedPaths!.map((p) => p.label).sort()).toEqual(['Facebook', 'Local Account Signin']);
  });
});
