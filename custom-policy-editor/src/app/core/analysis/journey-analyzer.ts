/**
 * Claims-flow analysis of a user journey.
 *
 * The journey is executed abstractly, step by step, over a set of live states. Each state holds
 * a claims bag in which every claim is present, absent or unknown, optionally with a known value
 * (or values it is known not to have). States fork:
 *  - at claims provider selection steps (one state per button / sign-up link),
 *  - at claims exchange steps with several exchanges and no prior selection,
 *  - lazily, when a precondition depends on a claim whose presence or value is unknown.
 *
 * After every step, states that agree on every claim that is still read later are merged, so the
 * number of states stays small even when a journey has dozens of independent unknowns. If it
 * still grows past `maxStates`, states are merged more coarsely and the result is flagged
 * `approximate` (never silently truncated: coarser merging only turns "present" into "maybe").
 *
 * Every fork is recorded as a decision. Assuming an option for a decision (a scenario) prunes
 * the other options, which gives exact results for that scenario.
 */

import { ClaimRef, idKey, OrchestrationStepDef, Precondition, SourceRef, UserJourneyDef } from '../model/types';
import { EffectivePolicy, FlatTechnicalProfile } from '../resolve/resolve';
import { liveTiers, LiveTiers, tokenReads } from './liveness';
import { Atom, parsePrecondition } from './preconditions';

export const MAX_STATES = 96;
export const MAX_TRAILS = 24;

export type Presence = 'present' | 'absent' | 'unknown';
export type ValueInfo = { kind: 'eq'; value: string } | { kind: 'neq'; values: string[] };

export interface ClaimState {
  /** Claim id as written where it was first produced. */
  id: string;
  status: Presence;
  /** Constraint on the value, valid when the claim is present. */
  value?: ValueInfo;
  /** Where the claim was produced, for example "Step 2 · Facebook-OAUTH". */
  sources: string[];
  /** Why presence is unknown. */
  uncertainty?: { kind: 'directoryRead' | 'optionalInput' | 'continueOnError' | 'fromApp' | 'transformation'; tp?: string };
}

export type Bag = ReadonlyMap<string, ClaimState>;
export type Availability = 'definitely' | 'maybe' | 'absent';

export interface ClaimAvailability {
  id: string;
  availability: Availability;
  presentCount: number;
  maybeCount: number;
  absentCount: number;
  /** Known values where the claim is present with a known value. */
  values: string[];
  sources: string[];
  /** Up to three scenarios in which the claim is missing / only possibly there. */
  missingIn: string[];
  uncertainIn: string[];
}

export interface DecisionOption {
  key: string;
  label: string;
}

export interface Decision {
  id: string;
  kind: 'select' | 'exchange' | 'claim';
  label: string;
  options: DecisionOption[];
  /** Step where the decision first occurs. */
  firstStep: string;
  claim?: string;
}

/** Decision id to chosen option key. */
export type Assumptions = ReadonlyMap<string, string>;

export interface NamedPath {
  id: number;
  label: string;
  assume: [string, string][];
  outcome: 'token' | 'transfer' | 'incomplete';
}

export interface MissingInput {
  claim: string;
  technicalProfileId: string;
  required: boolean;
  availability: Availability;
  witnesses: string[];
}

export interface StepSummary {
  stepKey: string;
  journeyId: string;
  order: number;
  runs: 'always' | 'sometimes' | 'never' | 'unreached';
  arrivals: number;
  ranCount: number;
  skipCount: number;
  /** Up to three scenarios in which the step runs / is skipped. */
  ranWhen: string[];
  skippedWhen: string[];
  /** Which precondition (by index) skipped the step, with example scenarios. */
  skippedBy: Map<number, { count: number; witnesses: string[] }>;
  before: Map<string, ClaimAvailability>;
  after: Map<string, ClaimAvailability>;
  /** Claims set by this step or whose availability improved. */
  produced: string[];
  missingInputs: MissingInput[];
}

export interface JourneyAnalysis {
  journeyId: string;
  steps: Map<string, StepSummary>;
  decisions: Decision[];
  /** Complete paths when there are few enough to list, otherwise null. */
  namedPaths: NamedPath[] | null;
  tokenClaims: { claim: string; availability: ClaimAvailability; ref: SourceRef; partnerClaimType?: string }[];
  approximate: boolean;
  /** Largest number of merged states at any step. */
  stateCount: number;
  elapsedMs: number;
  errors: string[];
}

export interface AnalyzeOptions {
  assume?: Assumptions;
  maxStates?: number;
}

export function stepKey(journeyId: string, order: number | string): string {
  return `${journeyId}#${order}`;
}

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

interface TrailItem {
  d: string;
  o: string;
  label: string;
}
type Trail = readonly TrailItem[];

interface State {
  bag: Map<string, ClaimState>;
  /** Claims exchange chosen at a selection step, consumed by the next step. */
  choice?: string;
  choiceFresh?: boolean;
  /** The decisions taken to reach this state (several when states were merged). */
  trails: Trail[];
  overflow: boolean;
  terminated?: 'token' | 'transfer';
  issuer?: string;
}

function clone(s: State): State {
  return { ...s, bag: new Map(s.bag) };
}

function fork(s: State, item: TrailItem): State {
  const n = clone(s);
  n.trails = s.overflow ? [] : s.trails.map((t) => [...t, item]);
  return n;
}

function get(bag: ReadonlyMap<string, ClaimState>, claim: string): ClaimState | undefined {
  return bag.get(idKey(claim));
}

interface ClaimInit {
  status: Presence;
  value?: ValueInfo;
  source?: string;
  sources?: string[];
  uncertainty?: ClaimState['uncertainty'];
}

