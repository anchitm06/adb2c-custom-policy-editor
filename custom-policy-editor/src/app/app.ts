import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { EditorStore, View } from './state/editor.store';
import { Icon } from './shared/icon';
import { Explorer } from './features/explorer/explorer';
import { JourneyCanvas } from './features/journey/journey-canvas';
import { StepInspector } from './features/inspector/step-inspector';
import { JourneyInspector } from './features/inspector/journey-inspector';
import { ProblemsPanel } from './features/problems/problems-panel';
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
import { TopBar } from './features/shell/top-bar';
import { StatusBar } from './features/shell/status-bar';
import { CommandPalette } from './features/shell/command-palette';

type Destination = 'journeys' | 'library' | 'relyingParty' | 'files';

const DESTINATIONS: { id: Destination; icon: string; label: string }[] = [
  { id: 'journeys', icon: 'journey', label: 'Journeys' },
  { id: 'library', icon: 'tp', label: 'Library' },
  { id: 'relyingParty', icon: 'app', label: 'Relying party' },
  { id: 'files', icon: 'files', label: 'Files' },
];

/** The views inside the Library destination. */
const LIBRARY_VIEWS: View[] = ['technicalProfiles', 'claims', 'transformations', 'contentDefinitions', 'localization', 'displayControls', 'predicates'];

@Component({
  selector: 'app-root',
  imports: [
    Icon,
    TopBar,
    StatusBar,
    CommandPalette,
    Explorer,
    JourneyCanvas,
    StepInspector,
    JourneyInspector,
    ProblemsPanel,
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
  protected readonly destinations = DESTINATIONS;
  /** On narrow screens the list is a drawer. */
  protected readonly listOpen = signal(false);

  protected readonly sel = this.store.selection;
  /** The detail panel opens only when a step or the journey itself is selected. */
  protected readonly showInspector = computed(() => {
    const s = this.sel();
    return this.store.view() === 'journeys' && this.store.mainMode() === 'visual' && !!this.store.activeJourney() && (s?.kind === 'step' || s?.kind === 'journey');
  });
  protected readonly inspectorJourney = computed(() => {
    const s = this.sel();
    if (s?.kind === 'journey') return s.id;
    return this.store.activeJourneyId();
  });
  protected readonly destination = computed<Destination>(() => {
    const v = this.store.view();
    return v === 'journeys' ? 'journeys' : v === 'relyingParty' ? 'relyingParty' : v === 'files' ? 'files' : 'library';
  });

  constructor() {
    void this.store.restore();
  }

  protected go(d: Destination): void {
    const same = this.destination() === d;
    if (same && !this.listOpen()) {
      this.listOpen.set(true);
      return;
    }
    this.store.mainMode.set('visual');
    if (d === 'journeys') {
      this.store.view.set('journeys');
      this.store.selection.set(null);
    } else if (d === 'library') {
      this.store.view.set(LIBRARY_VIEWS.includes(this.store.view()) ? this.store.view() : 'technicalProfiles');
      this.store.selection.set(null);
    } else if (d === 'relyingParty') {
      this.store.view.set('relyingParty');
      this.store.selection.set({ kind: 'relyingParty' });
    } else {
      this.store.view.set('files');
      this.store.selection.set(null);
    }
    this.listOpen.set(!same);
  }

  protected closeDetails(): void {
    this.store.selection.set(null);
  }

  protected selected<K extends string>(kind: K): string | null {
    const s = this.sel();
    return s && s.kind === kind && 'id' in s ? s.id : null;
  }

  protected countFor(d: Destination): number {
    const kinds: Record<Destination, string[]> = {
      journeys: ['step', 'journey'],
      library: ['technicalProfile', 'claim', 'transformation', 'contentDefinition', 'displayControl', 'predicate'],
      relyingParty: ['relyingParty'],
      files: ['file'],
    };
    return this.store.diagnostics().filter((x) => x.severity === 'error' && x.target && kinds[d].includes(x.target.kind)).length;
  }

  protected openProblems(): void {
    this.store.problemsOpen.set(true);
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
