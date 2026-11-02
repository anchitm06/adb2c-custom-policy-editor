import { findTransformationMethod } from '../catalog/claims-transformations';
import { DATA_TYPES, SELECTION_INPUT_TYPES, USER_INPUT_TYPES } from '../catalog/claims-transformations';
import { PROTOCOL_NAMES, TP_KINDS } from '../catalog/technical-profiles';
import { idKey, OrchestrationStepDef, PolicyDoc, SourceRef, STEP_TYPES, UserJourneyDef } from '../model/types';
import { JourneyAnalysis, stepKey } from '../analysis/journey-analyzer';
import { parsePrecondition } from '../analysis/preconditions';
import { EffectivePolicy, PolicyChain } from '../resolve/resolve';
import { ParsedFile } from '../workspace/workspace';

export type Severity = 'error' | 'warning' | 'info';

export type QuickFix =
  | { kind: 'renumberSteps'; journeyRef: SourceRef; label: string }
  | { kind: 'addClaimType'; claimId: string; label: string }
  | { kind: 'addExistGuard'; stepRef: SourceRef; claim: string; index: number; label: string }
  | { kind: 'setAttribute'; ref: SourceRef; name: string; value: string; label: string };

export type TargetKind = 'step' | 'journey' | 'technicalProfile' | 'claim' | 'transformation' | 'contentDefinition' | 'relyingParty' | 'file' | 'displayControl' | 'predicate' | 'localization';

export interface Diagnostic {
  key: string;
  severity: Severity;
  code: string;
  message: string;
  ref?: SourceRef;
  fileId?: string;
  target?: { kind: TargetKind; id: string; journeyId?: string };
  fix?: QuickFix;
}

class Sink {
  readonly list: Diagnostic[] = [];
  private readonly keys = new Set<string>();
  add(d: Omit<Diagnostic, 'key' | 'fileId'>): void {
    const key = `${d.code}|${d.ref ? `${d.ref.fileId}:${d.ref.path.join('.')}` : ''}|${d.message}`;
    if (this.keys.has(key)) return;
    this.keys.add(key);
    this.list.push({ ...d, key, fileId: d.ref?.fileId });
  }
}

const PLACEHOLDERS: { re: RegExp; what: string }[] = [
  { re: /yourtenant/i, what: '"yourtenant" placeholder' },
  { re: /\bProxyIdentityExperienceFrameworkAppId\b/, what: 'ProxyIdentityExperienceFrameworkAppId placeholder' },
  { re: /(?<!Proxy)\bIdentityExperienceFrameworkAppId\b/, what: 'IdentityExperienceFrameworkAppId placeholder' },
  { re: /\bfacebook_clientid\b/, what: 'facebook_clientid placeholder' },
];

/** Checks that only need a single file. */
export function validateFile(f: ParsedFile, all: ParsedFile[]): Diagnostic[] {
  const s = new Sink();
  if (f.error) {
    s.add({ severity: 'error', code: 'xml', message: `XML is not well-formed: ${f.error.message}`, ref: { fileId: f.id, path: [], line: f.error.line }, target: { kind: 'file', id: f.id } });
    return s.list;
  }
  const d = f.doc!;
  const root = d.rootRef;
  const fileTarget = { kind: 'file' as const, id: f.id };
  if (d.rootName !== 'TrustFrameworkPolicy') {
    s.add({ severity: 'error', code: 'root', message: `Root element must be <TrustFrameworkPolicy> (found <${d.rootName}>).`, ref: root, target: fileTarget });
    return s.list;
  }
  if (!d.policyId) s.add({ severity: 'error', code: 'root.policyId', message: 'PolicyId attribute is required.', ref: root, target: fileTarget });
  else if (!/^B2C_1A_/i.test(d.policyId)) s.add({ severity: 'error', code: 'root.policyId', message: `PolicyId "${d.policyId}" must start with B2C_1A_.`, ref: root, target: fileTarget });
  if (!d.tenantId) s.add({ severity: 'error', code: 'root.tenantId', message: 'TenantId attribute is required.', ref: root, target: fileTarget });
  if (!d.publicPolicyUri) s.add({ severity: 'warning', code: 'root.publicPolicyUri', message: 'PublicPolicyUri attribute is missing.', ref: root, target: fileTarget });
  if (d.basePolicy) {
    if (!d.basePolicy.policyId) s.add({ severity: 'error', code: 'base', message: 'BasePolicy must contain a PolicyId.', ref: d.basePolicy.ref, target: fileTarget });
    else if (!all.some((o) => idKey(o.doc?.policyId) === idKey(d.basePolicy!.policyId)))
      s.add({ severity: 'warning', code: 'base.missing', message: `Base policy ${d.basePolicy.policyId} is not loaded. References to its elements can't be checked.`, ref: d.basePolicy.ref, target: fileTarget });
    if (d.basePolicy.tenantId && d.tenantId && idKey(d.basePolicy.tenantId) !== idKey(d.tenantId))
      s.add({ severity: 'warning', code: 'base.tenant', message: `BasePolicy TenantId (${d.basePolicy.tenantId}) differs from this policy's TenantId (${d.tenantId}).`, ref: d.basePolicy.ref, target: fileTarget });
  }
  const dupIds = new Map<string, number>();
  for (const o of all) if (o.doc?.policyId) dupIds.set(idKey(o.doc.policyId), (dupIds.get(idKey(o.doc.policyId)) ?? 0) + 1);
  if (d.policyId && (dupIds.get(idKey(d.policyId)) ?? 0) > 1)
    s.add({ severity: 'error', code: 'root.duplicate', message: `Another loaded file also has PolicyId ${d.policyId}.`, ref: root, target: fileTarget });

  for (const p of PLACEHOLDERS) {
    if (p.re.test(f.text)) s.add({ severity: 'info', code: 'placeholder', message: `Contains the starter pack ${p.what}. Replace it before uploading (Workspace → Set tenant).`, ref: root, target: fileTarget });
  }

  const dup = (kind: string, items: { id: string; ref: SourceRef }[], target: TargetKind) => {
    const seen = new Set<string>();
    for (const it of items) {
      const k = idKey(it.id);
      if (!it.id) s.add({ severity: 'error', code: 'id.missing', message: `${kind} without an Id.`, ref: it.ref });
      else if (seen.has(k)) s.add({ severity: 'error', code: 'id.duplicate', message: `${kind} "${it.id}" is defined more than once in this file.`, ref: it.ref, target: { kind: target, id: it.id } });
      seen.add(k);
    }
  };
  dup('ClaimType', d.claimTypes, 'claim');
  dup('ClaimsTransformation', d.claimsTransformations, 'transformation');
  dup('ContentDefinition', d.contentDefinitions, 'contentDefinition');
  dup('TechnicalProfile', d.claimsProviders.flatMap((c) => c.technicalProfiles), 'technicalProfile');
  dup('UserJourney', d.userJourneys, 'journey');
  dup('SubJourney', d.subJourneys, 'journey');
  dup('DisplayControl', d.displayControls, 'displayControl');
  dup('Predicate', d.predicates, 'predicate');
  dup('PredicateValidation', d.predicateValidations, 'predicate');
  return s.list;
}

