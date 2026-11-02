import { loadSamplePack } from '../../../testing/samples';
import { applyToText } from '../edit/apply';
import { setPreconditions } from '../edit/commands';
import { buildChains, resolveChain } from '../resolve/resolve';
import { validateChain } from '../validate/validate';
import { parseFile, PolicyFile } from '../workspace/workspace';
import { computeImpact } from './impact';
import { analyzeJourney } from './journey-analyzer';

function state(files: PolicyFile[]) {
  const docs = files.map(parseFile).map((f) => f.doc!);
  const eff = resolveChain(buildChains(docs).find((c) => c.leaf.fileName === 'SignUpOrSignin.xml')!);
  const analysis = analyzeJourney(eff, 'SignUpOrSignIn');
  return { eff, analysis, diagnostics: validateChain(eff, [analysis]) };
}

describe('impact', () => {
  it('reports run status and claim availability changes', () => {
    const files = loadSamplePack('SocialAndLocalAccounts');
    const before = state(files);
    const step2 = before.eff.userJourneys.get('signuporsignin')!.value.steps[1];
    // Remove "skip if objectId exists" from step 2: it now runs on the local sign-in path too.
    files[0].text = applyToText(files[0].text, (d) => setPreconditions(d, step2.ref, [], 'SkipThisOrchestrationStep'));
    const after = state(files);
    const impact = computeImpact(before, after);
    expect(impact.hasChanges).toBe(true);
    expect(impact.stepChanges.map((s) => `${s.order}:${s.to}`)).toContain('2:always');
    expect(impact.lines.some((l) => l.includes('step 2 now always runs'))).toBe(true);
  });
});