function setClaim(bag: Map<string, ClaimState>, claim: string, st: ClaimInit): void {
  const prev = bag.get(idKey(claim));
  bag.set(idKey(claim), {
    id: prev?.id ?? claim,
    status: st.status,
    value: st.value,
    sources: st.sources ?? (st.source ? [st.source] : []),
    uncertainty: st.uncertainty,
  });
}

function witness(s: State): string {
  if (s.overflow) return 'several scenarios';
  const first = s.trails[0];
  const label = first && first.length ? first.map((i) => i.label).join(' · ') : 'Main path';
  return s.trails.length > 1 ? `${label} (and ${s.trails.length - 1} similar)` : label;
}

// ---------------------------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------------------------

interface Fx {
  assume?: Assumptions;
  decisions: Map<string, Decision>;
  /** Key of the step being processed. */
  step: string;
}

function register(fx: Fx, id: string, kind: Decision['kind'], label: string, options: DecisionOption[], claim?: string): void {
  let d = fx.decisions.get(id);
  if (!d) {
    d = { id, kind, label, options: [], firstStep: fx.step, claim };
    fx.decisions.set(id, d);
  }
  for (const o of options) if (!d.options.some((x) => x.key === o.key)) d.options.push(o);
}

/** Options that survive the assumptions (all of them when the assumption does not apply). */
function keepOptions<T extends { key: string }>(fx: Fx, id: string, options: T[]): T[] {
  const a = fx.assume?.get(id);
  if (a === undefined) return options;
  const kept = options.filter((o) => o.key === a);
  return kept.length ? kept : options;
}

// ---------------------------------------------------------------------------------------------
// Three-valued precondition evaluation with lazy forking
// ---------------------------------------------------------------------------------------------

type Tri = true | false | 'unknown';

function evalAtom(a: Atom, bag: ReadonlyMap<string, ClaimState>): Tri {
  const st = get(bag, a.claim);
  const status: Presence = st?.status ?? 'absent';
  const value = st?.value;
  switch (a.op) {
    case 'exists':
      return status === 'present' ? true : status === 'absent' ? false : 'unknown';
    case 'missing':
      return status === 'absent' ? true : status === 'present' ? false : 'unknown';
    case 'eq': {
      if (status === 'absent') return false;
      if (value?.kind === 'eq') return value.value === a.value ? (status === 'present' ? true : 'unknown') : false;
      if (value?.kind === 'neq' && value.values.includes(a.value ?? '')) return false;
      return 'unknown';
    }
    case 'neq': {
      if (status === 'absent') return false;
      if (value?.kind === 'eq') return value.value !== a.value ? (status === 'present' ? true : 'unknown') : false;
      if (value?.kind === 'neq' && value.values.includes(a.value ?? '')) return status === 'present' ? true : 'unknown';
      return 'unknown';
    }
  }
}

function presenceLabel(st: ClaimState | undefined, claim: string, present: boolean): string {
  const u = st?.uncertainty;
  if (u?.kind === 'directoryRead') return present ? `account found (${claim})` : `no account found (${claim} missing)`;
  if (u?.kind === 'optionalInput') return present ? `${claim} provided` : `${claim} left empty`;
  if (u?.kind === 'fromApp') return present ? `app sent ${claim}` : `app didn't send ${claim}`;
  return present ? `${claim} exists` : `${claim} is missing`;
}

/** Split a state into [atom holds, atom does not hold]; a branch is null when assumptions rule it out. */
function split(fx: Fx, state: State, a: Atom): [State | null, State | null] {
  const st = get(state.bag, a.claim);
  const base = { status: st?.status ?? ('absent' as Presence), value: st?.value, sources: st?.sources ?? [], uncertainty: st?.uncertainty };
  const addNeq = (v: ValueInfo | undefined, x: string): ValueInfo =>
    v?.kind === 'neq' ? { kind: 'neq', values: [...new Set([...v.values, x])] } : { kind: 'neq', values: [x] };
  const k = idKey(a.claim);
  const val = a.value ?? '';

  let id: string;
  let tItem: TrailItem;
  let fItem: TrailItem;
  const apply: [(b: Map<string, ClaimState>) => void, (b: Map<string, ClaimState>) => void] = [() => undefined, () => undefined];

  switch (a.op) {
    case 'exists':
    case 'missing': {
      id = `claim:${k}`;
      const present = { d: id, o: 'present', label: presenceLabel(st, a.claim, true) };
      const absent = { d: id, o: 'absent', label: presenceLabel(st, a.claim, false) };
      register(fx, id, 'claim', a.claim, [{ key: 'present', label: present.label }, { key: 'absent', label: absent.label }], a.claim);
      const setPresent = (b: Map<string, ClaimState>) => setClaim(b, a.claim, { ...base, status: 'present' });
      const setAbsent = (b: Map<string, ClaimState>) => setClaim(b, a.claim, { ...base, status: 'absent', value: undefined });
      if (a.op === 'exists') {
        tItem = present;
        fItem = absent;
        apply[0] = setPresent;
        apply[1] = setAbsent;
      } else {
        tItem = absent;
        fItem = present;
        apply[0] = setAbsent;
        apply[1] = setPresent;
      }
      break;
    }
    case 'eq': {
      id = `claim:${k}=${val}`;
      const eqItem = { d: id, o: 'eq', label: `${a.claim} = "${val}"` };
      const neItem = { d: id, o: 'ne', label: base.status === 'unknown' ? `${a.claim} missing or ≠ "${val}"` : `${a.claim} ≠ "${val}"` };
      register(fx, id, 'claim', `${a.claim} = "${val}"`, [{ key: 'eq', label: eqItem.label }, { key: 'ne', label: neItem.label }], a.claim);
      tItem = eqItem;
      fItem = neItem;
      apply[0] = (b) => setClaim(b, a.claim, { ...base, status: 'present', value: { kind: 'eq', value: val } });
      apply[1] = (b) => setClaim(b, a.claim, { ...base, value: addNeq(base.value, val) });
      break;
    }
    case 'neq': {
      id = `claim:${k}=${val}`;
      const neItem = { d: id, o: 'ne', label: `${a.claim} ≠ "${val}"` };
      const eqItem = { d: id, o: 'eq', label: base.status === 'unknown' ? `${a.claim} missing or = "${val}"` : `${a.claim} = "${val}"` };
      register(fx, id, 'claim', `${a.claim} = "${val}"`, [{ key: 'eq', label: `${a.claim} = "${val}"` }, { key: 'ne', label: `${a.claim} ≠ "${val}"` }], a.claim);
      tItem = neItem;
      fItem = eqItem;
      apply[0] = (b) => setClaim(b, a.claim, { ...base, status: 'present', value: addNeq(base.value, val) });
      apply[1] = (b) => setClaim(b, a.claim, { ...base, value: { kind: 'eq', value: val } });
      break;
    }
  }

  const chosen = fx.assume?.get(id);
  const allowT = chosen === undefined || chosen === tItem.o || chosen !== fItem.o;
  const allowF = chosen === undefined || chosen === fItem.o || chosen !== tItem.o;
  const t = allowT ? fork(state, tItem) : null;
  const f = allowF ? fork(state, fItem) : null;
  if (t) apply[0](t.bag);
  if (f) apply[1](f.bag);
  return [t, f];
}