interface Lookup {
  eff: EffectivePolicy;
  chain: PolicyChain;
  baseMissing: boolean;
}

function layerOf(chain: PolicyChain, fileId: string): number {
  return chain.docs.findIndex((d) => d.fileId === fileId);
}

/** Check that `id` refers to an element of `map`; reports unresolved and forward references. */
function checkRef(
  s: Sink,
  l: Lookup,
  map: Map<string, { layers: { ref: SourceRef }[] }>,
  id: string | undefined,
  what: string,
  ref: SourceRef,
  target?: Diagnostic['target'],
  fix?: QuickFix,
): void {
  if (id === undefined) return;
  if (!id.trim()) {
    s.add({ severity: 'error', code: 'ref.empty', message: `Empty ${what} reference.`, ref, target });
    return;
  }
  const e = map.get(idKey(id));
  if (!e) {
    s.add({ severity: l.baseMissing ? 'warning' : 'error', code: 'ref.unresolved', message: `${what} "${id}" is not defined in this policy chain.`, ref, target, fix });
    return;
  }
  const from = layerOf(l.chain, ref.fileId);
  const firstDef = Math.min(...e.layers.map((x) => layerOf(l.chain, x.ref.fileId)));
  if (from >= 0 && firstDef > from) {
    s.add({ severity: 'warning', code: 'ref.forward', message: `${what} "${id}" is only defined in a derived file (${l.chain.docs[firstDef].fileName}). This file can't be uploaded on its own.`, ref, target });
  }
}

