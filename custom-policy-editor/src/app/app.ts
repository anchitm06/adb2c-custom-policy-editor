import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EditorStore, View } from './state/editor.store';
import { Icon } from './shared/icon';
import { Explorer } from './features/explorer/explorer';
import { JourneyCanvas } from './features/journey/journey-canvas';
import { StepInspector } from './features/inspector/step-inspector';
import { JourneyInspector } from './features/inspector/journey-inspector';
import { ProblemsPanel } from './features/problems/problems-panel';
import { ClaimsBag } from './features/claims-bag/claims-bag';
import { ClaimsTimeline } from './features/claims-bag/claims-timeline';
import { TechnicalProfileEditor } from './features/technical-profiles/technical-profile-editor';
import { ClaimEditor } from './features/claims/claim-editor';
import { TransformationEditor } from './features/transformations/transformation-editor';
import { ContentDefinitionEditor } from './features/building-blocks/content-definition-editor';
import { LocalizationEditor } from './features/building-blocks/localization-editor';
import { DisplayControlEditor } from './features/building-blocks/display-control-editor';
import { PredicateEditor } from './features/building-blocks/predicate-editor';
import { RelyingPartyEditor } from './features/relying-party/relying-party-editor';
import { FilesView } from './features/workspace/files-view';
import { Welcome } from './features/workspace/welcome';
import { XmlView } from './features/xml-editor/xml-view';
import { exportZip } from './features/workspace/file-io';
import { SelectValue } from './shared/select-value';

const ACTIVITIES: { view: View; icon: string; label: string }[] = [
  { view: 'journeys', icon: 'journey', label: 'User journeys' },
  { view: 'technicalProfiles', icon: 'tp', label: 'Technical profiles' },
  { view: 'claims', icon: 'claim', label: 'Claims' },
  { view: 'transformations', icon: 'transform', label: 'Claims transformations' },
  { view: 'contentDefinitions', icon: 'page', label: 'Content definitions' },
  { view: 'localization', icon: 'globe', label: 'Localization' },
  { view: 'displayControls', icon: 'control', label: 'Display controls' },
  { view: 'predicates', icon: 'rule', label: 'Predicates' },
  { view: 'relyingParty', icon: 'app', label: 'Relying party' },
  { view: 'files', icon: 'files', label: 'Files' },
];

@Component({
  selector: 'app-root',
  imports: [SelectValue, 
    Icon,
    Explorer,
    JourneyCanvas,
    StepInspector,
    JourneyInspector,
    ProblemsPanel,
    ClaimsBag,
    ClaimsTimeline,
    TechnicalProfileEditor,
    ClaimEditor,
    TransformationEditor,
    ContentDefinitionEditor,
    LocalizationEditor,
    DisplayControlEditor,
    PredicateEditor,
    RelyingPartyEditor,
    FilesView,
    Welcome,
    XmlView,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class App {
  protected readonly store = inject(EditorStore);
  protected readonly activities = ACTIVITIES;

  protected readonly sel = this.store.selection;
  protected readonly showInspector = computed(() => this.store.view() === 'journeys' && this.store.mainMode() === 'visual' && !!this.store.activeJourney());
  protected readonly inspectorJourney = computed(() => {
    const s = this.sel();
    if (s?.kind === 'journey') return s.id;
    return this.store.activeJourneyId();
  });

  constructor() {
    void this.store.restore();
  }

  protected setView(v: View): void {
    this.store.view.set(v);
    this.store.mainMode.set('visual');
    if (v === 'relyingParty') this.store.selection.set({ kind: 'relyingParty' });
    else if (v === 'files') this.store.selection.set(null);
    else if (v === 'journeys') {
      const j = this.store.activeJourneyId();
      if (j && this.sel()?.kind !== 'step') this.store.selection.set({ kind: 'journey', id: j });
    }
  }

  protected selected<K extends string>(kind: K): string | null {
    const s = this.sel();
    return s && s.kind === kind && 'id' in s ? s.id : null;
  }

  protected countFor(v: View): number {
    const d = this.store.diagnostics();
    const kinds: Partial<Record<View, string[]>> = {
      journeys: ['step', 'journey'],
      technicalProfiles: ['technicalProfile'],
      claims: ['claim'],
      transformations: ['transformation'],
      contentDefinitions: ['contentDefinition'],
      relyingParty: ['relyingParty'],
      files: ['file'],
    };
    const k = kinds[v];
    if (!k) return 0;
    return d.filter((x) => x.severity === 'error' && x.target && k.includes(x.target.kind)).length;
  }

  protected exportAll(): void {
    void exportZip(this.store.workspaceName(), this.store.files());
  }

  protected toggleTheme(): void {
    const t = this.store.theme();
    const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    this.store.theme.set(dark ? 'light' : 'dark');
  }

  protected openProblems(): void {
    this.store.bottomOpen.set(true);
    this.store.bottomTab.set('problems');
  }

  protected onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || !!t.closest('.cm-editor'));
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || typing) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      this.store.undo();
      e.preventDefault();
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      this.store.redo();
      e.preventDefault();
    }
  }
}
