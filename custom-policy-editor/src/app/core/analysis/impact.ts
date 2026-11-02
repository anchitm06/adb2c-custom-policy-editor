import { Diagnostic } from '../validate/validate';
import { Availability, JourneyAnalysis } from './journey-analyzer';

export interface ClaimChange {
  claim: string;
  stepKeys: string[];
  orders: number[];
  from: Availability;
  to: Availability;
}

export interface StepChange {
  stepKey: string;
  order: number;
  from: string;
  to: string;
}

export interface Impact {
  newDiagnostics: Diagnostic[];
  resolvedDiagnostics: Diagnostic[];
  claimChanges: ClaimChange[];
  stepChanges: StepChange[];
  pathsBefore: number;
  pathsAfter: number;
  /** Short human readable summary lines. */
  lines: string[];
  /** Step keys whose run status or claims bag changed (for highlighting). */
  changedSteps: Set<string>;
  hasChanges: boolean;
}

function ranges(nums: number[]): string {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}–${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.join(', ');
}

const RUNS_LABEL: Record<string, string> = { always: 'always runs', sometimes: 'runs on some paths', never: 'never runs', unreached: 'not reached' };

export function computeImpact(
  before: { diagnostics: Diagnostic[]; analysis?: JourneyAnalysis },
  after: { diagnostics: Diagnostic[]; analysis?: JourneyAnalysis },
): Impact {
  const beforeKeys = new Set(before.diagnostics.map((d) => d.key));
  const afterKeys = new Set(after.diagnostics.map((d) => d.key));
  const newDiagnostics = after.diagnostics.filter((d) => !beforeKeys.has(d.key) && d.severity !== 'info');
  const resolvedDiagnostics = before.diagnostics.filter((d) => !afterKeys.has(d.key) && d.severity !== 'info');

  const claimChanges: ClaimChange[] = [];
  const stepChanges: StepChange[] = [];
  const changedSteps = new Set<string>();
  const a0 = before.analysis;
  const a1 = after.analysis;
  if (a0 && a1 && a0.journeyId === a1.journeyId) {
    const byClaim = new Map<string, ClaimChange>();
    for (const [key, s1] of a1.steps) {
      const s0 = a0.steps.get(key);
      if (!s0) continue;
      if (s0.runs !== s1.runs) {
        stepChanges.push({ stepKey: key, order: s1.order, from: s0.runs, to: s1.runs });
        changedSteps.add(key);
      }
      const claims = new Set([...s0.before.keys(), ...s1.before.keys()]);
      for (const c of claims) {
        const f = s0.before.get(c)?.availability ?? 'absent';
        const t = s1.before.get(c)?.availability ?? 'absent';
        if (f === t) continue;
        changedSteps.add(key);
        const k = `${c}|${f}|${t}`;
        const id = s1.before.get(c)?.id ?? s0.before.get(c)?.id ?? c;
        const e = byClaim.get(k) ?? { claim: id, stepKeys: [], orders: [], from: f, to: t };
        e.stepKeys.push(key);
        e.orders.push(s1.order);
        byClaim.set(k, e);
      }
    }
    claimChanges.push(...byClaim.values());
  }

  const lines: string[] = [];
  const errs = newDiagnostics.filter((d) => d.severity === 'error').length;
  const warns = newDiagnostics.filter((d) => d.severity === 'warning').length;
  const fixedErrs = resolvedDiagnostics.filter((d) => d.severity === 'error').length;
  const fixedWarns = resolvedDiagnostics.filter((d) => d.severity === 'warning').length;
  if (errs) lines.push(`+${errs} error${errs > 1 ? 's' : ''}`);
  if (warns) lines.push(`+${warns} warning${warns > 1 ? 's' : ''}`);
  if (fixedErrs) lines.push(`${fixedErrs} error${fixedErrs > 1 ? 's' : ''} fixed`);
  if (fixedWarns) lines.push(`${fixedWarns} warning${fixedWarns > 1 ? 's' : ''} fixed`);
  for (const sc of stepChanges.slice(0, 3)) lines.push(`step ${sc.order} now ${RUNS_LABEL[sc.to] ?? sc.to}`);
  for (const cc of claimChanges.slice(0, 3)) lines.push(`${cc.claim} now ${cc.to} before step${cc.orders.length > 1 ? 's' : ''} ${ranges(cc.orders)}`);
  const more = Math.max(0, stepChanges.length - 3) + Math.max(0, claimChanges.length - 3);
  if (more) lines.push(`+${more} more change${more > 1 ? 's' : ''}`);
  const pathsBefore = a0?.paths.length ?? 0;
  const pathsAfter = a1?.paths.length ?? 0;
  if (a0 && a1 && pathsBefore !== pathsAfter) lines.push(`${pathsAfter} path${pathsAfter === 1 ? '' : 's'} (was ${pathsBefore})`);

  return {
    newDiagnostics,
    resolvedDiagnostics,
    claimChanges,
    stepChanges,
    pathsBefore,
    pathsAfter,
    lines,
    changedSteps,
    hasChanges: lines.length > 0,
  };
}
