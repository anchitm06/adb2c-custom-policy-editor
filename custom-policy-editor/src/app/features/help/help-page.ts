import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BUILD_INFO } from '../../../build-info';
import { EditorStore } from '../../state/editor.store';
import { Icon } from '../../shared/icon';
import { TourService } from '../../shared/tour';
import { HELP_SECTIONS } from './help-content';
import { Rich } from './rich';

/** The Help page: how to use the site, how the analysis works, privacy and limits. */
@Component({
  selector: 'app-help-page',
  imports: [Icon, RouterLink, Rich],
  template: `
    <div class="page">
      <header class="top">
        <button class="btn" type="button" (click)="back()"><app-icon name="arrowRight" [size]="14" class="flip" /> {{ hasWorkspace() ? 'Back to the editor' : 'Back' }}</button>
        <h1>Help</h1>
        <span class="spacer"></span>
        <button class="btn" type="button" [disabled]="!hasWorkspace()" [title]="hasWorkspace() ? '' : 'Open a policy first'" (click)="replayTour()">Replay the tour</button>
      </header>
      <div class="cols">
        <nav class="toc" aria-label="Help sections">
          @for (s of sections; track s.id) {
            <a [routerLink]="['/help', s.id]" [class.on]="current() === s.id" [attr.aria-current]="current() === s.id ? 'true' : null">{{ s.title }}</a>
          }
        </nav>
        <article class="content">
          @for (s of sections; track s.id) {
            <section [id]="'help-' + s.id" [attr.aria-labelledby]="'h-' + s.id">
              <h2 [id]="'h-' + s.id">{{ s.title }}</h2>
              <p class="summary">{{ s.summary }}</p>
              @for (b of s.blocks; track $index) {
                @switch (b.t) {
                  @case ('p') {
                    <p><app-rich [text]="b.text" /></p>
                  }
                  @case ('steps') {
                    <ol>
                      @for (i of b.items; track $index) {
                        <li><app-rich [text]="i" /></li>
                      }
                    </ol>
                  }
                  @case ('list') {
                    <ul>
                      @for (i of b.items; track $index) {
                        <li><app-rich [text]="i" /></li>
                      }
                    </ul>
                  }
                  @case ('note') {
                    <aside class="note">
                      <app-icon name="info" [size]="16" />
                      <div>
                        <strong>{{ b.title }}</strong>
                        <p><app-rich [text]="b.text" /></p>
                      </div>
                    </aside>
                  }
                  @case ('terms') {
                    <dl>
                      @for (i of b.items; track $index) {
                        <dt>{{ i.term }}</dt>
                        <dd><app-rich [text]="i.def" /></dd>
                      }
                    </dl>
                  }
                }
              }
              @if (s.id === 'about') {
                <p class="muted">Version {{ build.commit }}{{ build.date ? ', built ' + build.date : '' }}.</p>
              }
            </section>
          }
        </article>
      </div>
    </div>
  `,
  styleUrl: './help-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpPage {
  private readonly store = inject(EditorStore);
  private readonly router = inject(Router);
  private readonly tour = inject(TourService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Bound from the route, /help/:section. */
  readonly section = input<string | undefined>(undefined);
  protected readonly sections = HELP_SECTIONS;
  protected readonly build = BUILD_INFO;
  protected readonly hasWorkspace = computed(() => this.store.files().length > 0);
  protected readonly current = signal(HELP_SECTIONS[0].id);

  constructor() {
    effect(() => {
      const id = this.section() ?? HELP_SECTIONS[0].id;
      this.current.set(id);
      queueMicrotask(() => {
        const el = this.host.nativeElement.querySelector<HTMLElement>(`#help-${CSS.escape(id)}`);
        if (el) el.scrollIntoView({ block: 'start' });
        else this.host.nativeElement.querySelector('.content')?.scrollTo({ top: 0 });
        const h = this.host.nativeElement.querySelector<HTMLElement>(`#h-${CSS.escape(id)}`);
        h?.setAttribute('tabindex', '-1');
        h?.focus({ preventScroll: true });
      });
    });
  }

  protected back(): void {
    void this.router.navigateByUrl('/');
  }

  protected replayTour(): void {
    void this.router.navigateByUrl('/').then(() => this.tour.start());
  }
}
