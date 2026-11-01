import { idKey, Precondition } from '../model/types';
import { EffectivePolicy } from '../resolve/resolve';
import { JourneyAnalysis } from './journey-analyzer';
import {
  Atom,
  describeAtom,
  describeConstraint,
  isImpossible,
  parsePrecondition,
  runCondition,
  RunWhen,
  toRunWhen,
  truthTable,
  TruthRow,
} from './preconditions';

export interface ExplainedPrecondition {
  index: number;
  atom: Atom | null;
  /** "objectId exists" etc. */
  sentence: string;
  /** Extra semantics worth knowing, for example the ClaimEquals null rule. */
  note?: string;
  problems: string[];
  /** Paths (ids) on which this precondition is the one that skipped the step. */
  skipsOn: number[];
}

export interface Lint {
  severity: 'error' | 'warning' | 'info';
  message: string;
  index?: number;
}

export interface PreconditionExplanation {
  items: ExplainedPrecondition[];
  /** Sentences joined with "or": the step is skipped when ANY holds. */
  skipWhen: string[];
  /** Sentences joined with "and": the step runs only when ALL hold. */
  runsOnlyWhen: string[];
  always: boolean;
  never: boolean;
  /** The preconditions expressed as "run only when" conditions, if that is possible. */
  runWhen: RunWhen[] | null;
  summary: string;
  lints: Lint[];
  truth: { claims: string[]; rows: TruthRow[]; truncated: boolean };
}

export interface ExplainOptions {
  action?: string;
  eff?: EffectivePolicy;
  analysis?: JourneyAnalysis;
  stepKey?: string;
}

