import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, Injectable, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { EditorStore } from '../state/editor.store';
import { DeepLinks } from '../state/deep-links';
import { readPref, writePref } from '../state/persistence';

interface TourStep {
  /** CSS selector of the thing to point at; the first match is used. */
  target: string;
  title: string;
  text: string;
}

const STEPS: TourStep[] = [
  {
    target: '[data-tour="canvas"]',
    title: 'Each card is one step',
    text: 'B2C runs the steps from top to bottom. The badge says whether a step always runs, runs in some cases or never runs. Select a card to read what it does and which claims it adds.',
  },
  {
    target: '.step .pre',
    title: 'Conditions in plain words',
    text: 'This line says when a step is skipped. Select it to edit the precondition and to see every combination of the claims it tests.',
  },
  {
    target: 'app-scenario-picker',
    title: 'Trace one case',
    text: 'Fix a choice, such as the button the user picks, and every step shows exactly what happens in that case.',
  },
  {
    target: '[data-tour="problems"]',
    title: 'Every change is checked',
    text: 'After each edit the whole policy is checked again. Problems show up here, each with a link to the Microsoft documentation behind it.',
  },
];

const FLAG = 'tourDone';

/** The first-run tour: four short notes pointing at the parts of the screen that matter. */
@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly store = inject(EditorStore);
  private readonly links = inject(DeepLinks);
  readonly active = signal(false);
  readonly index = signal(0);
  readonly steps = STEPS;

  /** Start the tour once for a new visitor, when a journey is on screen. */
  maybeStart(): void {
    if (readPref(FLAG) === '1' || this.active()) return;
    setTimeout(() => {
      const onJourneys = this.store.view() === 'journeys' && this.store.mainMode() === 'visual' && this.store.lens() === 'flow';
      if (readPref(FLAG) !== '1' && this.store.files().length && onJourneys && !this.links.openedFromLink() && !location.hash.startsWith('#/help')) this.start();
    }, 900);
  }

  start(): void {
    this.store.mainMode.set('visual');
    this.store.view.set('journeys');
    this.store.lens.set('flow');
    this.store.selection.set(null);
    this.store.problemsOpen.set(false);
    this.index.set(0);
    this.active.set(true);
  }

  /** The next step whose target is on screen, so a journey without preconditions skips that note. */
  private find(from: number, dir: 1 | -1): number {
    for (let i = from; i >= 0 && i < STEPS.length; i += dir) if (document.querySelector(STEPS[i].target)) return i;
    return -1;
  }

  next(): void {
    const i = this.find(this.index() + 1, 1);
    if (i < 0) this.finish();
    else this.index.set(i);
  }

  back(): void {
    const i = this.find(this.index() - 1, -1);
    if (i >= 0) this.index.set(i);
  }

  /** True while there is a later step to show. */
  hasNext(): boolean {
    return this.find(this.index() + 1, 1) >= 0;
  }

  finish(): void {
    this.active.set(false);
    writePref(FLAG, '1');
  }
}

@Component({
  selector: 'app-tour',
  template: `
    @if (tour.active() && step(); as s) {
      @if (rect(); as r) {
        <div class="ring" aria-hidden="true" [style.top.px]="r.top - 4" [style.left.px]="r.left - 4" [style.width.px]="r.width + 8" [style.height.px]="r.height + 8"></div>
      }
      <div class="note card" role="dialog" aria-labelledby="tour-title" aria-describedby="tour-text" [style.top.px]="pos().top" [style.left.px]="pos().left" (keydown.escape)="tour.finish()">
        <p class="count muted small">Tour, step {{ tour.index() + 1 }}</p>
        <h3 id="tour-title">{{ s.title }}</h3>
        <p id="tour-text">{{ s.text }}</p>
        <div class="row">
          <button class="btn ghost sm" type="button" (click)="tour.finish()">Skip tour</button>
          <span class="spacer"></span>
          @if (tour.index() > 0) {
            <button class="btn sm" type="button" (click)="tour.back()">Back</button>
          }
          <button #nextBtn class="btn sm primary" type="button" (click)="tour.next()">{{ tour.hasNext() ? 'Next' : 'Done' }}</button>
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: contents; }
    .ring { position: fixed; z-index: var(--z-modal); pointer-events: none; border: 2px solid var(--color-focus); border-radius: var(--radius-card); box-shadow: 0 0 0 9999px color-mix(in oklab, var(--color-ink) 28%, transparent); }
    .note { position: fixed; z-index: calc(var(--z-modal) + 1); width: min(340px, calc(100% - var(--space-lg))); padding: var(--space-md); box-shadow: var(--shadow-pop), var(--ring); }
    .note h3 { margin-bottom: var(--space-xs); }
    .count { margin: 0 0 var(--space-3xs); }
    .row { margin-top: var(--space-sm); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'tick.update(v => v + 1)', '(window:scroll)': 'tick.update(v => v + 1)' },
})
export class Tour {
  protected readonly tour = inject(TourService);
  private readonly router = inject(Router);
  protected readonly tick = signal(0);
  private readonly nextBtn = viewChild<ElementRef<HTMLButtonElement>>('nextBtn');

  protected readonly step = computed(() => (this.tour.active() ? this.tour.steps[this.tour.index()] : null));

  protected readonly rect = computed(() => {
    this.tick();
    const s = this.step();
    if (!s) return null;
    const el = document.querySelector(s.target);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width === 0 && r.height === 0 ? null : { top: r.top, left: r.left, width: r.width, height: r.height };
  });

  protected readonly pos = computed(() => {
    const r = this.rect();
    const w = Math.min(340, window.innerWidth - 24);
    const h = 190;
    if (!r) return { top: Math.max(12, window.innerHeight / 2 - h / 2), left: Math.max(12, window.innerWidth / 2 - w / 2) };
    const below = r.top + r.height + 12;
    const top = below + h < window.innerHeight ? below : Math.max(12, Math.min(r.top - h - 12, window.innerHeight - h - 12));
    // A very tall target (the flow) leaves no room above or below: sit beside it.
    const left = Math.max(12, Math.min(r.left + 16, window.innerWidth - w - 12));
    return { top: r.height > window.innerHeight * 0.6 ? Math.max(12, window.innerHeight - h - 24) : top, left };
  });

  constructor() {
    // Re-measure after the screen settles and move focus to the primary button for keyboard users.
    effect(() => {
      if (!this.tour.active()) return;
      this.tour.index();
      setTimeout(() => {
        this.tick.update((v) => v + 1);
        this.nextBtn()?.nativeElement.focus();
      }, 60);
    });
    // The tour belongs to the editor, not to Help.
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd && e.urlAfterRedirects.startsWith('/help') && this.tour.active()) this.tour.finish();
    });
  }
}
