/**
 * Precondition semantics, from
 * https://learn.microsoft.com/azure/active-directory-b2c/userjourneys#preconditions
 *
 * - Preconditions are evaluated in list order; the first satisfied precondition skips the step.
 *   A step runs only if none of its preconditions are satisfied (skip = OR of conditions).
 * - ClaimsExist:  satisfied when the claim exists (ExecuteActionsIf=true) or doesn't (=false).
 * - ClaimEquals:  satisfied when the claim exists and equals (true) / doesn't equal (false) the
 *   value. If the claim is null or missing the precondition is ignored either way.
 */

import { Precondition } from '../model/types';

export type AtomOp = 'exists' | 'missing' | 'eq' | 'neq';

/** A condition on a single claim. For eq/neq the claim must also exist. */
export interface Atom {
  claim: string;
  op: AtomOp;
  value?: string;
}

export interface ParsedPrecondition {
  /** The condition under which this precondition skips the step, or null if it is invalid. */
  skipWhen: Atom | null;
  problems: string[];
  source: Precondition;
}

export const SKIP_ACTIONS = ['SkipThisOrchestrationStep', 'SkipThisValidationTechnicalProfile'];

export function parsePrecondition(p: Precondition, expectedAction = 'SkipThisOrchestrationStep'): ParsedPrecondition {
  const problems: string[] = [];
  const type = p.type.trim();
  const eai = p.executeActionsIf.trim().toLowerCase();
  if (type !== 'ClaimsExist' && type !== 'ClaimEquals') problems.push(`Unknown precondition type "${p.type}". Use ClaimsExist or ClaimEquals.`);
  if (eai !== 'true' && eai !== 'false') problems.push(`ExecuteActionsIf must be "true" or "false" (found "${p.executeActionsIf}").`);
  if (!p.values[0]) problems.push('The first <Value> must name a claim.');
  if (type === 'ClaimEquals' && p.values.length < 2) problems.push('ClaimEquals needs a second <Value> with the value to compare to.');
  if (type === 'ClaimsExist' && p.values.length > 1) problems.push('ClaimsExist only uses the first <Value>; extra values are ignored.');
  if (!p.action) problems.push(`Missing <Action>. Use ${expectedAction}.`);
  else if (p.action !== expectedAction) problems.push(`Action should be ${expectedAction} (found "${p.action}").`);
  const valid = (type === 'ClaimsExist' || type === 'ClaimEquals') && (eai === 'true' || eai === 'false') && !!p.values[0] && (type !== 'ClaimEquals' || p.values.length >= 2);
  let skipWhen: Atom | null = null;
  if (valid) {
    const claim = p.values[0];
    if (type === 'ClaimsExist') skipWhen = { claim, op: eai === 'true' ? 'exists' : 'missing' };
    else skipWhen = { claim, op: eai === 'true' ? 'eq' : 'neq', value: p.values[1] };
  }
  return { skipWhen, problems, source: p };
}

export function atomToPrecondition(a: Atom): { type: string; executeActionsIf: string; values: string[] } {
  switch (a.op) {
    case 'exists':
      return { type: 'ClaimsExist', executeActionsIf: 'true', values: [a.claim] };
    case 'missing':
      return { type: 'ClaimsExist', executeActionsIf: 'false', values: [a.claim] };
    case 'eq':
      return { type: 'ClaimEquals', executeActionsIf: 'true', values: [a.claim, a.value ?? ''] };
    case 'neq':
      return { type: 'ClaimEquals', executeActionsIf: 'false', values: [a.claim, a.value ?? ''] };
  }
}

export function describeAtom(a: Atom): string {
  switch (a.op) {
    case 'exists':
      return `${a.claim} exists`;
    case 'missing':
      return `${a.claim} is missing`;
    case 'eq':
      return `${a.claim} = "${a.value}"`;
    case 'neq':
      return `${a.claim} ≠ "${a.value}"`;
  }
}

// ---------------------------------------------------------------------------------------------
// Per-claim constraint algebra (used to simplify "runs only when" and to evaluate truth tables)
// ---------------------------------------------------------------------------------------------

export type ValueSet = { kind: 'any' } | { kind: 'none' } | { kind: 'only'; value: string } | { kind: 'not'; values: string[] };