export function explainPreconditions(preconditions: readonly Precondition[], opts: ExplainOptions = {}): PreconditionExplanation {
  const action = opts.action ?? 'SkipThisOrchestrationStep';
  const parsed = preconditions.map((p) => parsePrecondition(p, action));
  const atoms = parsed.map((p) => p.skipWhen);
  const valid = atoms.filter((a): a is Atom => !!a);
  const summary = opts.analysis && opts.stepKey ? opts.analysis.steps.get(opts.stepKey) : undefined;

  const items: ExplainedPrecondition[] = parsed.map((p, index) => {
    const a = p.skipWhen;
    const skipsOn = summary ? [...summary.skippedBy.entries()].filter(([, i]) => i === index).map(([path]) => path) : [];
    let note: string | undefined;
    if (a && (a.op === 'eq' || a.op === 'neq')) note = `Ignored when ${a.claim} is missing (ClaimEquals only applies to an existing claim).`;
    return {
      index,
      atom: a,
      sentence: a ? describeAtom(a) : 'Invalid precondition',
      note,
      problems: p.problems,
      skipsOn,
    };
  });

  const rc = runCondition(valid);
  // Use what the analysis knows: a claim that is always present here can't be "missing".
  if (summary) {
    rc.constraints = rc.constraints.map((c) => (summary.before.get(idKey(c.claim))?.availability === 'definitely' && c.allowsMissing ? { ...c, allowsMissing: false } : c)).filter((c) => !(c.allowsMissing === false && c.present.kind === 'any' && summary.before.get(idKey(c.claim))?.availability === 'definitely'));
    rc.never = rc.never || rc.constraints.some(isImpossible);
  }
  const alwaysPresent = (claim: string) => summary?.before.get(idKey(claim))?.availability === 'definitely';
  const runsOnlyWhen = rc.never ? [] : rc.constraints.map((c) => (alwaysPresent(c.claim) ? describeConstraint(c).replace(`${c.claim} exists and `, `${c.claim} `) : describeConstraint(c)));
  const always = valid.length === 0 || (!rc.never && rc.constraints.length === 0);
  const never = rc.never;

  const lints: Lint[] = [];
  items.forEach((it) => it.problems.forEach((m) => lints.push({ severity: 'error', message: m, index: it.index })));

  // Duplicate preconditions.
  const seen = new Map<string, number>();
  valid.forEach((a) => {
    const k = `${a.op}|${idKey(a.claim)}|${a.value ?? ''}`;
    const idx = atoms.indexOf(a);
    if (seen.has(k)) lints.push({ severity: 'warning', message: `Same as precondition ${seen.get(k)! + 1}.`, index: idx });
    else seen.set(k, idx);
  });

  if (never && valid.length) lints.push({ severity: 'warning', message: 'These preconditions skip the step in every possible case, so it never runs.' });

  // Claim schema checks.
  if (opts.eff) {
    for (const it of items) {
      const a = it.atom;
      if (!a) continue;
      const ct = opts.eff.claimType(a.claim);
      if (!ct) {
        lints.push({ severity: 'error', message: `Claim "${a.claim}" is not defined in any ClaimsSchema of this policy chain.`, index: it.index });
        continue;
      }
      if (a.value !== undefined) {
        if (ct.dataType === 'boolean' && a.value !== 'True' && a.value !== 'False') {
          lints.push({ severity: 'warning', message: `${a.claim} is a boolean claim. Compare to "True" or "False" (case-sensitive).`, index: it.index });
        }
        const en = ct.restriction?.enumeration ?? [];
        if (en.length && !en.some((e) => e.value === a.value)) {
          lints.push({ severity: 'warning', message: `"${a.value}" is not one of the allowed values of ${a.claim} (${en.map((e) => e.value).join(', ')}).`, index: it.index });
        }
      }
    }
  }

  // Analysis-based lints.
  if (summary) {
    const reached = summary.runPaths.length + summary.skipPaths.length;
    if (reached && summary.runs === 'never' && valid.length) {
      lints.push({ severity: 'info', message: 'On every analysed path one of these preconditions skips the step.' });
    }
    for (const it of items) {
      const a = it.atom;
      if (!a) continue;
      const av = summary.before.get(idKey(a.claim));
      const status = av?.availability ?? 'absent';
      if ((a.op === 'exists' || a.op === 'eq' || a.op === 'neq') && status === 'absent' && reached) {
        lints.push({ severity: 'warning', message: `${a.claim} is never in the claims bag when this step is reached, so this precondition is never satisfied.`, index: it.index });
      } else if (a.op === 'missing' && status === 'absent' && reached) {
        lints.push({ severity: 'warning', message: `${a.claim} is never in the claims bag here, so this precondition always skips the step.`, index: it.index });
      } else if (a.op === 'exists' && status === 'definitely' && it.index === 0) {
        lints.push({ severity: 'warning', message: `${a.claim} is always present when this step is reached, so the step is always skipped.`, index: it.index });
      }
      if (a.op === 'neq' && status !== 'definitely') {
        const guarded = valid.some((b) => atoms.indexOf(b) < it.index && b.op === 'missing' && idKey(b.claim) === idKey(a.claim));
        if (!guarded) {
          lints.push({
            severity: 'warning',
            message: `${a.claim} may be missing here. ClaimEquals is ignored for a missing claim, so the step will run. Add "Skip if ${a.claim} is missing" before this check if it should be skipped.`,
            index: it.index,
          });
        }
      }
      if (reached > 1 && it.skipsOn.length === 0 && summary.runs !== 'never') {
        const earlier = items.slice(0, it.index).some((x) => x.skipsOn.length > 0);
        if (earlier || summary.runPaths.length === reached) {
          lints.push({ severity: 'info', message: 'This precondition never decides the outcome on any analysed path.', index: it.index });
        }
      }
    }
  }

  let chip: string;
  if (!valid.length) chip = preconditions.length ? 'Invalid preconditions' : 'Always runs';
  else if (never) chip = 'Never runs';
  else if (valid.length === 1) chip = `Skipped if ${describeAtom(valid[0])}`;
  else if (runsOnlyWhen.length && runsOnlyWhen.length <= 2) chip = `Runs only when ${runsOnlyWhen.join(' and ')}`;
  else chip = `Skipped if any of ${valid.length} conditions`;

  return {
    items,
    skipWhen: valid.map(describeAtom),
    runsOnlyWhen,
    always,
    never,
    runWhen: toRunWhen(valid),
    summary: chip,
    lints,
    truth: truthTable(atoms),
  };
}
