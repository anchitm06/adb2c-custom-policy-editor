import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';

/**
 * A small anchored panel that opens under its trigger. Put the trigger button in the
 * `popoverTrigger` slot; everything else is the panel. The panel closes on Escape, on a click
 * outside, and, when `closeOnSelect` is set, after any button inside it is used.
 */
@Component({
  selector: 'app-popover',
  template: `
    <span class="trigger" role="presentation" (click)="toggle($event)" (keydown.arrowdown)="openFromKey($event)">
      <ng-content select="[popoverTrigger]" />
    </span>
    @if (isOpen()) {
      <div
        class="panel"
        role="dialog"
        tabindex="-1"
        [attr.aria-label]="label()"
        [style.top.px]="pos().top"
        [style.left.px]="pos().left"
        [style.right.px]="pos().right"
        [style.width.px]="width()"
        (keydown.escape)="close(true)"
        (click)="inside($event)"
      >
        <ng-content />
      </div>
    }
  `,
  styles: `
    :host { display: inline-flex; min-width: 0; }
    .trigger { display: inline-flex; min-width: 0; }
    .panel {
      position: fixed;
      z-index: var(--z-dropdown);
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
      max-width: calc(100% - var(--space-md));
      max-height: min(560px, calc(100dvh - 96px));
      overflow: auto;
      padding: var(--space-sm);
      background: var(--surface);
      color: var(--text);
      border: var(--rule-hair) solid var(--border-strong);
      border-radius: var(--radius-card);
      box-shadow: var(--shadow-pop), var(--ring);
    }
    .panel:focus { outline: none; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocClick($event)', '(document:keydown.escape)': 'onEsc()' },
})
export class Popover {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly label = input('Options');
  readonly align = input<'start' | 'end'>('start');
  readonly width = input<number | null>(null);
  readonly closeOnSelect = input(false);
  readonly opened = output<void>();

  protected readonly isOpen = signal(false);
  protected readonly pos = signal<{ top: number; left: number | null; right: number | null }>({ top: 0, left: 0, right: null });

  toggle(e: Event): void {
    e.stopPropagation();
    if (this.isOpen()) this.close();
    else this.open();
  }

  protected openFromKey(e: Event): void {
    if (!this.isOpen()) {
      e.preventDefault();
      this.open();
    }
  }

  open(): void {
    const r = this.host.nativeElement.getBoundingClientRect();
    const top = r.bottom + 4;
    this.pos.set(this.align() === 'end' ? { top, left: null, right: Math.max(8, window.innerWidth - r.right) } : { top, left: Math.max(8, r.left), right: null });
    this.isOpen.set(true);
    this.opened.emit();
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('.panel')?.focus());
  }

  close(restoreFocus = false): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    if (restoreFocus) this.host.nativeElement.querySelector<HTMLElement>('.trigger button')?.focus();
  }

  protected inside(e: Event): void {
    if (this.closeOnSelect() && (e.target as HTMLElement).closest('button, a, [role="menuitem"]')) this.close();
  }

  protected onDocClick(e: Event): void {
    if (this.isOpen() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }

  protected onEsc(): void {
    if (this.isOpen()) this.close(true);
  }
}
