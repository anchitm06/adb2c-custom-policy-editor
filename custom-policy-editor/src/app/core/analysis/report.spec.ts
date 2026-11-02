import { loadSamplePack } from '../../../testing/samples';
import { syntheticPolicy } from '../../../testing/synthetic-policy';
import { buildChains, resolveChain } from '../resolve/resolve';
import { parseFile, PolicyFile } from '../workspace/workspace';
import { buildAnalysisReport } from './report';

function effFor(files: PolicyFile[], leaf?: string) {
  const docs = files.map(parseFile).map((f) => f.doc!);
  const chains = buildChains(docs);
  return resolveChain(leaf ? chains.find((c) => c.leaf.fileName === leaf)! : chains[0]);
}

describe('analysis report', () => {
  it('summarises counts and timings and names nothing from the policy', () => {
    const files = loadSamplePack('SocialAndLocalAccounts');
    const eff = effFor(files, 'SignUpOrSignin.xml');
    const text = buildAnalysisReport({
      eff,
      diagnostics: [
        { key: 'k1', severity: 'warning', code: 'flow.input', message: 'objectId is missing here' },
        { key: 'k2', severity: 'error', code: 'ref.missing', message: 'Unknown claim secretClaimName' },
      ],
      fileCount: files.length,
      appVersion: 'abc1234',
    });
    expect(text).toContain('App version: abc1234');
    expect(text).toContain(`Files: ${files.length}`);
    expect(text).toMatch(/Journeys \(steps, choices/);
    expect(text).toContain('Alerts: 1 errors, 1 warnings, 0 information');
    expect(text).toContain('flow.input: 1');
    // Nothing that identifies the policy: no journey, profile, claim or file names, and no alert messages.
    for (const secret of ['SignUpOrSignIn', 'SignUpOrSignin.xml', 'objectId', 'AAD-Common', 'Facebook', 'secretClaimName', 'TrustFramework']) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it('copes with the 44 step journey', () => {
    const eff = effFor([syntheticPolicy({ steps: 44, optional: 14 })]);
    const text = buildAnalysisReport({ eff, diagnostics: [], fileCount: 1, appVersion: 'dev' });
    expect(text).toMatch(/44 steps/);
  });
});
