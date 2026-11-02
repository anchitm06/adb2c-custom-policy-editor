import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

interface Seg {
  kind: 'text' | 'bold' | 'code' | 'link';
  text: string;
  href?: string;
  external?: boolean;
}

/** Turn "**bold**, `code` and [label](url)" into segments the template can render safely. */
export function segments(text: string): Seg[] {
  const out: Seg[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'code', text: m[2] });
    else out.push({ kind: 'link', text: m[3], href: m[4], external: !m[4].startsWith('#') });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}


/** Inline text with **bold**, `code` and [label](url) marks, rendered without innerHTML. */
@Component({
  selector: 'app-rich',
  template: `
    @for (g of parts(); track $index) {
      @switch (g.kind) {
        @case ('bold') {
          <strong>{{ g.text }}</strong>
        }
        @case ('code') {
          <code>{{ g.text }}</code>
        }
        @case ('link') {
          @if (g.external) {
            <a [href]="g.href" target="_blank" rel="noopener noreferrer">{{ g.text }}</a>
          } @else {
            <a [href]="g.href">{{ g.text }}</a>
          }
        }
        @default {
          <span [textContent]="g.text"></span>
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rich {
  readonly text = input.required<string>();
  protected readonly parts = computed(() => segments(this.text()));
}