export function validateChain(eff: EffectivePolicy, analyses: JourneyAnalysis[] = []): Diagnostic[] {
  const s = new Sink();
  const chain = eff.chain;
  const l: Lookup = { eff, chain, baseMissing: chain.problems.some((p) => p.kind === 'missingBase') };

  for (const p of chain.problems) {
    if (p.kind === 'cycle') s.add({ severity: 'error', code: 'chain.cycle', message: `Inheritance cycle through ${p.detail}.`, ref: p.doc.rootRef });
    if (p.kind === 'tooDeep') s.add({ severity: 'error', code: 'chain.depth', message: `The inheritance chain has ${p.detail} levels; Azure AD B2C allows at most 10.`, ref: p.doc.rootRef });
  }
  const tenants = new Set(chain.docs.map((d) => idKey(d.tenantId)).filter(Boolean));
  if (tenants.size > 1) s.add({ severity: 'warning', code: 'chain.tenant', message: `Files in this chain use different TenantIds (${[...tenants].join(', ')}).`, ref: chain.leaf.rootRef });

  const claimFix = (id: string): QuickFix => ({ kind: 'addClaimType', claimId: id, label: `Define claim "${id}"` });
  const claim = (id: string | undefined, ref: SourceRef, what = 'Claim') => checkRef(s, l, eff.claimTypes, id, what, ref, id ? { kind: 'claim', id } : undefined, id ? claimFix(id) : undefined);

  for (const d of chain.docs) validateDocRefs(s, l, d, claim);

  // Claim types (effective)
  for (const e of eff.claimTypes.values()) {
    const c = e.value;
    const t = { kind: 'claim' as const, id: c.id };
    if (!c.dataType) s.add({ severity: 'error', code: 'claim.dataType', message: `Claim "${c.id}" has no DataType.`, ref: c.ref, target: t });
    else if (!DATA_TYPES.some((x) => x.toLowerCase() === c.dataType!.toLowerCase()))
      s.add({ severity: 'warning', code: 'claim.dataType', message: `Claim "${c.id}" has an unknown DataType "${c.dataType}".`, ref: c.ref, target: t });
    if (c.userInputType && !USER_INPUT_TYPES.some((x) => x === c.userInputType))
      s.add({ severity: 'warning', code: 'claim.userInputType', message: `Claim "${c.id}" has an unknown UserInputType "${c.userInputType}".`, ref: c.ref, target: t });
    if (c.userInputType && SELECTION_INPUT_TYPES.includes(c.userInputType) && !(c.restriction?.enumeration.length))
      s.add({ severity: 'warning', code: 'claim.enumeration', message: `Claim "${c.id}" uses ${c.userInputType} but defines no enumeration values.`, ref: c.ref, target: t });
    if (c.predicateValidationReference) checkRef(s, l, eff.predicateValidations, c.predicateValidationReference, 'PredicateValidation', c.ref, t);
  }

  // Claims transformations
  for (const e of eff.claimsTransformations.values()) {
    const ct = e.value;
    const t = { kind: 'transformation' as const, id: ct.id };
    if (!ct.method) {
      s.add({ severity: 'error', code: 'ct.method', message: `Claims transformation "${ct.id}" has no TransformationMethod.`, ref: ct.ref, target: t });
      continue;
    }
    const m = findTransformationMethod(ct.method);
    if (!m) {
      s.add({ severity: 'info', code: 'ct.method', message: `Transformation method "${ct.method}" is not in this editor's catalog; its parameters aren't checked.`, ref: ct.ref, target: t });
      continue;
    }
    if (m.dynamic) continue;
    const check = (items: { claimTypeReferenceId: string; transformationClaimType?: string; ref: SourceRef }[], spec: { tct: string; dataType?: string; optional?: boolean }[], dir: string) => {
      for (const it of items) {
        const sp = spec.find((x) => x.tct.toLowerCase() === (it.transformationClaimType ?? '').toLowerCase());
        if (!sp) {
          s.add({ severity: 'warning', code: 'ct.tct', message: `${ct.method} has no ${dir} claim "${it.transformationClaimType ?? ''}". Expected: ${spec.map((x) => x.tct).join(', ') || 'none'}.`, ref: it.ref, target: t });
          continue;
        }
        const dt = eff.claimType(it.claimTypeReferenceId)?.dataType;
        if (sp.dataType && dt && sp.dataType.toLowerCase() !== dt.toLowerCase())
          s.add({ severity: 'warning', code: 'ct.dataType', message: `${ct.method} expects ${sp.tct} to be ${sp.dataType}, but claim "${it.claimTypeReferenceId}" is ${dt}.`, ref: it.ref, target: t });
      }
      for (const sp of spec) {
        if (!sp.optional && !items.some((it) => (it.transformationClaimType ?? '').toLowerCase() === sp.tct.toLowerCase()))
          s.add({ severity: 'warning', code: 'ct.tct.missing', message: `${ct.method} requires ${dir} claim "${sp.tct}".`, ref: ct.ref, target: t });
      }
    };
    check(ct.inputClaims, m.inputs, 'input');
    check(ct.outputClaims, m.outputs, 'output');
    for (const p of ct.inputParameters) {
      if (!m.params.some((x) => x.id.toLowerCase() === p.id.toLowerCase()))
        s.add({ severity: 'warning', code: 'ct.param', message: `${ct.method} has no input parameter "${p.id}". Expected: ${m.params.map((x) => x.id).join(', ') || 'none'}.`, ref: p.ref, target: t });
    }
    for (const sp of m.params) {
      if (!sp.optional && !ct.inputParameters.some((p) => p.id.toLowerCase() === sp.id.toLowerCase()))
        s.add({ severity: 'warning', code: 'ct.param.missing', message: `${ct.method} requires input parameter "${sp.id}".`, ref: ct.ref, target: t });
    }
  }

  // Technical profiles (flattened)
  const included = new Set<string>();
  for (const e of eff.technicalProfiles.values()) if (e.value.includeTechnicalProfile) included.add(idKey(e.value.includeTechnicalProfile.referenceId));
  for (const e of eff.technicalProfiles.values()) {
    const tp = eff.tp(e.id);
    const t = { kind: 'technicalProfile' as const, id: e.id };
    const ref = e.value.ref;
    if (!tp) {
      s.add({ severity: 'error', code: 'tp.include.cycle', message: `Technical profile "${e.id}" includes itself (directly or indirectly).`, ref, target: t });
      continue;
    }
    if (!tp.protocol) {
      if (!(l.baseMissing && tp.includeTechnicalProfile)) s.add({ severity: 'error', code: 'tp.protocol', message: `Technical profile "${tp.id}" has no Protocol (directly or through IncludeTechnicalProfile).`, ref, target: t });
    } else {
      if (!PROTOCOL_NAMES.includes(tp.protocol.name as (typeof PROTOCOL_NAMES)[number]))
        s.add({ severity: 'error', code: 'tp.protocol', message: `Unknown protocol "${tp.protocol.name}". Use one of ${PROTOCOL_NAMES.join(', ')}.`, ref, target: t });
      if (tp.protocol.name === 'Proprietary' && !tp.protocol.handler)
        s.add({ severity: 'error', code: 'tp.handler', message: `Proprietary protocol requires a Handler.`, ref, target: t });
      if (tp.protocol.name === 'None' && tp.protocol.handler)
        s.add({ severity: 'warning', code: 'tp.handler', message: `Protocol None must not have a Handler.`, ref, target: t });
    }
    if (tp.validationTechnicalProfiles.length && tp.kind !== 'selfAsserted' && tp.kind !== 'unknown')
      s.add({ severity: 'error', code: 'tp.vtp', message: `Only self-asserted technical profiles can use validation technical profiles ("${tp.id}" is ${TP_KINDS[tp.kind].label}).`, ref, target: t });
    if (tp.kind === 'selfAsserted') {
      if (!tp.metadata.some((m) => m.key === 'ContentDefinitionReferenceId'))
        s.add({ severity: 'warning', code: 'tp.contentDefinition', message: `Self-asserted technical profile "${tp.id}" has no ContentDefinitionReferenceId metadata.`, ref, target: t });
      const outs = new Set(tp.outputClaims.map((c) => idKey(c.claimTypeReferenceId)));
      for (const v of tp.validationTechnicalProfiles) {
        const vt = eff.tp(v.referenceId);
        for (const ic of vt?.inputClaims ?? []) {
          if (ic.defaultValue === undefined && !outs.has(idKey(ic.claimTypeReferenceId)) && !tp.validationTechnicalProfiles.some((o) => o !== v && eff.tp(o.referenceId)?.outputClaims.some((x) => idKey(x.claimTypeReferenceId) === idKey(ic.claimTypeReferenceId))))
            s.add({ severity: 'info', code: 'tp.vtp.input', message: `Validation profile "${v.referenceId}" needs input claim "${ic.claimTypeReferenceId}", which is not an output claim of "${tp.id}".`, ref: v.ref, target: t });
        }
        v.preconditions.forEach((p) => {
          const pp = parsePrecondition(p, 'SkipThisValidationTechnicalProfile');
          for (const m of pp.problems) s.add({ severity: 'error', code: 'precondition', message: m, ref: p.ref, target: t });
        });
      }
    }
    for (const req of included.has(idKey(tp.id)) ? [] : TP_KINDS[tp.kind].metadata.filter((m) => m.required)) {
      if (!tp.metadata.some((m) => m.key === req.key) && tp.kind !== 'oidc' && tp.kind !== 'oauth2')
        s.add({ severity: 'warning', code: 'tp.metadata', message: `${TP_KINDS[tp.kind].label} "${tp.id}" is missing required metadata "${req.key}".`, ref, target: t });
    }
    const efj = tp.enabledForUserJourneys;
    if (efj && !['Always', 'Never', 'OnClaimsExistence', 'OnItemExistenceInStringCollectionClaim', 'OnItemAbsenceInStringCollectionClaim'].includes(efj))
      s.add({ severity: 'error', code: 'tp.enabledFor', message: `Unknown EnabledForUserJourneys value "${efj}".`, ref, target: t });
    if (efj && efj.startsWith('On') && !tp.metadata.some((m) => m.key === 'ClaimTypeOnWhichToEnable'))
      s.add({ severity: 'warning', code: 'tp.enabledFor', message: `EnabledForUserJourneys=${efj} requires ClaimTypeOnWhichToEnable metadata.`, ref, target: t });
  }

  // Journeys
  for (const e of eff.userJourneys.values()) validateJourney(s, l, e.value);
  for (const e of eff.subJourneys.values()) validateJourney(s, l, e.value);

  // Relying party
  const rp = eff.relyingParty;
  if (chain.leaf.relyingParty && rp) {
    if (!rp.defaultUserJourney) s.add({ severity: 'error', code: 'rp.journey', message: 'RelyingParty has no DefaultUserJourney.', ref: rp.ref, target: { kind: 'relyingParty', id: chain.leaf.fileId } });
    if (!rp.technicalProfile) s.add({ severity: 'error', code: 'rp.tp', message: 'RelyingParty has no TechnicalProfile.', ref: rp.ref, target: { kind: 'relyingParty', id: chain.leaf.fileId } });
    const def = rp.defaultUserJourney ? eff.userJourneys.get(idKey(rp.defaultUserJourney.referenceId))?.value : undefined;
    if (def && rp.technicalProfile) {
      const produced = claimsProducedBy(eff, def);
      for (const oc of rp.technicalProfile.outputClaims) {
        if (oc.defaultValue !== undefined || produced.has(idKey(oc.claimTypeReferenceId))) continue;
        s.add({
          severity: 'error',
          code: 'rp.outputNotProduced',
          message: `Token claim "${oc.claimTypeReferenceId}" is not an output claim of any step in ${def.id}, so Azure AD B2C cannot read it. Produce it in a step or give it a DefaultValue.`,
          ref: oc.ref,
          target: { kind: 'relyingParty', id: chain.leaf.fileId },
        });
      }
    }
  }

  // Data flow
  for (const a of analyses) {
    const journey = eff.userJourneys.get(idKey(a.journeyId))?.value;
    if (!journey) continue;
    if (a.approximate) s.add({ severity: 'info', code: 'analysis.approximate', message: `Journey "${journey.id}" has so many independent branches that some were merged. Claim availability may show "maybe" where it is certain; run a scenario for exact results.`, ref: journey.ref, target: { kind: 'journey', id: journey.id } });
    const allSteps = [...journey.steps.map((st) => ({ st, j: journey }))];
    for (const sum of a.steps.values()) {
      const j: UserJourneyDef | undefined = sum.journeyId === journey.id ? journey : eff.subJourneys.get(idKey(sum.journeyId))?.value;
      const st = j?.steps.find((x: OrchestrationStepDef) => stepKey(j.id, x.orderText.trim() || String(x.order)) === sum.stepKey);
      if (!st || !j) continue;
      if (j !== journey && !allSteps.some((x) => x.st === st)) allSteps.push({ st, j });
      const target = { kind: 'step' as const, id: sum.stepKey, journeyId: j.id };
      if (sum.runs === 'never') {
        s.add({ severity: 'info', code: 'flow.neverRuns', message: `Step ${st.orderText} of ${j.id} is skipped in every analysed scenario. (SSO session behaviour isn't modelled, so it may still run when a session restores claims.)`, ref: st.ref, target });
      }
      for (const m of sum.missingInputs) {
        const tp = eff.tp(m.technicalProfileId);
        const critical = m.required || tp?.kind === 'entraId' || tp?.kind === 'rest';
        // Self-asserted and identity provider input claims only prefill values.
        const prefill = !m.required && (tp?.kind === 'selfAsserted' || (tp && TP_KINDS[tp.kind].interactive));
        if (prefill) continue;
        if (m.availability === 'absent' && sum.ranCount)
          s.add({ severity: 'warning', code: 'flow.input', message: `Step ${st.orderText}: input claim "${m.claim}" of ${m.technicalProfileId} is never in the claims bag when it runs.`, ref: st.ref, target });
        else if (m.availability === 'maybe' && critical)
          s.add({ severity: 'info', code: 'flow.input', message: `Step ${st.orderText}: input claim "${m.claim}" of ${m.technicalProfileId} is missing on some paths.`, ref: st.ref, target });
      }
    }
    if (eff.relyingParty?.defaultUserJourney && idKey(eff.relyingParty.defaultUserJourney.referenceId) === idKey(journey.id)) {
      for (const tc of a.tokenClaims) {
        if (tc.availability.availability === 'absent')
          s.add({ severity: 'warning', code: 'flow.token', message: `Token claim "${tc.claim}" is never in the claims bag when the token is issued.`, ref: tc.ref, target: { kind: 'relyingParty', id: chain.leaf.fileId } });
      }
    }
  }
  return s.list;
}

