import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { helpHref, lookupAlert } from '../core/validate/diagnostic-catalog';
import { QuickFix } from '../core/validate/validate';
import { EditorStore } from '../state/editor.store';
import { Icon } from './icon';

/**
 * One alert (error, warning or information) with the reason behind it and links to the
 * Microsoft Learn pages that define the rule. Alerts from this tool's own analysis also link to
 * the Help page that explains how that reasoning works.
 */
@Component({
  selector: 'app-alert-item',
  imports: [Icon],
  template: `
    <div class="alert {{ severity() }}" role="group" [attr.aria-label]="entry().title">
      <app-icon [name]="severity()" [size]="15" class="ico" />
      <div class="main">
        <span class="msg">{{ message() }}</span>
        <span class="links">
          <button type="button" class="link" [attr.aria-expanded]="open()" (click)="toggle($event)">{{ open() ? 'Hide details' : 'Why?' }}</button>
          <a class="link" [href]="entry().docs[0].url" target="_blank" rel="noopener noreferrer" (click)="$event.stopPropagation()" [attr.aria-label]="'Learn more: ' + entry().docs[0].label + ' (opens Microsoft Learn in a new tab)'">
            Learn more <app-icon name="external" [size]="12" />
          </a>
        </span>
        @if (open()) {
          <div class="detail">
            <p class="title">{{ entry().title }}</p>
            <p>{{ entry().why }}</p>
            @if (entry().fix; as fix) {
              <p><span class="k">How to fix</span> {{ fix }}</p>
            }
            <ul>
              @for (d of entry().docs; track d.url) {
                <li><a [href]="d.url" target="_blank" rel="noopener noreferrer" (click)="$event.stopPropagation()">{{ d.label }} <app-icon name="external" [size]="11" /></a></li>
              }
              @if (entry().help; as h) {
                <li><a [href]="href(h.section)" (click)="$event.stopPropagation()">{{ h.label }} in Help</a> <span class="muted">(this tool's own reasoning, not a Microsoft rule)</span></li>
              }
            </ul>
          </div>
        }
      </div>
      @if (quickFix(); as q) {
        <button type="button" class="btn sm" (click)="apply($event, q)"><app-icon name="wand" [size]="13" /> {{ q.label }}</button>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .alert { display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px; border-radius: 6px; }
    .ico { margin-top: 2px; }
    .alert.error .ico { color: var(--error); }
    .alert.warning .ico { color: var(--warning); }
    .alert.info .ico { color: var(--info); }
    .main { flex: 1; min-width: 0; }
    .msg { overflow-wrap: anywhere; }
    .links { display: inline-flex; gap: 10px; margin-left: 8px; white-space: nowrap; }
    .link { display: inline-flex; align-items: center; gap: 3px; border: 0; background: none; padding: 0; font: inherit; font-size: 12px; color: var(--accent); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
    .detail { margin-top: 6px; padding: 8px 10px; border-left: 2px solid var(--border-strong); background: var(--surface-2); font-size: 12.5px; }
    .detail p { margin: 0 0 6px; }
    .detail .title { font-weight: 600; }
    .detail .k { font-weight: 600; margin-right: 4px; }
    .detail ul { margin: 4px 0 0; padding-left: 18px; }
    .detail a { color: var(--accent); }
    .muted { color: var(--text-3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertItem {
  private readonly store = inject(EditorStore);
  readonly severity = input.required<'error' | 'warning' | 'info'>();
  readonly message = input.required<string>();
  /** Key into the alert catalog. */
  readonly code = input<string | undefined>();
  readonly quickFix = input<QuickFix | undefined>();
  protected readonly open = signal(false);
  protected readonly entry = computed(() => lookupAlert(this.code()));

  protected href(section: string): string {
    return helpHref(section);
  }

  protected toggle(e: Event): void {
    e.stopPropagation();
    this.open.update((v) => !v);
  }

  protected apply(e: Event, fix: QuickFix): void {
    e.stopPropagation();
    this.store.applyFix(fix);
  }
}