/** The set of states a claim may be in: missing, and/or present with a value from `present`. */
export interface ClaimConstraint {
  claim: string;
  allowsMissing: boolean;
  present: ValueSet;
}

function intersect(a: ValueSet, b: ValueSet): ValueSet {
  if (a.kind === 'none' || b.kind === 'none') return { kind: 'none' };
  if (a.kind === 'any') return b;
  if (b.kind === 'any') return a;
  if (a.kind === 'only' && b.kind === 'only') return a.value === b.value ? a : { kind: 'none' };
  if (a.kind === 'only' && b.kind === 'not') return b.values.includes(a.value) ? { kind: 'none' } : a;
  if (a.kind === 'not' && b.kind === 'only') return a.values.includes(b.value) ? { kind: 'none' } : b;
  if (a.kind === 'not' && b.kind === 'not') return { kind: 'not', values: [...new Set([...a.values, ...b.values])] };
  return { kind: 'none' };
}

/** Constraint describing "the atom is NOT satisfied" (what must hold for the step to run). */
export function negatedConstraint(a: Atom): ClaimConstraint {
  switch (a.op) {
    case 'exists':
      return { claim: a.claim, allowsMissing: true, present: { kind: 'none' } };
    case 'missing':
      return { claim: a.claim, allowsMissing: false, present: { kind: 'any' } };
    case 'eq':
      return { claim: a.claim, allowsMissing: true, present: { kind: 'not', values: [a.value ?? ''] } };
    case 'neq':
      return { claim: a.claim, allowsMissing: true, present: { kind: 'only', value: a.value ?? '' } };
  }
}

export function intersectConstraint(a: ClaimConstraint, b: ClaimConstraint): ClaimConstraint {
  return { claim: a.claim, allowsMissing: a.allowsMissing && b.allowsMissing, present: intersect(a.present, b.present) };
}

export function isUnconstrained(c: ClaimConstraint): boolean {
  return c.allowsMissing && c.present.kind === 'any';
}

export function isImpossible(c: ClaimConstraint): boolean {
  return !c.allowsMissing && c.present.kind === 'none';
}

const q = (v: string) => `"${v}"`;

export function describeConstraint(c: ClaimConstraint): string {
  const n = c.claim;
  const p = c.present;
  if (isImpossible(c)) return `${n} can never satisfy this`;
  if (c.allowsMissing) {
    switch (p.kind) {
      case 'any':
        return `${n} is anything`;
      case 'none':
        return `${n} is missing`;
      case 'only':
        return `${n} is missing or = ${q(p.value)}`;
      case 'not':
        return `${n} is missing or ≠ ${p.values.map(q).join(', ')}`;
    }
  }
  switch (p.kind) {
    case 'any':
      return `${n} exists`;
    case 'only':
      return `${n} = ${q(p.value)}`;
    case 'not':
      return `${n} exists and ≠ ${p.values.map(q).join(', ')}`;
    default:
      return `${n} can never satisfy this`;
  }
}

export interface RunCondition {
  /** Per-claim constraints that must ALL hold for the step to run. Empty = always runs. */
  constraints: ClaimConstraint[];
  /** True when the constraints can never be satisfied (the step never runs). */
  never: boolean;
}

/** Combine "none of these preconditions is satisfied" into per-claim constraints. */
export function runCondition(atoms: readonly Atom[]): RunCondition {
  const byClaim = new Map<string, ClaimConstraint>();
  for (const a of atoms) {
    const k = a.claim.toLowerCase();
    const c = negatedConstraint(a);
    const prev = byClaim.get(k);
    byClaim.set(k, prev ? intersectConstraint(prev, c) : c);
  }
  const constraints = [...byClaim.values()].filter((c) => !isUnconstrained(c));
  return { constraints, never: constraints.some(isImpossible) };
}

// ---------------------------------------------------------------------------------------------
// Concrete evaluation (truth tables)
// ---------------------------------------------------------------------------------------------

/** A concrete claim state: undefined = missing, string = present with that value. */
export type Concrete = Record<string, string | undefined>;

export function atomHolds(a: Atom, env: Concrete): boolean {
  const v = env[a.claim.toLowerCase()];
  switch (a.op) {
    case 'exists':
      return v !== undefined;
    case 'missing':
      return v === undefined;
    case 'eq':
      return v !== undefined && v === a.value;
    case 'neq':
      return v !== undefined && v !== a.value;
  }
}