function validateDocRefs(s: Sink, l: Lookup, d: PolicyDoc, claim: (id: string | undefined, ref: SourceRef, what?: string) => void): void {
  const eff = l.eff;
  for (const ct of d.claimsTransformations) {
    for (const c of [...ct.inputClaims, ...ct.outputClaims]) claim(c.claimTypeReferenceId, c.ref);
  }
  for (const cd of d.contentDefinitions) {
    for (const r of cd.localizedResourcesReferences) checkRef(s, l, eff.localizedResources, r.localizedResourcesReferenceId, 'LocalizedResources', r.ref, { kind: 'contentDefinition', id: cd.id });
  }
  for (const dc of d.displayControls) {
    for (const c of [...dc.inputClaims, ...dc.outputClaims]) claim(c.claimTypeReferenceId, c.ref);
    for (const c of dc.displayClaims) claim(c.claimTypeReferenceId, c.ref);
    for (const a of dc.actions) for (const v of a.validationClaimsExchangeTechnicalProfiles) checkRef(s, l, eff.technicalProfiles, v, 'Technical profile', a.ref, { kind: 'displayControl', id: dc.id });
  }
  for (const pv of d.predicateValidations) {
    for (const g of pv.groups) for (const r of g.predicateReferences) checkRef(s, l, eff.predicates, r, 'Predicate', g.ref, { kind: 'predicate', id: pv.id });
  }
  const tps = d.claimsProviders.flatMap((c) => c.technicalProfiles);
  if (d.relyingParty?.technicalProfile) tps.push(d.relyingParty.technicalProfile);
  for (const tp of tps) {
    const t = { kind: 'technicalProfile' as const, id: tp.id };
    for (const c of [...tp.inputClaims, ...tp.outputClaims, ...tp.persistedClaims]) {
      claim(c.claimTypeReferenceId, c.ref);
      const problem = defaultValueProblem(eff.claimType(c.claimTypeReferenceId)?.dataType, c.defaultValue);
      if (problem) s.add({ severity: 'error', code: 'claim.defaultValue.type', message: `DefaultValue "${c.defaultValue}" of ${c.claimTypeReferenceId} ${problem}.`, ref: c.ref, target: t });
    }
    for (const c of tp.displayClaims) {
      if (c.claimTypeReferenceId) claim(c.claimTypeReferenceId, c.ref);
      if (c.displayControlReferenceId) checkRef(s, l, eff.displayControls, c.displayControlReferenceId, 'Display control', c.ref, t);
    }
    for (const x of [...tp.inputClaimsTransformations, ...tp.outputClaimsTransformations]) checkRef(s, l, eff.claimsTransformations, x.referenceId, 'Claims transformation', x.ref, t);
    for (const v of tp.validationTechnicalProfiles) {
      checkRef(s, l, eff.technicalProfiles, v.referenceId, 'Technical profile', v.ref, t);
      for (const p of v.preconditions) if (p.values[0]) claim(p.values[0], p.ref);
    }
    if (tp.includeTechnicalProfile) checkRef(s, l, eff.technicalProfiles, tp.includeTechnicalProfile.referenceId, 'Technical profile', tp.includeTechnicalProfile.ref, t);
    if (tp.useTechnicalProfileForSessionManagement) checkRef(s, l, eff.technicalProfiles, tp.useTechnicalProfileForSessionManagement.referenceId, 'Session technical profile', tp.useTechnicalProfileForSessionManagement.ref, t);
    if (tp.subjectNamingInfo && tp.claimsProvider !== 'RelyingParty') claim(tp.subjectNamingInfo.claimType, tp.subjectNamingInfo.ref);
    const cdRef = tp.metadata.find((m) => m.key === 'ContentDefinitionReferenceId');
    if (cdRef) checkRef(s, l, eff.contentDefinitions, cdRef.value, 'Content definition', cdRef.ref, t);
    const enableClaim = tp.metadata.find((m) => m.key === 'ClaimTypeOnWhichToEnable');
    if (enableClaim) claim(enableClaim.value, enableClaim.ref);
  }
  for (const j of [...d.userJourneys, ...d.subJourneys]) {
    for (const st of j.steps) {
      const t = { kind: 'step' as const, id: stepKey(j.id, st.orderText.trim() || String(st.order)), journeyId: j.id };
      if (st.contentDefinitionReferenceId) checkRef(s, l, eff.contentDefinitions, st.contentDefinitionReferenceId, 'Content definition', st.ref, t);
      if (st.cpimIssuerTechnicalProfileReferenceId) checkRef(s, l, eff.technicalProfiles, st.cpimIssuerTechnicalProfileReferenceId, 'Token issuer technical profile', st.ref, t);
      for (const x of st.claimsExchanges) checkRef(s, l, eff.technicalProfiles, x.technicalProfileReferenceId, 'Technical profile', x.ref, t);
      for (const c of st.journeyCandidates) checkRef(s, l, eff.subJourneys, c.subJourneyReferenceId, 'Sub journey', c.ref, t);
      for (const p of st.preconditions) if (p.values[0]) claim(p.values[0], p.ref);
    }
    if (j.defaultCpimIssuerTechnicalProfileReferenceId) checkRef(s, l, eff.technicalProfiles, j.defaultCpimIssuerTechnicalProfileReferenceId, 'Token issuer technical profile', j.ref, { kind: 'journey', id: j.id });
  }
  const rp = d.relyingParty;
  if (rp) {
    const t = { kind: 'relyingParty' as const, id: d.fileId };
    if (rp.defaultUserJourney) checkRef(s, l, eff.userJourneys, rp.defaultUserJourney.referenceId, 'User journey', rp.defaultUserJourney.ref, t);
    for (const ep of rp.endpoints) checkRef(s, l, eff.userJourneys, ep.userJourneyReferenceId, 'User journey', ep.ref, t);
  }
}

