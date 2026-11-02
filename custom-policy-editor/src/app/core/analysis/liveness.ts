/**
 * Liveness of claims along a journey: a claim is "live" at step i when some step at or after i
 * may read it. The analyzer only distinguishes states by live claims, so independent unknowns
 * that are never read again do not multiply the number of states.
 *
 * The reads are deliberately conservative (a superset): a missed read would merge states that
 * differ in something that matters, a surplus read only keeps a few more states apart.
 */

import { idKey, OrchestrationStepDef } from '../model/types';
import { EffectivePolicy, FlatTechnicalProfile } from '../resolve/resolve';

function addTransformationInputs(eff: EffectivePolicy, ref: string, out: Set<string>): void {
  const ct = eff.claimsTransformations.get(idKey(ref))?.value;
  for (const c of ct?.inputClaims ?? []) out.add(idKey(c.claimTypeReferenceId));
}

function addTechnicalProfileReads(eff: EffectivePolicy, tp: FlatTechnicalProfile | undefined, out: Set<string>, depth: number): void {
  if (!tp || depth > 3) return;
  for (const c of tp.inputClaims) out.add(idKey(c.claimTypeReferenceId));
  // Output claims are read too: DefaultValue and directory reads depend on whether the claim already exists.
  for (const c of tp.outputClaims) out.add(idKey(c.claimTypeReferenceId));
  for (const c of tp.persistedClaims) out.add(idKey(c.claimTypeReferenceId));
  for (const t of tp.inputClaimsTransformations) addTransformationInputs(eff, t.referenceId, out);
  for (const t of tp.outputClaimsTransformations) addTransformationInputs(eff, t.referenceId, out);
  const enable = tp.metadata.find((m) => m.key === 'ClaimTypeOnWhichToEnable')?.value;
  if (enable) out.add(idKey(enable));
  for (const v of tp.validationTechnicalProfiles) {
    for (const p of v.preconditions) if (p.values[0]) out.add(idKey(p.values[0]));
    addTechnicalProfileReads(eff, eff.tp(v.referenceId), out, depth + 1);
  }
}

/** Claim keys (idKey) that executing `step` may read. Sub journeys are included in full. */
export function stepReads(eff: EffectivePolicy, step: OrchestrationStepDef, depth = 0): Set<string> {
  const out = new Set<string>();
  for (const p of step.preconditions) if (p.values[0]) out.add(idKey(p.values[0]));
  for (const x of step.claimsExchanges) addTechnicalProfileReads(eff, eff.tp(x.technicalProfileReferenceId), out, 0);
  if (step.cpimIssuerTechnicalProfileReferenceId) addTechnicalProfileReads(eff, eff.tp(step.cpimIssuerTechnicalProfileReferenceId), out, 0);
  if (step.type === 'InvokeSubJourney' && depth < 3) {
    const sub = eff.subJourneys.get(idKey(step.journeyCandidates[0]?.subJourneyReferenceId))?.value;
    for (const s of sub?.steps ?? []) for (const k of stepReads(eff, s, depth + 1)) out.add(k);
  }
  return out;
}

/** suffix[i] = claims read at steps i..n-1 plus `tail` (what happens after the steps). */
export function suffixReads(eff: EffectivePolicy, steps: readonly OrchestrationStepDef[], tail: ReadonlySet<string>): Set<string>[] {
  const suffix: Set<string>[] = new Array(steps.length + 1);
  suffix[steps.length] = new Set(tail);
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = new Set(suffix[i + 1]);
    for (const k of stepReads(eff, steps[i])) s.add(k);
    suffix[i] = s;
  }
  return suffix;
}

/** Claims the relying party puts into the token. */
export function tokenReads(eff: EffectivePolicy): Set<string> {
  const out = new Set<string>();
  for (const c of eff.relyingParty?.technicalProfile?.outputClaims ?? []) out.add(idKey(c.claimTypeReferenceId));
  return out;
}

/** Claims tested by preconditions (not merely used as inputs) in a step, sub journeys included. */
export function preconditionReads(eff: EffectivePolicy, step: OrchestrationStepDef, depth = 0): Set<string> {
  const out = new Set<string>();
  for (const p of step.preconditions) if (p.values[0]) out.add(idKey(p.values[0]));
  for (const x of step.claimsExchanges) {
    for (const v of eff.tp(x.technicalProfileReferenceId)?.validationTechnicalProfiles ?? []) {
      for (const p of v.preconditions) if (p.values[0]) out.add(idKey(p.values[0]));
    }
  }
  if (step.type === 'InvokeSubJourney' && depth < 3) {
    const sub = eff.subJourneys.get(idKey(step.journeyCandidates[0]?.subJourneyReferenceId))?.value;
    for (const s of sub?.steps ?? []) for (const k of preconditionReads(eff, s, depth + 1)) out.add(k);
  }
  return out;
}

export interface LiveTiers {
  /** Everything read at or after step i. */
  all: Set<string>[];
  /** Only claims tested by preconditions at or after step i. */
  tested: Set<string>[];
  /** Only claims tested by preconditions within the next `window` steps. */
  soon: Set<string>[];
}

/** Liveness at three precision levels, used to merge states progressively when there are many. */
export function liveTiers(eff: EffectivePolicy, steps: readonly OrchestrationStepDef[], tail: ReadonlySet<string>, window = 6): LiveTiers {
  const all = suffixReads(eff, steps, tail);
  const pre = steps.map((s) => preconditionReads(eff, s));
  const tested: Set<string>[] = new Array(steps.length + 1);
  tested[steps.length] = new Set();
  for (let i = steps.length - 1; i >= 0; i--) {
    const t = new Set(tested[i + 1]);
    for (const k of pre[i]) t.add(k);
    tested[i] = t;
  }
  const soon: Set<string>[] = new Array(steps.length + 1);
  for (let i = 0; i <= steps.length; i++) {
    const t = new Set<string>();
    for (let j = i; j < Math.min(steps.length, i + window); j++) for (const k of pre[j]) t.add(k);
    soon[i] = t;
  }
  return { all, tested, soon };
}
