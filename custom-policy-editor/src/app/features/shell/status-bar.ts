import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';

/** One quiet line at the bottom: problems, the state of the analysis, and where the work is saved. */
@Component({
  selector: 'app-status-bar',
  imports: [Icon],
  template: `
    <footer class="bar">
      <button class="item" type="button" [attr.aria-expanded]="store.problemsOpen()" (click)="store.problemsOpen.set(!store.problemsOpen())">
        @if (store.counts().error) {
          <span class="status error"><app-icon name="error" [size]="14" /> {{ store.counts().error }} {{ store.counts().error === 1 ? 'error' : 'errors' }}</span>
        }
        @if (store.counts().warning) {
          <span class="status warning"><app-icon name="warning" [size]="14" /> {{ store.counts().warning }} {{ store.counts().warning === 1 ? 'warning' : 'warnings' }}</span>
        }
        @if (!store.counts().error && !store.counts().warning) {
          <span class="status ok"><app-icon name="check" [size]="14" /> No problems found</span>
        }
      </button>
      @if (analysisNote(); as n) {
        <span class="item note" [title]="n.title"><app-icon name="info" [size]="14" /> {{ n.text }}</span>
      }
      <span class="spacer"></span>
      <span class="item muted">Saved in this browser</span>
    </footer>
  `,
  styles: `
    :host { display: block; flex: none; }
    .bar { display: flex; align-items: center; gap: var(--space-md); min-height: 32px; padding: 0 var(--space-md); background: var(--surface); border-top: var(--rule-hair) solid var(--border); font-size: var(--text-xs); min-width: 0; }
    .item { display: inline-flex; align-items: center; gap: var(--space-sm); min-height: 28px; border: 0; background: none; padding: 0; font: inherit; color: var(--text-2); white-space: nowrap; }
    button.item { cursor: pointer; border-radius: var(--radius-part); }
    @media (hover: hover) { button.item:hover { color: var(--text); } }
    button.item:active { color: var(--text); }
    .note { overflow: hidden; text-overflow: ellipsis; gap: var(--space-xs); }
    @media (max-width: 720px) { .note { display: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBar {
  protected readonly store = inject(EditorStore);
  protected readonly analysisNote = computed(() => {
    const a = this.store.baseAnalysis();
    if (!a) return null;
    if (a.approximate) return { text: 'Analysis merges some branches', title: 'This journey has many independent branches. Some were merged to keep the analysis fast, so a claim can read "maybe" where it is certain. Choose a scenario for exact results.' };
    return { text: `Analysed in ${Math.max(1, Math.round(a.elapsedMs))} ms`, title: `${a.stateCount} states walked` };
  });
}
