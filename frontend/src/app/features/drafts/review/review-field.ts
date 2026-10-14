import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTriangleAlert } from '@ng-icons/lucide';
import { FieldSource } from '../../../core/api/models';
import { UiBadge, UiBadgeTone } from '../../../shared/ui';
import { FIELD_SOURCE_LABEL } from '../draft-display';

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
      <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        @if (lowConfidence()) {
          <span class="inline-flex items-center gap-1 font-medium text-warning">
            <ng-icon name="lucideTriangleAlert" size="14" aria-hidden="true" />
            Revisa este dato
          </span>
        }
        @if (sourceLabel(); as label) {
          <ui-badge [tone]="sourceTone()" variant="soft">
            <span data-testid="field-source">{{ label }}</span>
          </ui-badge>
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

  protected readonly hostClass = computed(() =>
    this.lowConfidence()
      ? 'block rounded-xl bg-warning/10 p-2 ring-1 ring-warning'
      : 'block rounded-xl',
  );

  protected readonly sourceTone = computed<UiBadgeTone>(() => {
    const source = this.source();
    return source === null ? 'neutral' : SOURCE_TONE[source];
  });

  protected readonly sourceLabel = computed(() => {
    const source = this.source();
    return source === null ? null : FIELD_SOURCE_LABEL[source];
  });
}
