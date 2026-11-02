import { loadSamplePack } from '../../../testing/samples';
import { analyzeJourney, stepKey } from '../analysis/journey-analyzer';
import { buildChains, resolveChain } from '../resolve/resolve';
import { parseFile, PolicyFile } from '../workspace/workspace';
import { applyToText } from './apply';
import { addClaimType, addStep, moveStep, removeStep, renameInDocument, setMetadataItem, setPreconditions, ensureTechnicalProfileOverride } from './commands';
import { pathOf } from '../xml/xml';

function analysis(files: PolicyFile[]) {
  const docs = files.map(parseFile).map((f) => f.doc!);
  const eff = resolveChain(buildChains(docs).find((c) => c.leaf.fileName === 'SignUpOrSignin.xml')!);
  return { eff, a: analyzeJourney(eff, 'SignUpOrSignIn') };
}

describe('edit commands', () => {
  it('rewrites preconditions and the analysis follows', () => {
    const files = loadSamplePack('SocialAndLocalAccounts');
    const base = files[0];
    const { eff } = analysis(files);
    const step5 = eff.userJourneys.get('signuporsignin')!.value.steps[4];
    const before = base.text;
    base.text = applyToText(base.text, (d) => setPreconditions(d, step5.ref, [{ claim: 'objectId', op: 'missing' }], 'SkipThisOrchestrationStep'));
    expect(base.text).not.toBe(before);
    expect(base.text).toContain('<Precondition Type="ClaimsExist" ExecuteActionsIf="false">\n              <Value>objectId</Value>');
    const { a } = analysis(files);
    // step 5 now runs on every path (objectId always exists there)
    expect(a.steps.get(stepKey("SignUpOrSignIn", 5))!.runs).toBe("always");
    // Only the changed region differs
    const a1 = before.split('\n');
    const b1 = base.text.split('\n');
    let pre = 0;
    while (a1[pre] === b1[pre]) pre++;
    let suf = 0;
    while (a1[a1.length - 1 - suf] === b1[b1.length - 1 - suf]) suf++;
    expect(b1.length - pre - suf).toBeLessThan(15);
  });

  it('adds, moves and removes steps with renumbering', () => {
    const files = loadSamplePack('SocialAndLocalAccounts');
    const base = files[0];
    const { eff } = analysis(files);
    const j = eff.userJourneys.get('signuporsignin')!.value;
    base.text = applyToText(base.text, (d) => addStep(d, j.ref, 6, 'ClaimsExchange', { id: 'Rest', technicalProfileId: 'REST-X' }));
    let j2 = analysis(files).eff.userJourneys.get('signuporsignin')!.value;
    expect(j2.steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(j2.steps[6].claimsExchanges[0].technicalProfileReferenceId).toBe('REST-X');
    base.text = applyToText(base.text, (d) => moveStep(d, j2.steps[6].ref, 0));
    j2 = analysis(files).eff.userJourneys.get('signuporsignin')!.value;
    expect(j2.steps[0].claimsExchanges[0].id).toBe('Rest');
    expect(j2.steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    base.text = applyToText(base.text, (d) => removeStep(d, j2.steps[0].ref));
    const noBlank = (t: string) => t.replace(/\n\s*\n/g, '\n');
    expect(noBlank(base.text)).toBe(noBlank(loadSamplePack('SocialAndLocalAccounts')[0].text));
  });

  it('renames a claim everywhere and writes overrides', () => {
    const files = loadSamplePack('SocialAndLocalAccounts');
    for (const f of files) f.text = applyToText(f.text, (d) => renameInDocument(d, 'claim', 'objectId', 'oid2'));
    const { eff, a } = analysis(files);
    expect(eff.claimType('oid2')).toBeTruthy();
    expect(eff.claimType('objectId')).toBeUndefined();
    expect(a.namedPaths!.length).toBe(4);
    const ext = files[2];
    ext.text = applyToText(ext.text, (d) => {
      const tp = ensureTechnicalProfileOverride(d, 'AAD-Common', 'Azure Active Directory');
      setMetadataItem(d, { fileId: ext.id, path: pathOf(tp), line: 0 }, 'ClientId', 'abc');
      addClaimType(d, 'loyaltyId', { dataType: 'string' });
    });
    const { eff: e2 } = analysis(files);
    expect(e2.tp('AAD-UserReadUsingObjectId')!.metadata.find((m) => m.key === 'ClientId')?.value).toBe('abc');
    expect(e2.claimType('loyaltyId')?.dataType).toBe('string');
  });
});
