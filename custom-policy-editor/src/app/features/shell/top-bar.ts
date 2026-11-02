import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { Popover } from '../../shared/popover';
import { SelectValue } from '../../shared/select-value';
import { exportZip } from '../workspace/file-io';
import { buildAnalysisReport } from '../../core/analysis/report';
import { BUILD_INFO } from '../../../build-info';
import { TourService } from '../../shared/tour';

/** The top bar: where you are (policy and layers), undo and redo, problems, mode, and one menu. */
@Component({
  selector: 'app-top-bar',
  imports: [Icon, Popover, SelectValue],
  template: `
    <header class="bar">
      <div class="brand"><app-icon name="journey" [size]="18" /><span class="name">B2C policy editor</span></div>

      <label class="visually-hidden" for="tb-policy">Policy</label>
      <select id="tb-policy" class="policy" [appValue]="store.activeChain()?.leaf?.fileId ?? ''" (change)="store.activeLeafId.set($any($event.target).value); store.clearScenario()">
        @for (c of store.chains(); track c.leaf.fileId) {
          <option [value]="c.leaf.fileId">{{ c.leaf.policyId ?? c.leaf.fileName }}{{ c.leaf.relyingParty ? '' : ' (no relying party)' }}</option>
        }
      </select>

      <app-popover label="Files in this policy chain" [width]="320">
        <button popoverTrigger class="btn ghost" type="button" aria-haspopup="dialog">
          <app-icon name="layers" [size]="15" /> <span class="hide-sm">{{ layerCount() }} {{ layerCount() === 1 ? 'file' : 'files' }}</span>
        </button>
        <p class="muted small">A policy is built from files that extend each other. Changes go to the file marked below.</p>
        @for (d of store.activeChain()?.docs ?? []; track d.fileId) {
          <button class="layer-row" type="button" (click)="openFile(d.fileId)">
            <span class="grow truncate">{{ store.layerOf(d.fileId) }}: {{ d.fileName }}</span>
            @if (d.fileId === store.targetFile()?.fileId) {
              <span class="status ok small"><app-icon name="check" [size]="12" /> Edits go here</span>
            }
          </button>
        }
      </app-popover>

      <span class="spacer"></span>

      <button class="btn ghost icon" type="button" [disabled]="!store.canUndo()" [title]="'Undo ' + store.undoLabel() + ' (Ctrl+Z)'" aria-label="Undo" (click)="store.undo()"><app-icon name="undo" /></button>
      <button class="btn ghost icon" type="button" [disabled]="!store.canRedo()" [title]="'Redo ' + store.redoLabel() + ' (Ctrl+Shift+Z)'" aria-label="Redo" (click)="store.redo()"><app-icon name="redo" /></button>

      <button class="btn ghost counts" type="button" data-tour="problems" [attr.aria-label]="'Problems: ' + store.counts().error + ' errors, ' + store.counts().warning + ' warnings'" (click)="store.problemsOpen.set(!store.problemsOpen())">
        <span class="c error"><app-icon name="error" [size]="14" /> {{ store.counts().error }}</span>
        <span class="c warning"><app-icon name="warning" [size]="14" /> {{ store.counts().warning }}</span>
      </button>

      <div class="seg" role="group" aria-label="Editor mode">
        <button type="button" [attr.aria-pressed]="store.mainMode() === 'visual'" (click)="store.mainMode.set('visual')">Visual</button>
        <button type="button" [attr.aria-pressed]="store.mainMode() === 'xml'" (click)="store.mainMode.set('xml')">XML</button>
      </div>

      <a class="btn ghost" href="#/help" title="How to use this site, how the analysis works, privacy"><app-icon name="info" [size]="15" /> <span class="hide-sm">Help</span></a>
      <button class="btn ghost icon" type="button" title="Search everything (Ctrl+K)" aria-label="Search everything" (click)="store.paletteOpen.set(true)"><app-icon name="search" /></button>

      <app-popover align="end" label="Menu" [width]="260" [closeOnSelect]="true">
        <button popoverTrigger class="btn" type="button" aria-haspopup="menu">Menu <app-icon name="chevronDown" [size]="14" /></button>
        <button class="menu-item" type="button" role="menuitem" (click)="exportAll()"><app-icon name="download" [size]="15" /> Export files as zip</button>
        <button class="menu-item" type="button" role="menuitem" (click)="openTenant()"><app-icon name="files" [size]="15" /> Set tenant</button>
        <button class="menu-item" type="button" role="menuitem" title="Counts and timings only, no names or identifiers" (click)="copyReport()"><app-icon name="copy" [size]="15" /> Copy analysis report</button>
        <button class="menu-item" type="button" role="menuitem" (click)="tour.start()"><app-icon name="play" [size]="15" /> Replay the tour</button>
        <div class="menu-sep" role="separator"></div>
        <div class="menu-group" role="group" aria-label="Theme">
          <span class="small muted">Theme</span>
          <div class="seg" role="group" aria-label="Theme">
            <button type="button" [attr.aria-pressed]="store.theme() === 'system'" (click)="setTheme('system'); $event.stopPropagation()">System</button>
            <button type="button" [attr.aria-pressed]="store.theme() === 'light'" (click)="setTheme('light'); $event.stopPropagation()">Light</button>
            <button type="button" [attr.aria-pressed]="store.theme() === 'dark'" (click)="setTheme('dark'); $event.stopPropagation()">Dark</button>
          </div>
        </div>
        <div class="menu-sep" role="separator"></div>
        <button class="menu-item" type="button" role="menuitem" (click)="store.closeWorkspace()"><app-icon name="close" [size]="15" /> Close workspace</button>
      </app-popover>
    </header>
  `,
  styles: `
    :host { display: block; flex: none; }
    .bar { display: flex; align-items: center; gap: var(--space-xs); min-height: 48px; padding: var(--space-xs) var(--space-md); background: var(--surface); border-bottom: var(--rule-hair) solid var(--border); min-width: 0; }
    .brand { display: flex; align-items: center; gap: var(--space-xs); font-family: var(--font-display); font-weight: 600; letter-spacing: var(--tracking-display); white-space: nowrap; color: var(--accent); }
    .brand .name { color: var(--text); font-size: var(--text-md); }
    .policy { max-width: 240px; font-weight: 500; }
    .counts { gap: var(--space-sm); }
    .counts .c { display: inline-flex; gap: var(--space-2xs); align-items: center; }
    .counts .error { color: var(--error); }
    .counts .warning { color: var(--warning); }
    .layer-row { display: flex; align-items: center; gap: var(--space-xs); width: 100%; min-height: var(--control); padding: var(--space-2xs) var(--space-xs); border: 0; border-radius: var(--radius-input); background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
    @media (hover: hover) { .layer-row:hover { background: var(--surface-3); } }
    .layer-row:active { background: var(--border); }
    .menu-item { display: flex; align-items: center; gap: var(--space-xs); width: 100%; min-height: var(--control); padding: var(--space-2xs) var(--space-xs); border: 0; border-radius: var(--radius-input); background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
    @media (hover: hover) { .menu-item:hover { background: var(--surface-3); } }
    .menu-item:active { background: var(--border); }
    .menu-sep { height: 1px; background: var(--border); margin: var(--space-2xs) 0; }
    .menu-group { display: flex; flex-direction: column; gap: var(--space-xs); padding: var(--space-2xs) var(--space-xs); }
    @media (max-width: 800px) {
      .hide-sm, .brand .name { display: none; }
      .bar { gap: var(--space-2xs); padding-inline: var(--space-xs); flex-wrap: wrap; }
      .policy { max-width: 160px; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBar {
  protected readonly store = inject(EditorStore);
  protected readonly tour = inject(TourService);

  /** Copy a summary that is safe to share: counts and timings, never names or values. */
  protected async copyReport(): Promise<void> {
    const eff = this.store.eff();
    if (!eff) return;
    const text = buildAnalysisReport({ eff, diagnostics: this.store.diagnostics(), fileCount: this.store.files().length, appVersion: BUILD_INFO.commit });
    let ok: boolean;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
    }
    this.store.toast(ok ? { kind: 'info', title: 'Analysis report copied', lines: ['It lists counts and timings only: no file names, identifiers, claim names or values.'] } : { kind: 'error', title: 'Could not copy the report', lines: ['Your browser blocked access to the clipboard.'] });
  }

  protected layerCount(): number {
    return this.store.activeChain()?.docs.length ?? 0;
  }

  protected openFile(fileId: string): void {
    this.store.xmlFileId.set(fileId);
    this.store.mainMode.set('xml');
  }

  protected exportAll(): void {
    void exportZip(this.store.workspaceName(), this.store.files());
  }

  protected openTenant(): void {
    this.store.mainMode.set('visual');
    this.store.view.set('files');
    this.store.selection.set(null);
  }

  protected setTheme(t: 'system' | 'light' | 'dark'): void {
    this.store.theme.set(t);
  }
}
