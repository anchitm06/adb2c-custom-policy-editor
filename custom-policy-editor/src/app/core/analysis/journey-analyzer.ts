/**
 * Path-sensitive analysis of a user journey.
 *
 * The journey is executed abstractly. Each path carries a claims bag where every claim is
 * present, absent or unknown, optionally with a known value (or values it is known not to have).
 * The analysis forks a path:
 *  - at claims provider selection steps (one path per button / sign-up link),
 *  - at claims exchange steps with several exchanges and no prior selection,
 *  - lazily, when a precondition depends on a claim whose presence or value is unknown.
 *
 * The result tells, for every step, on which paths it runs or is skipped and which claims are
 * definitely / maybe / not in the claims bag before and after it.
 */

import { ClaimRef, idKey, OrchestrationStepDef, Precondition, SourceRef, UserJourneyDef } from '../model/types';
import { EffectivePolicy, FlatTechnicalProfile } from '../resolve/resolve';
import { Atom, describeAtom, parsePrecondition } from './preconditions';

export const MAX_PATHS = 256;

export type Presence = 'present' | 'absent' | 'unknown';

export type ValueInfo = { kind: 'eq'; value: string } | { kind: 'neq'; values: string[] };

export interface ClaimState {
  /** Claim id as written where it was first produced. */
  id: string;
  status: Presence;
  /** Constraint on the value, valid when the claim is present. */
  value?: ValueInfo;
  /** Human readable producer, for example "Step 2 · Facebook-OAUTH". */
  source?: string;
  /** Why presence is unknown (used to give forks friendly names). */
  uncertainty?: { kind: 'directoryRead' | 'optionalInput' | 'continueOnError' | 'fromApp' | 'transformation'; tp?: string };
}

export type Bag = ReadonlyMap<string, ClaimState>;

export interface StepVisit {
  stepKey: string;
  journeyId: string;
  order: number;
  ran: boolean;
  /** Index of the precondition that skipped the step. */
  skippedBy?: number;
  /** Claims exchange / technical profile that ran. */
  exchangeId?: string;
  technicalProfileId?: string;
  /** Selection made on this step (button id). */
  selection?: string;
  before: Bag;
  after: Bag;
  missingInputs: { claim: string; technicalProfileId: string; required: boolean; status: Presence }[];
}

export interface JourneyPath {
  id: number;
  label: string;
  labels: string[];
  visits: StepVisit[];
  outcome: 'token' | 'transfer' | 'incomplete' | 'error';
  final: Bag;
  issuer?: string;
}

export type Availability = 'definitely' | 'maybe' | 'absent';

export interface ClaimAvailability {
  id: string;
  availability: Availability;
  presentOn: number[];
  maybeOn: number[];
  absentOn: number[];
  /** Known values across paths where the claim is present with a known value. */
  values: string[];
  sources: string[];
}

export interface StepSummary {
  stepKey: string;
  journeyId: string;
  order: number;
  runs: 'always' | 'sometimes' | 'never' | 'unreached';
  runPaths: number[];
  skipPaths: number[];
  /** For each path that skipped the step, which precondition skipped it. */
  skippedBy: Map<number, number>;
  before: Map<string, ClaimAvailability>;
  after: Map<string, ClaimAvailability>;
  /** Claims whose availability after the step is better than before. */
  produced: string[];
  missingInputs: { claim: string; technicalProfileId: string; required: boolean; availability: Availability; paths: number[] }[];
}

export interface JourneyAnalysis {
  journeyId: string;
  paths: JourneyPath[];
  truncated: boolean;
  steps: Map<string, StepSummary>;
  /** Steps of sub journeys reached, keyed like the main steps. */
  tokenClaims: { claim: string; availability: ClaimAvailability; ref: SourceRef; partnerClaimType?: string }[];
  errors: string[];
}

export function stepKey(journeyId: string, order: number | string): string {
  return `${journeyId}#${order}`;
}