/** Why a DefaultValue cannot be parsed as the claim data type, or null when it is fine (or cannot be judged). */
export function defaultValueProblem(dataType: string | undefined, value: string | undefined): string | null {
  if (!dataType || value === undefined || value.includes('{')) return null;
  const v = value.trim();
  switch (dataType.toLowerCase()) {
    case 'int':
      return /^-?\d+$/.test(v) && Math.abs(Number(v)) <= 2147483648 ? null : 'is not a whole number that fits an int';
    case 'long':
      return /^-?\d+$/.test(v) ? null : 'is not a whole number';
    case 'boolean':
      return /^(true|false)$/i.test(v) ? null : 'is not true or false';
    case 'date':
    case 'datetime':
      return Number.isNaN(Date.parse(v)) ? 'is not a valid date' : null;
    default:
      return null;
  }
}

/** Claims that some step of the journey (or a sub journey it calls) can put into the claims bag. */
function claimsProducedBy(eff: EffectivePolicy, journey: UserJourneyDef, seen = new Set<string>()): Set<string> {
  const out = new Set<string>();
  if (seen.has(idKey(journey.id))) return out;
  seen.add(idKey(journey.id));
  const addCt = (ref: string) => {
    for (const c of eff.claimsTransformations.get(idKey(ref))?.value.outputClaims ?? []) out.add(idKey(c.claimTypeReferenceId));
  };
  const addTp = (id: string, depth = 0) => {
    const tp = eff.tp(id);
    if (!tp || depth > 3) return;
    for (const c of tp.outputClaims) out.add(idKey(c.claimTypeReferenceId));
    for (const t of [...tp.inputClaimsTransformations, ...tp.outputClaimsTransformations]) addCt(t.referenceId);
    for (const d of tp.displayClaims) {
      const dc = d.displayControlReferenceId ? eff.displayControls.get(idKey(d.displayControlReferenceId))?.value : undefined;
      for (const c of dc?.outputClaims ?? []) out.add(idKey(c.claimTypeReferenceId));
    }
    for (const v of tp.validationTechnicalProfiles) addTp(v.referenceId, depth + 1);
  };
  for (const st of journey.steps) {
    for (const x of st.claimsExchanges) addTp(x.technicalProfileReferenceId);
    if (st.type === 'GetClaims') for (const c of eff.relyingParty?.technicalProfile?.inputClaims ?? []) out.add(idKey(c.claimTypeReferenceId));
    if (st.type === 'InvokeSubJourney') {
      const sub = eff.subJourneys.get(idKey(st.journeyCandidates[0]?.subJourneyReferenceId))?.value;
      if (sub) for (const k of claimsProducedBy(eff, sub, seen)) out.add(k);
    }
  }
  return out;
}