interface PreResult {
  state: State;
  skippedBy: number;
}

function evaluatePreconditions(fx: Fx, state: State, preconditions: readonly Precondition[], action: string): PreResult[] {
  if (!preconditions.length) return [{ state, skippedBy: -1 }];
  const atoms = preconditions.map((p) => parsePrecondition(p, action).skipWhen);
  const rec = (s: State, i: number): PreResult[] => {
    if (i >= atoms.length) return [{ state: s, skippedBy: -1 }];
    const a = atoms[i];
    if (!a) return rec(s, i + 1);
    const r = evalAtom(a, s.bag);
    if (r === true) return [{ state: s, skippedBy: i }];
    if (r === false) return rec(s, i + 1);
    const [t, f] = split(fx, s, a);
    return [...(t ? [{ state: t, skippedBy: i }] : []), ...(f ? rec(f, i + 1) : [])];
  };
  return rec(state, 0);
}

// ---------------------------------------------------------------------------------------------
// Technical profile execution
// ---------------------------------------------------------------------------------------------

interface Missing {
  claim: string;
  technicalProfileId: string;
  required: boolean;
  status: Presence;
}

const RESOLVER = /\{[^}]+\}/;

/**
 * DefaultValue creates the claim only if it has not been set, unless AlwaysUseDefaultValue is
 * true (Microsoft Learn, technical profiles and self-asserted technical profile, output claims).
 */
function defaulted(oc: ClaimRef, prev: ClaimState | undefined): { value?: ValueInfo } {
  const dv = oc.defaultValue ?? '';
  const known: ValueInfo | undefined = RESOLVER.test(dv) ? undefined : { kind: 'eq', value: dv };
  if (oc.alwaysUseDefaultValue) return { value: known };
  if (prev?.status === 'present') return { value: prev.value };
  // The provider may return its own value under the partner claim type.
  if (oc.partnerClaimType) return { value: undefined };
  return { value: known };
}

class Runner {
  readonly errors: string[] = [];

  constructor(
    private readonly eff: EffectivePolicy,
    private readonly fx: Fx,
  ) {}

  private runTransformation(id: string, bag: Map<string, ClaimState>, source: string): void {
    const ct = this.eff.claimsTransformations.get(idKey(id))?.value;
    if (!ct) return;
    const inputs = ct.inputClaims.map((ic) => get(bag, ic.claimTypeReferenceId)?.status ?? 'absent');
    const method = (ct.method ?? '').toLowerCase();
    // Collection-building methods accept a missing collection.
    const lenient = ['additemtostringcollection', 'addparametertostringcollection', 'doesclaimexist', 'additemtoalternativesecurityidcollection'].includes(method);
    let status: Presence = 'present';
    if (!lenient) {
      if (inputs.some((s) => s === 'absent')) return; // transformation input missing: no output
      if (inputs.some((s) => s === 'unknown')) status = 'unknown';
    }
    for (const oc of ct.outputClaims) {
      let value: ValueInfo | undefined;
      if (method === 'createstringclaim') {
        const v = ct.inputParameters.find((p) => idKey(p.id) === 'value')?.value;
        if (v !== undefined && !RESOLVER.test(v)) value = { kind: 'eq', value: v };
      } else if (method === 'copyclaim' && ct.inputClaims[0]) {
        value = get(bag, ct.inputClaims[0].claimTypeReferenceId)?.value;
      }
      setClaim(bag, oc.claimTypeReferenceId, {
        status,
        value,
        source: `${source} → ${ct.id}`,
        uncertainty: status === 'unknown' ? { kind: 'transformation' } : undefined,
      });
    }
  }

