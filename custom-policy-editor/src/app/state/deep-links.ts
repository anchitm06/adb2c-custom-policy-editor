import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { stepKey } from '../core/analysis/journey-analyzer';
import { idKey } from '../core/model/types';
import { EditorStore, Selection, View } from './editor.store';

/** Library views, as they appear in a link, with the selection kind of their items. */
const LIBRARY: Record<string, { view: View; kind: 'technicalProfile' | 'claim' | 'transformation' | 'contentDefinition' | 'localization' | 'displayControl' | 'predicate' }> = {
  technicalProfiles: { view: 'technicalProfiles', kind: 'technicalProfile' },
  claims: { view: 'claims', kind: 'claim' },
  transformations: { view: 'transformations', kind: 'transformation' },
  contentDefinitions: { view: 'contentDefinitions', kind: 'contentDefinition' },
  localization: { view: 'localization', kind: 'localization' },
  displayControls: { view: 'displayControls', kind: 'displayControl' },
  predicates: { view: 'predicates', kind: 'predicate' },
};

/**
 * Keeps the address bar in step with what is on screen, so any journey, step or library item can be
 * shared as a link, and opens such a link once a policy is loaded.
 *
 * #/journeys/<id>, #/journeys/<id>/step/<order>, #/library/<kind>/<id>, #/rp, #/files
 */
@Injectable({ providedIn: 'root' })
export class DeepLinks {
  private readonly store = inject(EditorStore);
  private readonly router = inject(Router);
  /** A link opened before any policy was loaded; applied as soon as one is. */
  private pending: string | null = null;
  private readonly ready = signal(false);
  /** True when the policy was opened from a shared link, so the first-run tour stays out of the way. */
  readonly openedFromLink = signal(false);

  constructor() {
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) this.fromUrl(e.urlAfterRedirects);
    });

    effect(() => {
      const hasWorkspace = this.store.loaded() && this.store.files().length > 0;
      untracked(() => {
        if (!hasWorkspace) {
          this.ready.set(false);
          return;
        }
        if (!this.ready()) {
          const link = this.pending;
          this.pending = null;
          if (link) {
            this.apply(link);
            this.openedFromLink.set(true);
          }
          this.ready.set(true);
        }
      });
    });

    effect(() => {
      if (!this.ready()) return;
      const url = this.toUrl();
      untracked(() => {
        const now = this.router.url.split('?')[0];
        if (now.startsWith('/help')) return;
        if (url !== now) void this.router.navigateByUrl(url, { replaceUrl: true });
      });
    });
  }

  /** The address that describes what is on screen. */
  toUrl(): string {
    const s = this.store;
    const enc = encodeURIComponent;
    const sel = s.selection();
    switch (s.view()) {
      case 'journeys': {
        const id = s.activeJourneyId();
        if (!id) return '/journeys';
        const step = sel?.kind === 'step' ? sel.stepKey.split('#')[1] : null;
        return `/journeys/${enc(id)}${step ? `/step/${enc(step)}` : ''}`;
      }
      case 'relyingParty':
        return '/rp';
      case 'files':
        return '/files';
      default: {
        const lib = LIBRARY[s.view()];
        if (!lib) return '/';
        return `/library/${s.view()}${sel && sel.kind === lib.kind && 'id' in sel ? `/${enc(sel.id)}` : ''}`;
      }
    }
  }

  private fromUrl(url: string): void {
    const path = url.split('?')[0];
    if (path.startsWith('/help') || path === '/') return;
    if (!(this.store.loaded() && this.store.files().length > 0)) {
      this.pending = path;
      return;
    }
    if (path !== this.toUrl()) this.apply(path);
  }

  private apply(path: string): void {
    const s = this.store;
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    s.mainMode.set('visual');
    if (parts[0] === 'journeys' && parts[1]) {
      const eff = s.eff();
      const id = parts[1];
      if (!eff || !(eff.userJourneys.has(idKey(id)) || eff.subJourneys.has(idKey(id)))) return;
      s.openJourney(id);
      if (parts[2] === 'step' && parts[3]) {
        const key = stepKey(id, parts[3]);
        s.select({ kind: 'step', journeyId: id, stepKey: key });
        s.focusStep.set(key);
      }
    } else if (parts[0] === 'journeys') {
      s.view.set('journeys');
    } else if (parts[0] === 'library' && parts[1] && LIBRARY[parts[1]]) {
      const lib = LIBRARY[parts[1]];
      s.view.set(lib.view);
      s.selection.set(parts[2] ? ({ kind: lib.kind, id: parts[2] } as Selection) : null);
    } else if (parts[0] === 'rp') {
      s.view.set('relyingParty');
      s.selection.set({ kind: 'relyingParty' });
    } else if (parts[0] === 'files') {
      s.view.set('files');
      s.selection.set(null);
    }
  }
}