/** Index of the first satisfied precondition, or -1 if the step runs. */
export function firstSatisfied(atoms: readonly (Atom | null)[], env: Concrete): number {
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    if (a && atomHolds(a, env)) return i;
  }
  return -1;
}

export const OTHER_VALUE = '\u0000other';

export interface TruthRow {
  env: Concrete;
  /** Display cells, one per claim: "missing", "= x" or "other value". */
  cells: string[];
  skippedBy: number;
}

/** Enumerate meaningful combinations of the claims referenced by the preconditions. */
export function truthTable(atoms: readonly (Atom | null)[], maxRows = 64): { claims: string[]; rows: TruthRow[]; truncated: boolean } {
  const claims: string[] = [];
  const valuesByClaim = new Map<string, Set<string>>();
  for (const a of atoms) {
    if (!a) continue;
    const k = a.claim.toLowerCase();
    if (!valuesByClaim.has(k)) {
      valuesByClaim.set(k, new Set());
      claims.push(a.claim);
    }
    if (a.value !== undefined) valuesByClaim.get(k)!.add(a.value);
  }
  const domains = claims.map((c) => {
    const vals = [...valuesByClaim.get(c.toLowerCase())!];
    return [undefined, ...vals, OTHER_VALUE] as (string | undefined)[];
  });
  const rows: TruthRow[] = [];
  let truncated = false;
  const rec = (i: number, env: Concrete, cells: string[]) => {
    if (rows.length >= maxRows) {
      truncated = true;
      return;
    }
    if (i === claims.length) {
      rows.push({ env: { ...env }, cells: [...cells], skippedBy: firstSatisfied(atoms, env) });
      return;
    }
    for (const v of domains[i]) {
      env[claims[i].toLowerCase()] = v;
      const cell = v === undefined ? 'missing' : v === OTHER_VALUE ? (domains[i].length > 2 ? 'other value' : 'exists') : `= "${v}"`;
      rec(i + 1, env, [...cells, cell]);
    }
    delete env[claims[i].toLowerCase()];
  };
  rec(0, {}, []);
  return { claims, rows, truncated };
}

// ---------------------------------------------------------------------------------------------
// "Run only when" → preconditions (used by the builder)
// ---------------------------------------------------------------------------------------------

export interface RunWhen {
  claim: string;
  op: AtomOp;
  value?: string;
}

/**
 * Compile "run only when ALL of these hold" into skip preconditions. For "X = v" this produces
 * the pattern recommended by Microsoft: skip if X doesn't exist, then skip if X ≠ v.
 */
export function compileRunWhen(conds: readonly RunWhen[]): Atom[] {
  const out: Atom[] = [];
  for (const c of conds) {
    switch (c.op) {
      case 'exists':
        out.push({ claim: c.claim, op: 'missing' });
        break;
      case 'missing':
        out.push({ claim: c.claim, op: 'exists' });
        break;
      case 'eq':
        out.push({ claim: c.claim, op: 'missing' });
        out.push({ claim: c.claim, op: 'neq', value: c.value ?? '' });
        break;
      case 'neq':
        out.push({ claim: c.claim, op: 'eq', value: c.value ?? '' });
        break;
    }
  }
  return out;
}

/** Best-effort inverse of compileRunWhen, used to show existing preconditions in "run only when" form. */
export function toRunWhen(atoms: readonly Atom[]): RunWhen[] | null {
  const rc = runCondition(atoms);
  if (rc.never) return null;
  const out: RunWhen[] = [];
  for (const c of rc.constraints) {
    if (!c.allowsMissing && c.present.kind === 'any') out.push({ claim: c.claim, op: 'exists' });
    else if (c.allowsMissing && c.present.kind === 'none') out.push({ claim: c.claim, op: 'missing' });
    else if (!c.allowsMissing && c.present.kind === 'only') out.push({ claim: c.claim, op: 'eq', value: c.present.value });
    else if (c.allowsMissing && c.present.kind === 'not' && c.present.values.length === 1) out.push({ claim: c.claim, op: 'neq', value: c.present.values[0] });
    else return null;
  }
  return out;
}