  /**
   * Run a technical profile on a state. Returns one or more resulting states (validation
   * technical profile preconditions can fork). `missing` collects input claims that are not
   * definitely available.
   */
  runTechnicalProfile(tpId: string, state: State, source: string, missing: Missing[], depth = 0): State[] {
    const tp = this.eff.tp(tpId);
    if (!tp || depth > 4) return [state];
    const s = clone(state);
    const bag = s.bag;

    if (tp.enabledForUserJourneys === 'Never') return [s];
    if (tp.enabledForUserJourneys === 'OnClaimsExistence') {
      const c = tp.metadata.find((m) => m.key === 'ClaimTypeOnWhichToEnable')?.value;
      if (c && get(bag, c)?.status === 'absent') return [s];
    }

    for (const t of tp.inputClaimsTransformations) this.runTransformation(t.referenceId, bag, source);

    for (const ic of tp.inputClaims) {
      const st = get(bag, ic.claimTypeReferenceId)?.status ?? 'absent';
      if (st !== 'present' && ic.defaultValue === undefined) {
        missing.push({ claim: ic.claimTypeReferenceId, technicalProfileId: tp.id, required: !!ic.required, status: st });
      }
    }

    if (tp.kind === 'selfAsserted') return this.runSelfAsserted(tp, s, source, depth);

    const before = new Map(bag);
    const directoryReadNoError =
      tp.kind === 'entraId' &&
      (tp.metadata.find((m) => m.key === 'Operation')?.value ?? '').toLowerCase() === 'read' &&
      (tp.metadata.find((m) => m.key === 'RaiseErrorIfClaimsPrincipalDoesNotExist')?.value ?? '').toLowerCase() === 'false';

    for (const oc of tp.outputClaims) {
      if (oc.defaultValue !== undefined) {
        setClaim(bag, oc.claimTypeReferenceId, { status: 'present', value: defaulted(oc, get(before, oc.claimTypeReferenceId)).value, source });
        continue;
      }
      if (tp.kind === 'claimsTransformation' || tp.kind === 'jwtIssuer' || tp.kind === 'samlIssuer' || tp.kind === 'session') continue;
      if (directoryReadNoError) {
        const prev = get(before, oc.claimTypeReferenceId);
        if (prev?.status === 'present') continue;
        setClaim(bag, oc.claimTypeReferenceId, { status: 'unknown', source, uncertainty: { kind: 'directoryRead', tp: tp.id } });
        continue;
      }
      setClaim(bag, oc.claimTypeReferenceId, { status: 'present', source });
    }
    for (const t of tp.outputClaimsTransformations) this.runTransformation(t.referenceId, bag, source);
    return [s];
  }

  private runSelfAsserted(tp: FlatTechnicalProfile, s: State, source: string, depth: number): State[] {
    const before = new Map(s.bag);
    // Validation technical profiles run with a local claims scope.
    let locals: State[] = [s];
    const producedByVtp = new Set<string>();
    for (const vtp of tp.validationTechnicalProfiles) {
      const next: State[] = [];
      for (const ls of locals) {
        for (const pr of evaluatePreconditions(this.fx, ls, vtp.preconditions, 'SkipThisValidationTechnicalProfile')) {
          if (pr.skippedBy >= 0) {
            next.push(pr.state);
            continue;
          }
          const results = this.runTechnicalProfile(vtp.referenceId, pr.state, `${source} → ${vtp.referenceId}`, [], depth + 1);
          const vt = this.eff.tp(vtp.referenceId);
          for (const r of results) {
            if (vtp.continueOnError && vt) {
              for (const oc of vt.outputClaims) {
                const st = get(r.bag, oc.claimTypeReferenceId);
                if (st && st.status === 'present' && get(pr.state.bag, oc.claimTypeReferenceId)?.status !== 'present') {
                  setClaim(r.bag, oc.claimTypeReferenceId, { ...st, status: 'unknown', uncertainty: { kind: 'continueOnError', tp: vt.id } });
                }
              }
            }
            next.push(r);
          }
          if (vt) for (const oc of vt.outputClaims) producedByVtp.add(idKey(oc.claimTypeReferenceId));
        }
      }
      locals = next;
    }

    const displayed = new Set(tp.displayClaims.map((d) => idKey(d.claimTypeReferenceId)).filter(Boolean));
    const requiredDisplay = new Set(tp.displayClaims.filter((d) => d.required).map((d) => idKey(d.claimTypeReferenceId)));
    const inputs = new Set(tp.inputClaims.map((c) => idKey(c.claimTypeReferenceId)));
    const isPassword = (claim: string) => this.eff.claimType(claim)?.userInputType === 'Password';

    const results: State[] = [];
    for (const local of locals) {
      const out = clone(s);
      out.trails = local.trails;
      out.overflow = local.overflow;
      out.bag = new Map(before);
      for (const oc of tp.outputClaims) {
        const k = idKey(oc.claimTypeReferenceId);
        // A password is only visible to this profile's validation profiles, never to later steps.
        if (isPassword(oc.claimTypeReferenceId)) continue;
        const fromLocal = get(local.bag, oc.claimTypeReferenceId);
        const changedLocally = fromLocal && fromLocal !== get(before, oc.claimTypeReferenceId);
        if (producedByVtp.has(k) && fromLocal && changedLocally) {
          out.bag.set(k, { ...fromLocal });
          continue;
        }
        const prev = get(before, oc.claimTypeReferenceId);
        if (oc.defaultValue !== undefined) {
          setClaim(out.bag, oc.claimTypeReferenceId, { status: 'present', value: defaulted(oc, prev).value, source });
          continue;
        }
        const shown = displayed.size ? displayed.has(k) : true;
        const required = oc.required || requiredDisplay.has(k);
        if (shown && required) {
          setClaim(out.bag, oc.claimTypeReferenceId, { status: 'present', source });
        } else if (prev?.status === 'present' && inputs.has(k)) {
          // Prefilled from the bag; the user may edit it but it remains present.
          continue;
        } else if (shown) {
          setClaim(out.bag, oc.claimTypeReferenceId, { status: 'unknown', source, uncertainty: { kind: 'optionalInput', tp: tp.id } });
        }
      }
      for (const t of tp.outputClaimsTransformations) this.runTransformation(t.referenceId, out.bag, source);
      results.push(out);
    }
    return results;
  }
}

// ---------------------------------------------------------------------------------------------
// Aggregation (accumulated while walking, no per-path storage)
// ---------------------------------------------------------------------------------------------

class ClaimAcc {
  present = 0;
  unknown = 0;
  absent = 0;
  values = new Set<string>();
  sources = new Set<string>();
  missingIn: string[] = [];
  uncertainIn: string[] = [];
  constructor(readonly id: string) {}
}

