import { EffectivePolicy } from '../resolve/resolve';
import { Diagnostic } from '../validate/validate';
import { analyzeJourney } from './journey-analyzer';

export interface ReportInput {
  eff: EffectivePolicy;
  diagnostics: Diagnostic[];
  fileCount: number;
  appVersion: string;
}

/**
 * A plain-text summary of how the analysis behaved on a policy, safe to share: counts, timings and
 * alert codes only. It never contains file names, identifiers, claim names or values.
 */
export function buildAnalysisReport({ eff, diagnostics, fileCount, appVersion }: ReportInput): string {
  const lines: string[] = [];
  lines.push('B2C policy editor analysis report');
  lines.push(`App version: ${appVersion}`);
  lines.push(`Files: ${fileCount}`);
  lines.push(
    `Elements: ${eff.userJourneys.size} user journeys, ${eff.subJourneys.size} sub journeys, ${eff.technicalProfiles.size} technical profiles, ${eff.claimTypes.size} claims, ${eff.claimsTransformations.size} claims transformations`,
  );
  lines.push('');
  lines.push('Journeys (steps, choices, merged states at the busiest step, milliseconds, approximate):');

  const ids = [...eff.userJourneys.values(), ...eff.subJourneys.values()].map((j) => j.id);
  const rows: { steps: number; decisions: number; states: number; ms: number; approx: boolean; named: string }[] = [];
  for (const id of ids) {
    const j = eff.userJourneys.get(id.toLowerCase())?.value ?? eff.subJourneys.get(id.toLowerCase())?.value;
    const t0 = performance.now();
    const a = analyzeJourney(eff, id);
    const ms = performance.now() - t0;
    rows.push({ steps: j?.steps.length ?? 0, decisions: a.decisions.length, states: a.stateCount, ms, approx: a.approximate, named: a.namedPaths ? String(a.namedPaths.length) : 'many' });
  }
  rows.sort((x, y) => y.ms - x.ms);
  rows.forEach((r, i) => lines.push(`  ${i + 1}. ${r.steps} steps, ${r.decisions} choices, ${r.states} states, ${Math.round(r.ms)} ms, approximate: ${r.approx ? 'yes' : 'no'}, complete paths: ${r.named}`));
  if (!rows.length) lines.push('  none');
  const total = rows.reduce((n, r) => n + r.ms, 0);
  lines.push(`Total analysis time for all journeys: ${Math.round(total)} ms`);
  lines.push('');

  const bySeverity = { error: 0, warning: 0, info: 0 };
  const byCode = new Map<string, number>();
  for (const d of diagnostics) {
    bySeverity[d.severity]++;
    byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
  }
  lines.push(`Alerts: ${bySeverity.error} errors, ${bySeverity.warning} warnings, ${bySeverity.info} information`);
  for (const [code, n] of [...byCode].sort((a, b) => b[1] - a[1])) lines.push(`  ${code}: ${n}`);
  return lines.join('\n');
}
