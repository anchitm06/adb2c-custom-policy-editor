import { syntheticPolicy } from '../../../testing/synthetic-policy';
import { buildChains, resolveChain } from '../resolve/resolve';
import { parseFile } from '../workspace/workspace';
import { validateChain } from '../validate/validate';
import { analyzeJourney, MAX_STATES, stepKey } from './journey-analyzer';

function effFor(opts: Parameters<typeof syntheticPolicy>[0]) {
  const f = parseFile(syntheticPolicy(opts));
  expect(f.error).toBeUndefined();
  return resolveChain(buildChains([f.doc!])[0]);
}

describe('analysis of large journeys', () => {
  it('summarises every step of a 44-step journey with 12 independent optional claims', () => {
    const eff = effFor({ steps: 44, optional: 12 });
    expect(eff.userJourneys.get('big')!.value.steps.length).toBe(44);
    const t0 = Date.now();
    const a = analyzeJourney(eff, 'Big');
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(1500);
    expect(a.stateCount).toBeLessThanOrEqual(MAX_STATES);
    // Every step of the journey has a summary and is reached.
    const main = [...a.steps.values()].filter((s) => s.journeyId === 'Big');
    expect(main.length).toBe(44);
    expect(main.every((s) => s.runs !== 'unreached')).toBe(true);
    expect(a.steps.get(stepKey('Big', 44))!.runs).toBe('always');
    // 2^12 complete paths cannot be listed, so there are no named paths, and the merge is flagged.
    expect(a.namedPaths).toBeNull();
    expect(a.approximate).toBe(true);
    // The two sub journeys were walked.
    expect(a.steps.has(stepKey('SubA', 1))).toBe(true);
    expect(a.steps.has(stepKey('SubB', 2))).toBe(true);
  });

  it('is exact when the optional claims are not read again after their own test', () => {
    const eff = effFor({ steps: 44, optional: 12, readLate: false });
    const a = analyzeJourney(eff, 'Big');
    expect(a.approximate).toBe(false);
    expect(a.stateCount).toBeLessThan(40);
    // Each test step runs only when its claim was provided.
    const test3 = a.steps.get(stepKey('Big', 3 + 2 * 3 + 1 + 1))!; // the UseOpt3 step
    expect(['sometimes', 'always']).toContain(test3.runs);
  });

  it('gives exact results for a scenario even when the overview is approximate', () => {
    const eff = effFor({ steps: 44, optional: 12 });
    const base = analyzeJourney(eff, 'Big');
    const select = base.decisions.find((d) => d.kind === 'select')!;
    expect(select.options.length).toBe(2);
    const local = analyzeJourney(eff, 'Big', { assume: new Map([[select.id, 'LocalExchange']]) });
    // Choosing the local sign-in button decides step 2 (the social exchange is skipped or never reached).
    expect(local.steps.get(stepKey('Big', 2))!.ranCount).toBe(0);
    const social = analyzeJourney(eff, 'Big', { assume: new Map([[select.id, 'IdpExchange']]) });
    expect(social.steps.get(stepKey('Big', 2))!.ranCount).toBeGreaterThan(0);
  });

  it('reports journey problems on large journeys without crashing', () => {
    const eff = effFor({ steps: 44, optional: 12 });
    const a = analyzeJourney(eff, 'Big');
    const diags = validateChain(eff, [a]);
    expect(diags.filter((d) => d.severity === 'error').map((d) => d.message)).toEqual([]);
    expect(diags.some((d) => d.code === 'analysis.approximate')).toBe(true);
  });

  it('stays fast and exact with no optional claims at all', () => {
    const a = analyzeJourney(effFor({ steps: 44, optional: 0 }), 'Big');
    expect(a.approximate).toBe(false);
    expect(a.elapsedMs).toBeLessThan(500);
  });
});
