import { Precondition } from '../model/types';
import { compileRunWhen, parsePrecondition, runCondition, toRunWhen, truthTable } from './preconditions';
import { explainPreconditions } from './precondition-explainer';

const ref = { fileId: 'f', path: [], line: 0 };
const pc = (type: string, eai: string, ...values: string[]): Precondition => ({ type, executeActionsIf: eai, values, action: 'SkipThisOrchestrationStep', ref });

describe('precondition semantics (Microsoft Learn examples)', () => {
  it('MfaPreference = Phone pattern reads as a single run condition', () => {
    const e = explainPreconditions([pc('ClaimsExist', 'false', 'MfaPreference'), pc('ClaimEquals', 'false', 'MfaPreference', 'Phone')]);
    expect(e.skipWhen).toEqual(['MfaPreference is missing', 'MfaPreference ≠ "Phone"']);
    expect(e.runsOnlyWhen).toEqual(['MfaPreference = "Phone"']);
    expect(e.summary).toBe('Runs only when MfaPreference = "Phone"');
    expect(e.runWhen).toEqual([{ claim: 'MfaPreference', op: 'eq', value: 'Phone' }]);
  });

  it('objectId OR email exists', () => {
    const e = explainPreconditions([pc('ClaimsExist', 'true', 'objectId'), pc('ClaimsExist', 'true', 'email')]);
    expect(e.runsOnlyWhen).toEqual(['objectId is missing', 'email is missing']);
  });

  it('ClaimEquals on a missing claim is ignored', () => {
    const atoms = [parsePrecondition(pc('ClaimEquals', 'false', 'MfaPreference', 'Phone')).skipWhen];
    const t = truthTable(atoms);
    const missingRow = t.rows.find((r) => r.cells[0] === 'missing')!;
    expect(missingRow.skippedBy).toBe(-1); // runs
    const e = explainPreconditions([pc('ClaimEquals', 'false', 'MfaPreference', 'Phone')]);
    expect(e.runsOnlyWhen).toEqual(['MfaPreference is missing or = "Phone"']);
    expect(e.items[0].note).toContain('Ignored when MfaPreference is missing');
  });

  it('detects contradictions', () => {
    const e = explainPreconditions([pc('ClaimsExist', 'true', 'x'), pc('ClaimsExist', 'false', 'x')]);
    expect(e.never).toBe(true);
    expect(e.summary).toBe('Never runs');
  });

  it('flags invalid preconditions', () => {
    const e = explainPreconditions([pc('ClaimEquals', 'yes', 'x')]);
    expect(e.lints.filter((l) => l.severity === 'error').length).toBeGreaterThanOrEqual(2);
  });

  it('compiles run-only-when conditions back and forth', () => {
    const atoms = compileRunWhen([{ claim: 'a', op: 'eq', value: '1' }, { claim: 'b', op: 'missing' }, { claim: 'c', op: 'neq', value: 'x' }]);
    expect(atoms).toEqual([
      { claim: 'a', op: 'missing' },
      { claim: 'a', op: 'neq', value: '1' },
      { claim: 'b', op: 'exists' },
      { claim: 'c', op: 'eq', value: 'x' },
    ]);
    expect(toRunWhen(atoms)).toEqual([{ claim: 'a', op: 'eq', value: '1' }, { claim: 'b', op: 'missing' }, { claim: 'c', op: 'neq', value: 'x' }]);
    expect(runCondition([]).constraints).toEqual([]);
  });
});

describe('explainer with analysis context', () => {
  it('drops "is missing" for claims that are always present at the step', async () => {
    const { loadSamplePack } = await import('../../../testing/samples');
    const { parseFile } = await import('../workspace/workspace');
    const { buildChains, resolveChain } = await import('../resolve/resolve');
    const { analyzeJourney, stepKey } = await import('./journey-analyzer');
    const docs = loadSamplePack('SocialAndLocalAccounts').map(parseFile).map((f) => f.doc!);
    const eff = resolveChain(buildChains(docs).find((c) => c.leaf.fileName === 'SignUpOrSignin.xml')!);
    const a = analyzeJourney(eff, 'SignUpOrSignIn');
    const step5 = eff.userJourneys.get('signuporsignin')!.value.steps[4];
    const e = explainPreconditions(step5.preconditions, { eff, analysis: a, stepKey: stepKey('SignUpOrSignIn', 5) });
    expect(e.runsOnlyWhen).toEqual(['authenticationSource ≠ "socialIdpAuthentication"']);
  });
});
