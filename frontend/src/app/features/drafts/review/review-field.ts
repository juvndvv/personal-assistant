import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTriangleAlert } from '@ng-icons/lucide';
import { FieldSource } from '../../../core/api/models';
import { UiBadge, UiBadgeTone } from '../../../shared/ui';
import { FIELD_SOURCE_LABEL } from '../draft-display';

const FLAGGABLE_CONTROLS = 'input:not([type="hidden"]), select, textarea, [role="radiogroup"]';

let nextFlagId = 0;

const SOURCE_TONE: Record<FieldSource, UiBadgeTone> = {
  ai: 'info',
  history: 'primary',
  template: 'neutral',
  default: 'neutral',
};

@Component({
  selector: 'app-review-field',
  imports: [NgIcon, UiBadge],
  providers: [provideIcons({ lucideTriangleAlert })],
  host: {
    '[class]': 'hostClass()',
    '[attr.data-field]': 'field()',
    '[attr.data-low-confidence]': 'lowConfidence()',
  },
  template: `
    <ng-content />
    @if (lowConfidence() || sourceLabel()) {
      <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
        @if (lowConfidence()) {
          <span
            class="inline-flex items-center gap-1 font-medium text-warning-text"
            data-testid="low-confidence-flag"
            [id]="flagId"
          >
            <ng-icon name="lucideTriangleAlert" size="16" aria-hidden="true" />
            Revisa este dato
          </span>
        }
        @if (sourceLabel(); as label) {
          <span class="inline-flex rounded-capsule bg-card" data-testid="field-source-base">
            <ui-badge [tone]="sourceTone()" variant="soft">
              <span data-testid="field-source">{{ label }}</span>
            </ui-badge>
          </span>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewField {
  readonly field = input.required<string>();
  readonly source = input<FieldSource | null>(null);
  readonly lowConfidence = input(false);

  protected readonly flagId = `review-flag-${++nextFlagId}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    afterRenderEffect(() => this.linkFlag(this.lowConfidence()));
    const observer = new MutationObserver(() => this.linkFlag(this.lowConfidence()));
    observer.observe(this.host, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-describedby'],
    });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  protected readonly hostClass = computed(() =>
    this.lowConfidence()
      ? 'block rounded-card bg-callout-warning p-3 ring-1 ring-warning ring-inset'
      : 'block',
  );

  protected readonly sourceTone = computed<UiBadgeTone>(() => {
    const source = this.source();
    return source === null ? 'neutral' : SOURCE_TONE[source];
  });

  protected readonly sourceLabel = computed(() => {
    const source = this.source();
    return source === null ? null : FIELD_SOURCE_LABEL[source];
  });

  private linkFlag(flagged: boolean): void {
    for (const control of this.host.querySelectorAll<HTMLElement>(FLAGGABLE_CONTROLS)) {
      const current = control.getAttribute('aria-describedby') ?? '';
      const others = current.split(/\s+/).filter((id) => id !== '' && id !== this.flagId);
      const next = (flagged ? [...others, this.flagId] : others).join(' ');
      if (next === current) {
        continue;
      }
      if (next === '') {
        control.removeAttribute('aria-describedby');
      } else {
        control.setAttribute('aria-describedby', next);
      }
    }
  }
}