class BagAgg {
  n = 0;
  private readonly arrivalWitnesses: string[] = [];
  readonly claims = new Map<string, ClaimAcc>();

  add(bag: Bag, w: () => string): void {
    for (const [k, st] of bag) {
      if (st.status === 'absent') continue;
      let a = this.claims.get(k);
      if (!a) {
        a = new ClaimAcc(st.id);
        a.absent = this.n;
        a.missingIn = [...this.arrivalWitnesses];
        this.claims.set(k, a);
      }
      if (st.status === 'present') a.present++;
      else {
        a.unknown++;
        if (a.uncertainIn.length < 3) a.uncertainIn.push(w());
      }
      if (st.value?.kind === 'eq') a.values.add(st.value.value);
      if (a.sources.size < 6) for (const s of st.sources) a.sources.add(s);
    }
    for (const [k, a] of this.claims) {
      const st = bag.get(k);
      if (!st || st.status === 'absent') {
        a.absent++;
        if (a.missingIn.length < 3) a.missingIn.push(w());
      }
    }
    this.n++;
    if (this.arrivalWitnesses.length < 3) this.arrivalWitnesses.push(w());
  }

  finish(): Map<string, ClaimAvailability> {
    const out = new Map<string, ClaimAvailability>();
    for (const [k, a] of this.claims) {
      const availability: Availability = a.present === this.n ? 'definitely' : a.present + a.unknown > 0 ? 'maybe' : 'absent';
      if (availability === 'absent') continue;
      out.set(k, {
        id: a.id,
        availability,
        presentCount: a.present,
        maybeCount: a.unknown,
        absentCount: a.absent,
        values: [...a.values],
        sources: [...a.sources],
        missingIn: a.missingIn,
        uncertainIn: a.uncertainIn,
      });
    }
    return out;
  }
}

interface MissAcc {
  claim: string;
  technicalProfileId: string;
  required: boolean;
  count: number;
  anyUnknown: boolean;
  witnesses: string[];
}

class StepAcc {
  readonly before = new BagAgg();
  readonly after = new BagAgg();
  ran = 0;
  skipped = 0;
  ranWhen: string[] = [];
  skippedWhen: string[] = [];
  readonly skippedBy = new Map<number, { count: number; witnesses: string[] }>();
  readonly tpRan = new Map<string, number>();
  readonly missing = new Map<string, MissAcc>();
  constructor(
    readonly key: string,
    readonly journeyId: string,
    readonly order: number,
  ) {}
}

class Collector {
  readonly accs = new Map<string, StepAcc>();

  observe(
    key: string,
    journeyId: string,
    order: number,
    before: State,
    outcome: { ran: boolean; skippedBy?: number; tpId?: string; missing?: Missing[] },
    after: State,
  ): void {
    let acc = this.accs.get(key);
    if (!acc) {
      acc = new StepAcc(key, journeyId, order);
      this.accs.set(key, acc);
    }
    let cached: string | undefined;
    const w = () => (cached ??= witness(before));
    acc.before.add(before.bag, w);
    acc.after.add(after.bag, w);
    if (outcome.ran) {
      acc.ran++;
      if (acc.ranWhen.length < 3) acc.ranWhen.push(w());
      if (outcome.tpId) acc.tpRan.set(outcome.tpId, (acc.tpRan.get(outcome.tpId) ?? 0) + 1);
      for (const m of outcome.missing ?? []) {
        const k = `${idKey(m.claim)}|${m.technicalProfileId}`;
        const e = acc.missing.get(k) ?? { claim: m.claim, technicalProfileId: m.technicalProfileId, required: m.required, count: 0, anyUnknown: false, witnesses: [] };
        e.count++;
        if (m.status === 'unknown') e.anyUnknown = true;
        if (e.witnesses.length < 3) e.witnesses.push(w());
        acc.missing.set(k, e);
      }
    } else {
      acc.skipped++;
      if (acc.skippedWhen.length < 3) acc.skippedWhen.push(w());
      const idx = outcome.skippedBy ?? 0;
      const e = acc.skippedBy.get(idx) ?? { count: 0, witnesses: [] };
      e.count++;
      if (e.witnesses.length < 3) e.witnesses.push(w());
      acc.skippedBy.set(idx, e);
    }
  }
}

const RANK: Record<Availability, number> = { absent: 0, maybe: 1, definitely: 2 };

function summarize(acc: StepAcc | undefined, journeyId: string, key: string, order: number, mainJourney: string): StepSummary {
  if (!acc) {
    return { stepKey: key, journeyId, order, runs: 'unreached', arrivals: 0, ranCount: 0, skipCount: 0, ranWhen: [], skippedWhen: [], skippedBy: new Map(), before: new Map(), after: new Map(), produced: [], missingInputs: [] };
  }
  const before = acc.before.finish();
  const after = acc.after.finish();
  const produced: string[] = [];
  const own = `Step ${order} `;
  for (const [k, a] of after) {
    const b = before.get(k);
    const improved = RANK[a.availability] > RANK[b?.availability ?? 'absent'];
    const setHere = journeyId === mainJourney && a.sources.some((s) => s.startsWith(own));
    if (improved || setHere) produced.push(a.id);
  }
  const missingInputs: MissingInput[] = [...acc.missing.values()].map((m) => {
    const ran = acc.tpRan.get(m.technicalProfileId) ?? 0;
    const availability: Availability = m.anyUnknown || m.count < ran ? 'maybe' : 'absent';
    return { claim: m.claim, technicalProfileId: m.technicalProfileId, required: m.required, availability, witnesses: m.witnesses };
  });
  const arrivals = acc.ran + acc.skipped;
  return {
    stepKey: key,
    journeyId,
    order,
    runs: arrivals === 0 ? 'unreached' : acc.ran === 0 ? 'never' : acc.skipped === 0 ? 'always' : 'sometimes',
    arrivals,
    ranCount: acc.ran,
    skipCount: acc.skipped,
    ranWhen: acc.ranWhen,
    skippedWhen: acc.skippedWhen,
    skippedBy: acc.skippedBy,
    before,
    after,
    produced,
    missingInputs,
  };
}