function validateJourney(s: Sink, l: Lookup, j: UserJourneyDef): void {
  const jt = { kind: 'journey' as const, id: j.id };
  const steps = j.steps;
  const isSub = j.kind === 'SubJourney';
  if (!steps.length) {
    s.add({ severity: 'error', code: 'journey.empty', message: `${j.kind} "${j.id}" has no orchestration steps.`, ref: j.ref, target: jt });
    return;
  }
  if (isSub && !['call', 'transfer'].includes((j.subJourneyType ?? '').toLowerCase()))
    s.add({ severity: 'error', code: 'subjourney.type', message: `SubJourney "${j.id}" needs Type="Call" or Type="Transfer".`, ref: j.ref, target: jt });

  // Order 1..N
  const bad = steps.some((st, i) => st.order !== i + 1 || String(st.order) !== st.orderText.trim());
  if (bad) {
    const sameFile = steps.every((st) => st.ref.fileId === steps[0].ref.fileId);
    s.add({
      severity: 'error',
      code: 'journey.order',
      message: `Steps of ${j.id} must be numbered 1 to ${steps.length} without gaps (found ${steps.map((st) => st.orderText).join(', ')}).`,
      ref: j.ref,
      target: jt,
      fix: sameFile ? { kind: 'renumberSteps', journeyRef: steps[0].ref.path.length ? { ...j.ref, fileId: steps[0].ref.fileId, path: steps[0].ref.path.slice(0, -2) } : j.ref, label: 'Renumber steps 1…N' } : undefined,
    });
  }
  const last = steps[steps.length - 1];
  const sendClaims = steps.filter((st) => st.type === 'SendClaims');
  if (!isSub && last.type !== 'SendClaims')
    s.add({ severity: 'error', code: 'journey.sendClaims', message: `The last step of ${j.id} must be a SendClaims step.`, ref: last.ref, target: jt });
  if (isSub && (j.subJourneyType ?? '').toLowerCase() === 'transfer' && !sendClaims.length)
    s.add({ severity: 'error', code: 'journey.sendClaims', message: `Transfer sub journey ${j.id} must end with a SendClaims step.`, ref: j.ref, target: jt });
  if (isSub && (j.subJourneyType ?? '').toLowerCase() === 'call' && sendClaims.length)
    s.add({ severity: 'warning', code: 'journey.sendClaims', message: `Call sub journey ${j.id} returns to the caller; a SendClaims step here ends the journey early.`, ref: sendClaims[0].ref, target: jt });

  const exchangeIds = new Map<string, string>();
  steps.forEach((st, i) => {
    const t = { kind: 'step' as const, id: stepKey(j.id, st.orderText.trim() || String(st.order)), journeyId: j.id };
    if (!STEP_TYPES.includes(st.type as (typeof STEP_TYPES)[number]))
      s.add({ severity: 'error', code: 'step.type', message: `Unknown step type "${st.type}".`, ref: st.ref, target: t });
    for (const x of st.claimsExchanges) {
      const k = idKey(x.id);
      if (exchangeIds.has(k) && exchangeIds.get(k) !== st.orderText)
        s.add({ severity: 'error', code: 'step.exchangeId', message: `ClaimsExchange Id "${x.id}" is also used in step ${exchangeIds.get(k)}. Ids must be unique within a journey.`, ref: x.ref, target: t });
      exchangeIds.set(k, st.orderText);
    }
    switch (st.type) {
      case 'ClaimsExchange': {
        if (!st.claimsExchanges.length) s.add({ severity: 'error', code: 'step.exchanges', message: `Step ${st.orderText} is a ClaimsExchange step without any ClaimsExchange.`, ref: st.ref, target: t });
        const prev = steps[i - 1];
        const afterSelection = !!prev && (prev.type === 'CombinedSignInAndSignUp' || prev.type === 'ClaimsProviderSelection');
        if (st.claimsExchanges.length > 1 && !afterSelection)
          s.add({ severity: 'error', code: 'step.exchanges.noSelection', message: `Step ${st.orderText} has ${st.claimsExchanges.length} claims exchanges but is not preceded by a claims provider selection, so Azure AD B2C cannot tell which one to run.`, ref: st.ref, target: t });
        break;
      }
      case 'CombinedSignInAndSignUp':
      case 'ClaimsProviderSelection': {
        if (!st.contentDefinitionReferenceId)
          s.add({ severity: 'warning', code: 'step.contentDefinition', message: `Step ${st.orderText} (${st.type}) should set ContentDefinitionReferenceId.`, ref: st.ref, target: t });
        if (!st.claimsProviderSelections.length)
          s.add({ severity: 'warning', code: 'step.selections', message: `Step ${st.orderText} has no ClaimsProviderSelection.`, ref: st.ref, target: t });
        const next = steps[i + 1];
        if (next && next.type !== 'ClaimsExchange' && st.claimsProviderSelections.some((x) => x.targetClaimsExchangeId))
          s.add({ severity: 'error', code: 'step.selection.nextType', message: `Step ${next.orderText} follows a claims provider selection and must be a ClaimsExchange step (it is ${next.type}).`, ref: next.ref, target: t });
        for (const sel of st.claimsProviderSelections) {
          if (!!sel.targetClaimsExchangeId === !!sel.validationClaimsExchangeId)
            s.add({ severity: 'error', code: 'step.selection', message: 'A ClaimsProviderSelection needs exactly one of TargetClaimsExchangeId or ValidationClaimsExchangeId.', ref: sel.ref, target: t });
          if (sel.targetClaimsExchangeId && !next?.claimsExchanges.some((x) => idKey(x.id) === idKey(sel.targetClaimsExchangeId)))
            s.add({ severity: 'error', code: 'step.selection.target', message: `TargetClaimsExchangeId "${sel.targetClaimsExchangeId}" must match a ClaimsExchange in the next step (${next ? next.orderText : 'none'}).`, ref: sel.ref, target: t });
          if (sel.validationClaimsExchangeId && !st.claimsExchanges.some((x) => idKey(x.id) === idKey(sel.validationClaimsExchangeId)))
            s.add({ severity: 'error', code: 'step.selection.validation', message: `ValidationClaimsExchangeId "${sel.validationClaimsExchangeId}" must match a ClaimsExchange in the same step.`, ref: sel.ref, target: t });
        }
        break;
      }
      case 'InvokeSubJourney':
        if (st.journeyCandidates.length !== 1)
          s.add({ severity: 'error', code: 'step.candidate', message: `InvokeSubJourney step ${st.orderText} needs exactly one JourneyList Candidate.`, ref: st.ref, target: t });
        if (isSub) s.add({ severity: 'warning', code: 'step.nested', message: 'A sub journey should not call another sub journey.', ref: st.ref, target: t });
        break;
      case 'SendClaims':
        if (!st.cpimIssuerTechnicalProfileReferenceId && !j.defaultCpimIssuerTechnicalProfileReferenceId)
          s.add({ severity: 'warning', code: 'step.issuer', message: `SendClaims step ${st.orderText} has no CpimIssuerTechnicalProfileReferenceId, so no token is issued.`, ref: st.ref, target: t });
        if (i !== steps.length - 1 && !isSub)
          s.add({ severity: 'warning', code: 'step.sendClaims.position', message: `SendClaims at step ${st.orderText} ends the journey; later steps never run.`, ref: st.ref, target: t });
        break;
    }
    st.preconditions.forEach((p, pi) => {
      const pp = parsePrecondition(p);
      for (const m of pp.problems) s.add({ severity: 'error', code: 'precondition', message: `Step ${st.orderText}, precondition ${pi + 1}: ${m}`, ref: p.ref, target: t });
    });
  });
  void l;
}

export function countBySeverity(list: Diagnostic[]): Record<Severity, number> {
  const r: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const d of list) r[d.severity]++;
  return r;
}
