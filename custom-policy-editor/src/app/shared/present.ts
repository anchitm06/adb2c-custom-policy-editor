import { Availability } from '../core/analysis/journey-analyzer';
import { TP_KINDS, TpKind } from '../core/catalog/technical-profiles';

export const STEP_TYPE_INFO: Record<string, { label: string; icon: string; description: string }> = {
  CombinedSignInAndSignUp: { label: 'Sign-in / sign-up page', icon: 'selection', description: 'Shows the combined local sign-in and social provider selection page.' },
  ClaimsProviderSelection: { label: 'Provider selection', icon: 'selection', description: 'Lets the user choose an identity provider or action. The chosen exchange runs in the next step.' },
  ClaimsExchange: { label: 'Claims exchange', icon: 'transform', description: 'Runs a technical profile (page, directory, REST API, identity provider…).' },
  GetClaims: { label: 'Get claims from app', icon: 'getclaims', description: 'Reads claims the relying party sent through its InputClaims.' },
  InvokeSubJourney: { label: 'Sub journey', icon: 'subjourney', description: 'Runs a sub journey (Call returns here, Transfer does not).' },
  SendClaims: { label: 'Issue token', icon: 'send', description: 'Sends the claims to the relying party in a token. Must be the last step.' },
};

export function stepTypeInfo(type: string) {
  return STEP_TYPE_INFO[type] ?? { label: type || 'Unknown step', icon: 'warning', description: 'Unknown step type.' };
}

export function tpKindInfo(kind: TpKind | undefined) {
  return TP_KINDS[kind ?? 'unknown'];
}

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  definitely: 'Present',
  maybe: 'Maybe',
  absent: 'Not present',
};

export const AVAILABILITY_CLASS: Record<Availability, string> = {
  definitely: 'ok',
  maybe: 'maybe',
  absent: 'absent',
};

export const AVAILABILITY_GLYPH: Record<Availability, string> = {
  definitely: '●',
  maybe: '◐',
  absent: '○',
};

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function downloadText(name: string, text: string, type = 'application/xml'): void {
  const blob = new Blob([text], { type });
  downloadBlob(name, blob);
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
