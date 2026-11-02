import { afterEveryRender, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Keeps a <select> showing the bound value. Binding [value] directly is unreliable when the
 * options are rendered by @for in the same template (the value is applied before the options exist).
 */
@Directive({ selector: 'select[appValue]' })
export class SelectValue {
  readonly appValue = input<string | null | undefined>();
  private readonly el = inject<ElementRef<HTMLSelectElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => {
      const v = this.appValue() ?? '';
      const s = this.el.nativeElement;
      if (s.value !== v && document.activeElement !== s) s.value = v;
    });
  }
}