// ---------------------------------------------------------------------------------------------
// Path state
// ---------------------------------------------------------------------------------------------

interface PathState {
  bag: Map<string, ClaimState>;
  /** Claims exchange chosen at a selection step, consumed by the next step. */
  choice?: string;
  choiceFresh?: boolean;
  labels: string[];
  visits: StepVisit[];
  terminated?: JourneyPath['outcome'];
  issuer?: string;
}

function clone(s: PathState): PathState {
  return { ...s, bag: new Map(s.bag), labels: [...s.labels], visits: [...s.visits] };
}

function get(bag: ReadonlyMap<string, ClaimState>, claim: string): ClaimState | undefined {
  return bag.get(idKey(claim));
}

function setClaim(bag: Map<string, ClaimState>, claim: string, st: Omit<ClaimState, 'id'>): void {
  const prev = bag.get(idKey(claim));
  bag.set(idKey(claim), { id: prev?.id ?? claim, ...st });
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

/** Split a state into [atom holds, atom does not hold]. */
function split(state: PathState, a: Atom): [PathState, PathState] {
  const t = clone(state);
  const f = clone(state);
  const st = get(state.bag, a.claim);
  const base: Omit<ClaimState, 'id'> = { status: st?.status ?? 'absent', value: st?.value, source: st?.source, uncertainty: st?.uncertainty };
  const addNeq = (v: ValueInfo | undefined, x: string): ValueInfo =>
    v?.kind === 'neq' ? { kind: 'neq', values: [...new Set([...v.values, x])] } : { kind: 'neq', values: [x] };
  switch (a.op) {
    case 'exists':
    case 'missing': {
      const presentState = a.op === 'exists' ? t : f;
      const absentState = a.op === 'exists' ? f : t;
      setClaim(presentState.bag, a.claim, { ...base, status: 'present' });
      setClaim(absentState.bag, a.claim, { ...base, status: 'absent', value: undefined });
      presentState.labels.push(presenceLabel(st, a.claim, true));
      absentState.labels.push(presenceLabel(st, a.claim, false));
      break;
    }
    case 'eq': {
      setClaim(t.bag, a.claim, { ...base, status: 'present', value: { kind: 'eq', value: a.value ?? '' } });
      setClaim(f.bag, a.claim, { ...base, value: addNeq(base.value, a.value ?? '') });
      t.labels.push(describeAtom(a));
      f.labels.push(base.status === 'unknown' ? `${a.claim} missing or ≠ "${a.value}"` : `${a.claim} ≠ "${a.value}"`);
      break;
    }
    case 'neq': {
      setClaim(t.bag, a.claim, { ...base, status: 'present', value: addNeq(base.value, a.value ?? '') });
      setClaim(f.bag, a.claim, { ...base, value: { kind: 'eq', value: a.value ?? '' } });
      t.labels.push(describeAtom(a));
      f.labels.push(base.status === 'unknown' ? `${a.claim} missing or = "${a.value}"` : `${a.claim} = "${a.value}"`);
      break;
    }
  }
  return [t, f];
}

interface PreResult {
  state: PathState;
  skippedBy: number;
}

export function evaluatePreconditions(state: PathState, preconditions: readonly Precondition[], action: string): PreResult[] {
  const atoms = preconditions.map((p) => parsePrecondition(p, action).skipWhen);
  const rec = (s: PathState, i: number): PreResult[] => {
    if (i >= atoms.length) return [{ state: s, skippedBy: -1 }];
    const a = atoms[i];
    if (!a) return rec(s, i + 1);
    const r = evalAtom(a, s.bag);
    if (r === true) return [{ state: s, skippedBy: i }];
    if (r === false) return rec(s, i + 1);
    const [t, f] = split(s, a);
    return [{ state: t, skippedBy: i }, ...rec(f, i + 1)];
  };
  return rec(state, 0);
}

// ---------------------------------------------------------------------------------------------
// Technical profile execution
// ---------------------------------------------------------------------------------------------

function knownDefault(c: ClaimRef): string | undefined {
  if (c.defaultValue === undefined) return undefined;
  if (/\{[^}]+\}/.test(c.defaultValue)) return undefined; // claim resolver, resolved at runtime
  if (c.alwaysUseDefaultValue || !c.partnerClaimType) return c.defaultValue;
  return undefined;
}