// ---------------------------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------------------------

function valueSig(v: ValueInfo | undefined): string {
  return !v ? '' : v.kind === 'eq' ? `=${v.value}` : `!${[...v.values].sort().join(',')}`;
}

function joinClaim(a: ClaimState | undefined, b: ClaimState | undefined, key: string): ClaimState | undefined {
  if (!a && !b) return undefined;
  const sa: Presence = a?.status ?? 'absent';
  const sb: Presence = b?.status ?? 'absent';
  const id = a?.id ?? b?.id ?? key;
  const status: Presence = sa === sb ? sa : 'unknown';
  let value: ValueInfo | undefined;
  if (sa === 'absent') value = b?.value;
  else if (sb === 'absent') value = a?.value;
  else if (a?.value && b?.value) {
    if (a.value.kind === 'eq' && b.value.kind === 'eq') value = a.value.value === b.value.value ? a.value : undefined;
    else if (a.value.kind === 'neq' && b.value.kind === 'neq') {
      const common = a.value.values.filter((x) => (b.value as { values: string[] }).values.includes(x));
      value = common.length ? { kind: 'neq', values: common } : undefined;
    }
  }
  const sources = [...new Set([...(a?.sources ?? []), ...(b?.sources ?? [])])].slice(0, 6);
  return { id, status, value: status === 'absent' ? undefined : value, sources, uncertainty: a?.uncertainty ?? b?.uncertainty };
}

function joinStates(a: State, b: State): State {
  const bag = new Map<string, ClaimState>();
  const keys = new Set([...a.bag.keys(), ...b.bag.keys()]);
  for (const k of keys) {
    const j = joinClaim(a.bag.get(k), b.bag.get(k), k);
    if (j && !(j.status === 'absent' && !j.sources.length)) bag.set(k, j);
  }
  let overflow = a.overflow || b.overflow;
  const trails: Trail[] = [];
  if (!overflow) {
    const seen = new Set<string>();
    for (const t of [...a.trails, ...b.trails]) {
      const sig = t.map((i) => `${i.d}:${i.o}`).join('|');
      if (seen.has(sig)) continue;
      seen.add(sig);
      trails.push(t);
      if (trails.length > MAX_TRAILS) {
        overflow = true;
        break;
      }
    }
  }
  return { ...a, bag, trails: overflow ? [] : trails, overflow };
}

const sortedCache = new WeakMap<ReadonlySet<string>, string[]>();
function sortedLive(live: ReadonlySet<string>): string[] {
  let s = sortedCache.get(live);
  if (!s) {
    s = [...live].sort();
    sortedCache.set(live, s);
  }
  return s;
}

function stateKey(s: State, live: readonly string[] | null): string {
  let key = `${s.choiceFresh ? (s.choice ?? '') : ''}|`;
  if (live) {
    for (const k of live) {
      const c = s.bag.get(k);
      if (c && c.status !== 'absent') key += `${k}:${c.status[0]}${valueSig(c.value)};`;
    }
  }
  return key;
}

// ---------------------------------------------------------------------------------------------
// Journey walk
// ---------------------------------------------------------------------------------------------

interface Ctx {
  eff: EffectivePolicy;
  fx: Fx;
  runner: Runner;
  col: Collector;
  /** States that ended (token issued, transferred, or ran off the end of the main journey). */
  done: State[];
  approximate: boolean;
  maxSeen: number;
  maxStates: number;
  depth: number;
}

function findExchange(journey: UserJourneyDef, id: string) {
  for (const s of journey.steps) for (const x of s.claimsExchanges) if (idKey(x.id) === idKey(id)) return x;
  return undefined;
}

function tpLabel(eff: EffectivePolicy, tpId: string | undefined, fallback: string): string {
  if (!tpId) return fallback;
  return eff.tp(tpId)?.displayName || tpId;
}

function mergeStates(ctx: Ctx, states: State[], tiers: LiveTiers, at: number): State[] {
  if (states.length <= 1) {
    ctx.maxSeen = Math.max(ctx.maxSeen, states.length);
    return states;
  }
  const merge = (live: readonly string[] | null) => {
    const groups = new Map<string, State>();
    for (const s of states) {
      const k = stateKey(s, live);
      const g = groups.get(k);
      groups.set(k, g ? joinStates(g, s) : s);
    }
    return [...groups.values()];
  };
  // Distinguish states by everything still read; if that leaves too many, by the claims that
  // later preconditions test, then by those tested soon, then only by the pending button choice.
  const levels: (readonly string[] | null)[] = [sortedLive(tiers.all[at]), sortedLive(tiers.tested[at]), sortedLive(tiers.soon[at]), null];
  let merged: State[] = [];
  for (let i = 0; i < levels.length; i++) {
    merged = merge(levels[i]);
    if (merged.length <= ctx.maxStates) {
      if (i > 0) ctx.approximate = true;
      break;
    }
    if (i === levels.length - 1) ctx.approximate = true;
  }
  ctx.maxSeen = Math.max(ctx.maxSeen, merged.length);
  return merged;
}

interface Exec {
  state: State;
  exchangeId?: string;
  tpId?: string;
  missing: Missing[];
}

