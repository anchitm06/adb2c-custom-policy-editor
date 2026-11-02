import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { listSamples, loadSample, readPolicyFiles, SamplePack } from './file-io';

@Component({
  selector: 'app-welcome',
  imports: [Icon],
  template: `
    <div class="wrap" [class.drag]="dragging()" (dragover)="$event.preventDefault(); dragging.set(true)" (dragleave)="dragging.set(false)" (drop)="drop($event)">
      <div class="hero">
        <div class="logo"><app-icon name="journey" [size]="30" /></div>
        <h1>Azure AD B2C custom policy editor</h1>
        <p class="lead">See every user journey as a flow. Know exactly when each step runs, which claims are in the claims bag at every step, and what each change does, before you upload.</p>
      </div>
      <div class="actions">
        <div class="card drop">
          <app-icon name="upload" [size]="22" />
          <h3>Open your policy files</h3>
          <p class="muted small">Select or drop all files of a policy set (Base, Localization, Extensions and relying party files) or a .zip.</p>
          <label class="btn primary">
            <input type="file" multiple accept=".xml,.zip,application/xml,text/xml" (change)="pick($event)" hidden />
            Choose files…
          </label>
        </div>
        <div class="card samples">
          <h3>Start from a Microsoft starter pack</h3>
          @for (p of packs(); track p.id) {
            <button class="list-item sample" [disabled]="busy()" (click)="sample(p.id)">
              <app-icon name="files" [size]="16" />
              <div class="grow"><div>{{ p.name }}</div><div class="muted small">{{ p.description }}</div></div>
              <app-icon name="chevronRight" [size]="14" />
            </button>
          }
          <p class="muted tiny">{{ attribution() }}</p>
        </div>
      </div>
      <div class="features">
        <div><app-icon name="skip" /><strong>Preconditions in plain words</strong><span>“Skipped if objectId exists”, “Runs only when MfaPreference = Phone”, plus a check of every case.</span></div>
        <div><app-icon name="bag" /><strong>Claims bag at every step</strong><span>Present, maybe, or absent and on which paths through the journey.</span></div>
        <div><app-icon name="check" /><strong>Validated as you edit</strong><span>References, ordering, selections and data flow are re-checked after every change.</span></div>
        <div><app-icon name="shield" /><strong>Stays in your browser</strong><span>Nothing is uploaded. Work is saved locally in this browser only.</span></div>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; overflow: auto; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 48px 24px; min-height: 100%; }
    .wrap.drag { outline: 3px dashed var(--accent); outline-offset: -12px; }
    .hero { text-align: center; margin-bottom: 32px; }
    .logo { width: 56px; height: 56px; border-radius: 14px; background: var(--accent); color: var(--accent-text); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px; }
    h1 { font-size: var(--text-2xl); margin-bottom: 8px; }
    .lead { font-size: var(--text-md); color: var(--text-2); max-width: 640px; margin: 0 auto; }
    .actions { display: grid; grid-template-columns: 1fr 1.3fr; gap: 16px; }
    .card { padding: 18px; }
    .drop { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
    .sample { width: 100%; border: 1px solid var(--border); background: var(--surface); margin-top: 6px; text-align: left; font: inherit; }
    .sample:disabled { opacity: 0.6; }
    .tiny { font-size: var(--text-xs); margin-top: 10px; }
    .features { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 28px; }
    .features div { display: flex; flex-direction: column; gap: 4px; color: var(--text-2); font-size: var(--text-sm); }
    .features strong { color: var(--text); font-size: var(--text-sm); }
    .features app-icon { color: var(--accent); }
    @media (max-width: 760px) { .actions, .features { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Welcome {
  private readonly store = inject(EditorStore);
  protected readonly packs = signal<SamplePack[]>([]);
  protected readonly attribution = signal('');
  protected readonly busy = signal(false);
  protected readonly dragging = signal(false);

  constructor() {
    listSamples()
      .then((s) => {
        this.packs.set(s.packs);
        this.attribution.set(s.attribution);
      })
      .catch(() => this.attribution.set('Samples could not be loaded.'));
  }

  protected async sample(id: string): Promise<void> {
    this.busy.set(true);
    try {
      const s = await loadSample(id);
      this.store.openFiles(s.files, s.name);
    } catch (e) {
      this.store.toast({ kind: 'error', title: 'Could not load the sample', lines: [String(e)] });
    } finally {
      this.busy.set(false);
    }
  }

  protected async pick(e: Event): Promise<void> {
    const files = (e.target as HTMLInputElement).files;
    if (files?.length) await this.open(files);
  }

  protected async drop(e: DragEvent): Promise<void> {
    e.preventDefault();
    this.dragging.set(false);
    if (e.dataTransfer?.files.length) await this.open(e.dataTransfer.files);
  }

  private async open(list: FileList): Promise<void> {
    const files = await readPolicyFiles(list);
    if (!files.length) {
      this.store.toast({ kind: 'error', title: 'No policy files found', lines: ['Choose .xml policy files or a .zip that contains them.'] });
      return;
    }
    this.store.openFiles(files, files.length === 1 ? files[0].name : 'My policies');
  }
}