class Runner {
  readonly errors: string[] = [];

  constructor(private readonly eff: EffectivePolicy) {}

  private runTransformation(id: string, bag: Map<string, ClaimState>, source: string): void {
    const ct = this.eff.claimsTransformations.get(idKey(id))?.value;
    if (!ct) return;
    const inputs = ct.inputClaims.map((ic) => get(bag, ic.claimTypeReferenceId)?.status ?? 'absent');
    const method = (ct.method ?? '').toLowerCase();
    // Collection-building methods accept a missing collection.
    const lenient = method === 'additemtostringcollection' || method === 'addparametertostringcollection' || method === 'doesclaimexist' || method === 'addItemToAlternativeSecurityIdCollection'.toLowerCase();
    let status: Presence = 'present';
    if (!lenient) {
      if (inputs.some((s) => s === 'absent')) return; // transformation input missing: no output
      if (inputs.some((s) => s === 'unknown')) status = 'unknown';
    }
    for (const oc of ct.outputClaims) {
      let value: ValueInfo | undefined;
      if (method === 'createstringclaim') {
        const v = ct.inputParameters.find((p) => idKey(p.id) === 'value')?.value;
        if (v !== undefined && !/\{[^}]+\}/.test(v)) value = { kind: 'eq', value: v };
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
   * Run a technical profile on a path. Returns one or more resulting states (validation
   * technical profile preconditions can fork). `missing` collects input claims that are not
   * definitely available.
   */
  runTechnicalProfile(
    tpId: string,
    state: PathState,
    source: string,
    missing: StepVisit['missingInputs'],
    depth = 0,
  ): PathState[] {
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
      const kv = knownDefault(oc);
      if (oc.defaultValue !== undefined) {
        const prev = get(before, oc.claimTypeReferenceId);
        const keepPrev = !oc.alwaysUseDefaultValue && prev?.status === 'present' && !!oc.partnerClaimType;
        setClaim(bag, oc.claimTypeReferenceId, {
          status: 'present',
          value: keepPrev ? undefined : kv !== undefined ? { kind: 'eq', value: kv } : undefined,
          source,
        });
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

  private runSelfAsserted(tp: FlatTechnicalProfile, s: PathState, source: string, depth: number): PathState[] {
    const before = new Map(s.bag);
    // Validation technical profiles run with a local claims scope.
    let locals: PathState[] = [s];
    const produced = new Map<string, Set<string>>();
    for (const vtp of tp.validationTechnicalProfiles) {
      const next: PathState[] = [];
      for (const ls of locals) {
        for (const pr of evaluatePreconditions(ls, vtp.preconditions, 'SkipThisValidationTechnicalProfile')) {
          if (pr.skippedBy >= 0) {
            next.push(pr.state);
            continue;
          }
          const vMissing: StepVisit['missingInputs'] = [];
          const results = this.runTechnicalProfile(vtp.referenceId, pr.state, `${source} → ${vtp.referenceId}`, vMissing, depth + 1);
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
          if (vt) {
            const set = produced.get(vt.id) ?? new Set<string>();
            for (const oc of vt.outputClaims) set.add(idKey(oc.claimTypeReferenceId));
            produced.set(vt.id, set);
          }
        }
      }
      locals = next;
    }
    const producedByVtp = new Set<string>();
    for (const set of produced.values()) for (const k of set) producedByVtp.add(k);

    const displayed = new Set(tp.displayClaims.map((d) => idKey(d.claimTypeReferenceId)).filter(Boolean));
    const requiredDisplay = new Set(tp.displayClaims.filter((d) => d.required).map((d) => idKey(d.claimTypeReferenceId)));
    const inputs = new Set(tp.inputClaims.map((c) => idKey(c.claimTypeReferenceId)));

    const results: PathState[] = [];
    for (const local of locals) {
      const out = clone(s);
      out.labels = local.labels;
      out.bag = new Map(before);
      for (const oc of tp.outputClaims) {
        const k = idKey(oc.claimTypeReferenceId);
        const fromLocal = get(local.bag, oc.claimTypeReferenceId);
        const changedLocally = fromLocal && fromLocal !== get(before, oc.claimTypeReferenceId);
        if (producedByVtp.has(k) && fromLocal && changedLocally) {
          out.bag.set(k, { ...fromLocal, id: fromLocal.id });
          continue;
        }
        if (oc.defaultValue !== undefined) {
          const kv = knownDefault(oc);
          const prev = get(before, oc.claimTypeReferenceId);
          setClaim(out.bag, oc.claimTypeReferenceId, {
            status: 'present',
            value: oc.alwaysUseDefaultValue || prev?.status !== 'present' ? (kv !== undefined ? { kind: 'eq', value: kv } : undefined) : prev?.value,
            source,
          });
          continue;
        }
        const prev = get(before, oc.claimTypeReferenceId);
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
// Journey walk
// ---------------------------------------------------------------------------------------------

interface WalkCtx {
  eff: EffectivePolicy;
  runner: Runner;
  journey: UserJourneyDef;
  ends: PathState[];
  truncated: boolean;
  depth: number;
}

function findExchange(journey: UserJourneyDef, id: string) {
  for (const s of journey.steps) for (const x of s.claimsExchanges) if (idKey(x.id) === idKey(id)) return x;
  return undefined;
}

function tpLabel(eff: EffectivePolicy, tpId: string | undefined, fallback: string): string {
  if (!tpId) return fallback;
  const tp = eff.tp(tpId);
  return tp?.displayName || tpId;
}

function snapshot(bag: Map<string, ClaimState>): Bag {
  return new Map(bag);
}

function* walk(ctx: WalkCtx, journey: UserJourneyDef, steps: readonly OrchestrationStepDef[], i: number, state: PathState): Generator<PathState> {
  if (state.terminated) {
    yield state;
    return;
  }
  if (i >= steps.length) {
    yield state;
    return;
  }
  if (ctx.ends.length >= MAX_PATHS) {
    ctx.truncated = true;
    return;
  }
  const step = steps[i];
  const key = stepKey(journey.id, step.orderText.trim() || String(step.order));

  for (const pr of evaluatePreconditions(state, step.preconditions, 'SkipThisOrchestrationStep')) {
    const s = pr.state;
    // A choice from a selection step only applies to the step right after it.
    const pendingChoice = s.choiceFresh ? s.choice : undefined;
    if (pr.skippedBy >= 0) {
      const ns = clone(s);
      ns.choice = undefined;
      ns.choiceFresh = false;
      ns.visits.push({ stepKey: key, journeyId: journey.id, order: step.order, ran: false, skippedBy: pr.skippedBy, before: snapshot(s.bag), after: snapshot(s.bag), missingInputs: [] });
      yield* walk(ctx, journey, steps, i + 1, ns);
      continue;
    }
    for (const out of executeStep(ctx, journey, step, s, key, pendingChoice)) {
      if (step.type === 'InvokeSubJourney' && !out.terminated) {
        const cand = step.journeyCandidates[0];
        const sub = cand ? ctx.eff.subJourneys.get(idKey(cand.subJourneyReferenceId))?.value : undefined;
        if (sub && ctx.depth < 3) {
          ctx.depth++;
          for (const after of walk(ctx, sub, sub.steps, 0, out)) {
            if ((sub.subJourneyType ?? '').toLowerCase() === 'transfer' && !after.terminated) after.terminated = 'transfer';
            yield* walk(ctx, journey, steps, i + 1, after);
          }
          ctx.depth--;
          continue;
        }
      }
      yield* walk(ctx, journey, steps, i + 1, out);
    }
  }
}

function executeStep(ctx: WalkCtx, journey: UserJourneyDef, step: OrchestrationStepDef, state: PathState, key: string, pendingChoice: string | undefined): PathState[] {
  const { eff, runner } = ctx;
  const before = snapshot(state.bag);
  const results: PathState[] = [];
  const record = (s: PathState, extra: Partial<StepVisit>, missing: StepVisit['missingInputs'] = []) => {
    s.visits.push({ stepKey: key, journeyId: journey.id, order: step.order, ran: true, before, after: snapshot(s.bag), missingInputs: missing, ...extra });
    results.push(s);
  };
  const source = `Step ${step.orderText}`;

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
        const s = clone(state);
        s.choice = undefined;
        s.choiceFresh = false;
        record(s, {});
        break;
      }
      const multiple = options.length > 1;
      for (const o of options) {
        const s = clone(state);
        if (multiple) s.labels.push(o.label);
        s.choice = o.choice;
        s.choiceFresh = !!o.choice;
        if (o.run) {
          const x = step.claimsExchanges.find((e) => idKey(e.id) === idKey(o.run));
          const missing: StepVisit['missingInputs'] = [];
          if (x) {
            for (const r of runner.runTechnicalProfile(x.technicalProfileReferenceId, s, `${source} · ${x.technicalProfileReferenceId}`, missing)) {
              record(r, { selection: o.selection, exchangeId: x.id, technicalProfileId: x.technicalProfileReferenceId }, missing);
            }
            continue;
          }
        }
        record(s, { selection: o.selection });
      }
      break;
    }
    case 'ClaimsExchange': {
      const exchanges = step.claimsExchanges;
      let chosen = pendingChoice ? exchanges.filter((x) => idKey(x.id) === idKey(pendingChoice)) : [];
      if (!chosen.length) chosen = exchanges;
      const multiple = chosen.length > 1;
      for (const x of chosen) {
        const s = clone(state);
        s.choice = undefined;
        s.choiceFresh = false;
        if (multiple) s.labels.push(tpLabel(eff, x.technicalProfileReferenceId, x.id));
        const missing: StepVisit['missingInputs'] = [];
        for (const r of runner.runTechnicalProfile(x.technicalProfileReferenceId, s, `${source} · ${x.technicalProfileReferenceId}`, missing)) {
          record(r, { exchangeId: x.id, technicalProfileId: x.technicalProfileReferenceId }, missing);
        }
      }
      if (!chosen.length) {
        const s = clone(state);
        s.choice = undefined;
        s.choiceFresh = false;
        record(s, {});
      }
      break;
    }
    case 'GetClaims': {
      const s = clone(state);
      s.choiceFresh = false;
      for (const ic of eff.relyingParty?.technicalProfile?.inputClaims ?? []) {
        if (get(s.bag, ic.claimTypeReferenceId)?.status === 'present') continue;
        if (ic.defaultValue !== undefined) setClaim(s.bag, ic.claimTypeReferenceId, { status: 'present', source: `${source} · relying party` });
        else setClaim(s.bag, ic.claimTypeReferenceId, { status: 'unknown', source: `${source} · relying party`, uncertainty: { kind: 'fromApp' } });
      }
      record(s, {});
      break;
    }
    case 'SendClaims': {
      const s = clone(state);
      s.choiceFresh = false;
      const issuer = step.cpimIssuerTechnicalProfileReferenceId ?? journey.defaultCpimIssuerTechnicalProfileReferenceId;
      s.issuer = issuer;
      const missing: StepVisit['missingInputs'] = [];
      if (issuer) {
        const tp = eff.tp(issuer);
        for (const ic of tp?.inputClaims ?? []) {
          const st = get(s.bag, ic.claimTypeReferenceId)?.status ?? 'absent';
          if (st !== 'present' && ic.defaultValue === undefined) missing.push({ claim: ic.claimTypeReferenceId, technicalProfileId: issuer, required: !!ic.required, status: st });
        }
      }
      s.terminated = 'token';
      record(s, { technicalProfileId: issuer }, missing);
      break;
    }
    default: {
      // InvokeSubJourney and unknown types: no claims change here.
      const s = clone(state);
      s.choiceFresh = false;
      record(s, {});
    }
  }
  return results;
}

// ---------------------------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------------------------

function availabilityOf(id: string, entries: { path: number; st?: ClaimState }[]): ClaimAvailability {
  const presentOn: number[] = [];
  const maybeOn: number[] = [];
  const absentOn: number[] = [];
  const values = new Set<string>();
  const sources = new Set<string>();
  for (const e of entries) {
    const status = e.st?.status ?? 'absent';
    if (status === 'present') presentOn.push(e.path);
    else if (status === 'unknown') maybeOn.push(e.path);
    else absentOn.push(e.path);
    if (status !== 'absent' && e.st?.value?.kind === 'eq') values.add(e.st.value.value);
    if (status !== 'absent' && e.st?.source) sources.add(e.st.source);
  }
  const availability: Availability =
    entries.length && presentOn.length === entries.length ? 'definitely' : presentOn.length || maybeOn.length ? 'maybe' : 'absent';
  return { id, availability, presentOn, maybeOn, absentOn, values: [...values], sources: [...sources] };
}

function aggregateBags(visits: { path: number; bag: Bag }[]): Map<string, ClaimAvailability> {
  const ids = new Map<string, string>();
  for (const v of visits) for (const [k, st] of v.bag) if (st.status !== 'absent' && !ids.has(k)) ids.set(k, st.id);
  const out = new Map<string, ClaimAvailability>();
  for (const [k, id] of ids) {
    out.set(k, availabilityOf(id, visits.map((v) => ({ path: v.path, st: v.bag.get(k) }))));
  }
  return out;
}

const RANK: Record<Availability, number> = { absent: 0, maybe: 1, definitely: 2 };

export function analyzeJourney(eff: EffectivePolicy, journeyId: string): JourneyAnalysis {
  const journey = eff.userJourneys.get(idKey(journeyId))?.value ?? eff.subJourneys.get(idKey(journeyId))?.value;
  const errors: string[] = [];
  if (!journey) {
    return { journeyId, paths: [], truncated: false, steps: new Map(), tokenClaims: [], errors: [`Journey ${journeyId} not found`] };
  }
  const runner = new Runner(eff);
  const ctx: WalkCtx = { eff, runner, journey, ends: [], truncated: false, depth: 0 };
  const init: PathState = { bag: new Map(), labels: [], visits: [] };
  for (const end of walk(ctx, journey, journey.steps, 0, init)) {
    ctx.ends.push(end);
    if (ctx.ends.length >= MAX_PATHS) {
      ctx.truncated = true;
      break;
    }
  }
  errors.push(...runner.errors);

  const paths: JourneyPath[] = ctx.ends.map((s, idx) => ({
    id: idx,
    labels: s.labels,
    label: s.labels.length ? s.labels.join(' · ') : 'Main path',
    visits: s.visits,
    outcome: s.terminated ?? 'incomplete',
    final: s.bag,
    issuer: s.issuer,
  }));
  disambiguate(paths);

  // Collect step keys in journey order (including sub journey steps as reached).
  const steps = new Map<string, StepSummary>();
  const order: string[] = journey.steps.map((st) => stepKey(journey.id, st.orderText.trim() || String(st.order)));
  for (const p of paths) for (const v of p.visits) if (!order.includes(v.stepKey)) order.push(v.stepKey);

  for (const key of order) {
    const visits = paths.flatMap((p) => p.visits.filter((v) => v.stepKey === key).map((v) => ({ path: p.id, v })));
    const [jid, ord] = key.split('#');
    const runPaths = [...new Set(visits.filter((x) => x.v.ran).map((x) => x.path))];
    const skipPaths = [...new Set(visits.filter((x) => !x.v.ran).map((x) => x.path))].filter((p) => !runPaths.includes(p));
    const skippedBy = new Map<number, number>();
    for (const x of visits) if (!x.v.ran && x.v.skippedBy !== undefined) skippedBy.set(x.path, x.v.skippedBy);
    const before = aggregateBags(visits.map((x) => ({ path: x.path, bag: x.v.before })));
    const after = aggregateBags(visits.map((x) => ({ path: x.path, bag: x.v.after })));
    const produced: string[] = [];
    const ownSource = `Step ${ord} `;
    for (const [k, a] of after) {
      if (a.availability === 'absent') continue;
      const b = before.get(k);
      const improved = RANK[a.availability] > RANK[b?.availability ?? 'absent'];
      const setHere = jid === journey.id && a.sources.some((src) => src.startsWith(ownSource));
      if (improved || setHere) produced.push(a.id);
    }
    const mi = new Map<string, StepSummary['missingInputs'][number]>();
    for (const x of visits) {
      for (const m of x.v.missingInputs) {
        const k = `${idKey(m.claim)}|${m.technicalProfileId}`;
        const e = mi.get(k) ?? { claim: m.claim, technicalProfileId: m.technicalProfileId, required: m.required, availability: 'absent' as Availability, paths: [] };
        e.paths.push(x.path);
        if (m.status === 'unknown') e.availability = 'maybe';
        mi.set(k, e);
      }
    }
    // An input missing on only some of the paths that ran the TP is "maybe".
    for (const e of mi.values()) {
      const ranTp = visits.filter((x) => x.v.ran && x.v.technicalProfileId === e.technicalProfileId).length;
      if (e.availability === 'absent' && e.paths.length < ranTp) e.availability = 'maybe';
    }
    steps.set(key, {
      stepKey: key,
      journeyId: jid,
      order: Number(ord),
      runs: visits.length === 0 ? 'unreached' : runPaths.length === 0 ? 'never' : skipPaths.length === 0 ? 'always' : 'sometimes',
      runPaths,
      skipPaths,
      skippedBy,
      before,
      after,
      produced,
      missingInputs: [...mi.values()],
    });
  }

  const tokenEnds = paths.filter((p) => p.outcome === 'token');
  const rpTp = eff.relyingParty?.technicalProfile;
  const tokenClaims = (rpTp?.outputClaims ?? []).map((oc) => {
    const entries = tokenEnds.map((p) => {
      const st = p.final.get(idKey(oc.claimTypeReferenceId));
      if (oc.defaultValue !== undefined) return { path: p.id, st: { id: oc.claimTypeReferenceId, status: 'present' as Presence, source: 'Relying party default' } };
      return { path: p.id, st };
    });
    return { claim: oc.claimTypeReferenceId, availability: availabilityOf(oc.claimTypeReferenceId, entries), ref: oc.ref, partnerClaimType: oc.partnerClaimType };
  });

  return { journeyId: journey.id, paths, truncated: ctx.truncated, steps, tokenClaims, errors };
}

function disambiguate(paths: JourneyPath[]): void {
  const seen = new Map<string, number>();
  for (const p of paths) {
    const n = (seen.get(p.label) ?? 0) + 1;
    seen.set(p.label, n);
    if (n > 1) p.label = `${p.label} (${n})`;
  }
}

/** Availability of a claim before a given step, or 'absent' if unknown. */
export function availabilityBefore(a: JourneyAnalysis | undefined, key: string, claim: string): ClaimAvailability | undefined {
  return a?.steps.get(key)?.before.get(idKey(claim));
}