function executeStep(ctx: Ctx, journey: UserJourneyDef, step: OrchestrationStepDef, state: State, key: string, pendingChoice: string | undefined): Exec[] {
  const { eff, runner, fx } = ctx;
  const results: Exec[] = [];
  const source = `Step ${step.orderText}`;
  const finish = (s: State, extra: Partial<Exec> = {}) => results.push({ state: s, missing: [], ...extra });
  const cleared = (s: State): State => {
    const n = clone(s);
    n.choice = undefined;
    n.choiceFresh = false;
    return n;
  };

  switch (step.type) {
    case 'CombinedSignInAndSignUp':
    case 'ClaimsProviderSelection': {
      const options: { label: string; run?: string; choice?: string; selection: string }[] = [];
      for (const sel of step.claimsProviderSelections) {
        if (sel.validationClaimsExchangeId) {
          const x = step.claimsExchanges.find((e) => idKey(e.id) === idKey(sel.validationClaimsExchangeId));
          options.push({ label: tpLabel(eff, x?.technicalProfileReferenceId, sel.validationClaimsExchangeId), run: sel.validationClaimsExchangeId, selection: sel.validationClaimsExchangeId });
          const tp = x ? eff.tp(x.technicalProfileReferenceId) : undefined;
          const signUp = tp?.metadata.find((m) => m.key === 'SignUpTarget')?.value;
          if (signUp) {
            const sx = findExchange(journey, signUp);
            options.push({ label: tpLabel(eff, sx?.technicalProfileReferenceId, signUp), choice: signUp, selection: signUp });
          }
        } else if (sel.targetClaimsExchangeId) {
          const x = findExchange(journey, sel.targetClaimsExchangeId);
          options.push({ label: tpLabel(eff, x?.technicalProfileReferenceId, sel.targetClaimsExchangeId), choice: sel.targetClaimsExchangeId, selection: sel.targetClaimsExchangeId });
        }
      }
      if (!options.length) {
        finish(cleared(state));
        break;
      }
      const id = `select:${key}`;
      const multiple = options.length > 1;
      if (multiple) register(fx, id, 'select', `Button chosen at step ${step.orderText}`, options.map((o) => ({ key: o.selection, label: o.label })));
      const kept = multiple ? keepOptions(fx, id, options.map((o) => ({ ...o, key: o.selection }))) : options.map((o) => ({ ...o, key: o.selection }));
      for (const o of kept) {
        let s = multiple ? fork(state, { d: id, o: o.selection, label: o.label }) : clone(state);
        s.choice = o.choice;
        s.choiceFresh = !!o.choice;
        if (o.run) {
          const x = step.claimsExchanges.find((e) => idKey(e.id) === idKey(o.run));
          if (x) {
            const missing: Missing[] = [];
            for (const r of runner.runTechnicalProfile(x.technicalProfileReferenceId, s, `${source} · ${x.technicalProfileReferenceId}`, missing)) {
              finish(r, { exchangeId: x.id, tpId: x.technicalProfileReferenceId, missing });
            }
            continue;
          }
        }
        s = clone(s);
        finish(s);
      }
      break;
    }
    case 'ClaimsExchange': {
      const exchanges = step.claimsExchanges;
      let chosen = pendingChoice ? exchanges.filter((x) => idKey(x.id) === idKey(pendingChoice)) : [];
      if (!chosen.length) chosen = exchanges;
      if (!chosen.length) {
        finish(cleared(state));
        break;
      }
      const id = `exchange:${key}`;
      const multiple = chosen.length > 1;
      const labelled = chosen.map((x) => ({ x, key: x.id, label: tpLabel(eff, x.technicalProfileReferenceId, x.id) }));
      if (multiple) register(fx, id, 'exchange', `Exchange used at step ${step.orderText}`, labelled.map((l) => ({ key: l.key, label: l.label })));
      for (const l of multiple ? keepOptions(fx, id, labelled) : labelled) {
        const s = cleared(multiple ? fork(state, { d: id, o: l.key, label: l.label }) : state);
        const missing: Missing[] = [];
        for (const r of runner.runTechnicalProfile(l.x.technicalProfileReferenceId, s, `${source} · ${l.x.technicalProfileReferenceId}`, missing)) {
          finish(r, { exchangeId: l.x.id, tpId: l.x.technicalProfileReferenceId, missing });
        }
      }
      break;
    }
    case 'GetClaims': {
      const s = cleared(state);
      for (const ic of eff.relyingParty?.technicalProfile?.inputClaims ?? []) {
        if (get(s.bag, ic.claimTypeReferenceId)?.status === 'present') continue;
        if (ic.defaultValue !== undefined) setClaim(s.bag, ic.claimTypeReferenceId, { status: 'present', source: `${source} · relying party` });
        else setClaim(s.bag, ic.claimTypeReferenceId, { status: 'unknown', source: `${source} · relying party`, uncertainty: { kind: 'fromApp' } });
      }
      finish(s);
      break;
    }
    case 'SendClaims': {
      const s = cleared(state);
      const issuer = step.cpimIssuerTechnicalProfileReferenceId ?? journey.defaultCpimIssuerTechnicalProfileReferenceId;
      s.issuer = issuer;
      const missing: Missing[] = [];
      if (issuer) {
        for (const ic of eff.tp(issuer)?.inputClaims ?? []) {
          const st = get(s.bag, ic.claimTypeReferenceId)?.status ?? 'absent';
          if (st !== 'present' && ic.defaultValue === undefined) missing.push({ claim: ic.claimTypeReferenceId, technicalProfileId: issuer, required: !!ic.required, status: st });
        }
      }
      s.terminated = 'token';
      finish(s, { tpId: issuer, missing });
      break;
    }
    default:
      // InvokeSubJourney and unknown types: no claims change here.
      finish(cleared(state));
  }
  return results;
}

function runSteps(ctx: Ctx, journey: UserJourneyDef, steps: readonly OrchestrationStepDef[], input: State[], tail: ReadonlySet<string>): State[] {
  const tiers = liveTiers(ctx.eff, steps, tail);
  let states = input;
  for (let i = 0; i < steps.length && states.length; i++) {
    const step = steps[i];
    const key = stepKey(journey.id, step.orderText.trim() || String(step.order));
    ctx.fx.step = key;
    const next: State[] = [];
    const subBatch: State[] = [];
    for (const s of states) {
      for (const pr of evaluatePreconditions(ctx.fx, s, step.preconditions, 'SkipThisOrchestrationStep')) {
        const s1 = pr.state;
        // A choice from a selection step only applies to the step right after it.
        const pendingChoice = s1.choiceFresh ? s1.choice : undefined;
        if (pr.skippedBy >= 0) {
          const ns = clone(s1);
          ns.choice = undefined;
          ns.choiceFresh = false;
          ctx.col.observe(key, journey.id, step.order, s1, { ran: false, skippedBy: pr.skippedBy }, ns);
          next.push(ns);
          continue;
        }
        for (const ex of executeStep(ctx, journey, step, s1, key, pendingChoice)) {
          ctx.col.observe(key, journey.id, step.order, s1, { ran: true, tpId: ex.tpId, missing: ex.missing }, ex.state);
          if (ex.state.terminated) ctx.done.push(ex.state);
          else if (step.type === 'InvokeSubJourney') subBatch.push(ex.state);
          else next.push(ex.state);
        }
      }
    }
    if (subBatch.length) {
      const cand = step.journeyCandidates[0];
      const sub = cand ? ctx.eff.subJourneys.get(idKey(cand.subJourneyReferenceId))?.value : undefined;
      if (sub && ctx.depth < 3) {
        ctx.depth++;
        const after = runSteps(ctx, sub, sub.steps, mergeStates(ctx, subBatch, tiers, i + 1), tiers.all[i + 1]);
        ctx.depth--;
        if ((sub.subJourneyType ?? '').toLowerCase() === 'transfer') {
          for (const s of after) {
            s.terminated = 'transfer';
            ctx.done.push(s);
          }
        } else next.push(...after);
      } else next.push(...subBatch);
    }
    states = mergeStates(ctx, next, tiers, i + 1);
  }
  return states;
}

function namedPathsOf(done: State[]): NamedPath[] | null {
  const out: NamedPath[] = [];
  const seen = new Set<string>();
  for (const s of done) {
    if (s.overflow) return null;
    for (const t of s.trails) {
      const label = t.length ? t.map((i) => i.label).join(' · ') : 'Main path';
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({ id: out.length, label, assume: t.map((i) => [i.d, i.o] as [string, string]), outcome: s.terminated ?? 'incomplete' });
      if (out.length > MAX_TRAILS) return null;
    }
  }
  return out;
}

export function analyzeJourney(eff: EffectivePolicy, journeyId: string, opts: AnalyzeOptions = {}): JourneyAnalysis {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const journey = eff.userJourneys.get(idKey(journeyId))?.value ?? eff.subJourneys.get(idKey(journeyId))?.value;
  if (!journey) {
    return { journeyId, steps: new Map(), decisions: [], namedPaths: [], tokenClaims: [], approximate: false, stateCount: 0, elapsedMs: 0, errors: [`Journey ${journeyId} not found`] };
  }
  const fx: Fx = { assume: opts.assume, decisions: new Map(), step: '' };
  const runner = new Runner(eff, fx);
  const col = new Collector();
  const ctx: Ctx = { eff, fx, runner, col, done: [], approximate: false, maxSeen: 1, maxStates: opts.maxStates ?? MAX_STATES, depth: 0 };
  const init: State = { bag: new Map(), trails: [[]], overflow: false };
  const rest = runSteps(ctx, journey, journey.steps, [init], tokenReads(eff));
  ctx.done.push(...rest);

  const steps = new Map<string, StepSummary>();
  for (const st of journey.steps) {
    const key = stepKey(journey.id, st.orderText.trim() || String(st.order));
    steps.set(key, summarize(col.accs.get(key), journey.id, key, st.order, journey.id));
  }
  for (const [key, acc] of col.accs) if (!steps.has(key)) steps.set(key, summarize(acc, acc.journeyId, key, acc.order, journey.id));

  const tokenStates = ctx.done.filter((s) => s.terminated === 'token');
  const tokenClaims = (eff.relyingParty?.technicalProfile?.outputClaims ?? []).map((oc) => {
    const agg = new BagAgg();
    for (const s of tokenStates) {
      const bag = new Map<string, ClaimState>();
      const st = oc.defaultValue !== undefined ? { id: oc.claimTypeReferenceId, status: 'present' as Presence, sources: ['Relying party default'] } : s.bag.get(idKey(oc.claimTypeReferenceId));
      if (st) bag.set(idKey(oc.claimTypeReferenceId), st);
      agg.add(bag, () => witness(s));
    }
    const availability = agg.finish().get(idKey(oc.claimTypeReferenceId)) ?? {
      id: oc.claimTypeReferenceId,
      availability: 'absent' as Availability,
      presentCount: 0,
      maybeCount: 0,
      absentCount: tokenStates.length,
      values: [],
      sources: [],
      missingIn: tokenStates.slice(0, 3).map(witness),
      uncertainIn: [],
    };
    return { claim: oc.claimTypeReferenceId, availability, ref: oc.ref, partnerClaimType: oc.partnerClaimType };
  });

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    journeyId: journey.id,
    steps,
    decisions: [...fx.decisions.values()],
    namedPaths: namedPathsOf(ctx.done),
    tokenClaims,
    approximate: ctx.approximate,
    stateCount: ctx.maxSeen,
    elapsedMs: Math.round(now - started),
    errors: runner.errors,
  };
}

/** Availability of a claim before a given step, or undefined if it is not there. */
export function availabilityBefore(a: JourneyAnalysis | undefined, key: string, claim: string): ClaimAvailability | undefined {
  return a?.steps.get(key)?.before.get(idKey(claim));
}
