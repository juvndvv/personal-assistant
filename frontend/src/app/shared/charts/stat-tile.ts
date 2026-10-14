import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheck, lucideTriangleAlert } from '@ng-icons/lucide';

export type StatTone = 'neutral' | 'positive' | 'negative';
export type StatStatus = 'good' | 'warning';

const TONE_CLASS: Record<StatTone, string> = {
  neutral: 'text-foreground',
  positive: 'text-success-text',
  negative: 'text-destructive',
};

@Component({
  selector: 'app-stat-tile',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCircleCheck, lucideTriangleAlert })],
  template: `
    <div class="flex h-full flex-col gap-1 rounded-xl bg-muted/60 px-3 py-2.5">
      <p class="text-xs text-muted-foreground">{{ label() }}</p>
      <p class="text-xl font-semibold" [class]="valueClass()" data-testid="stat-value">
        {{ value() }}
      </p>
      @if (hint()) {
        <p class="text-xs text-muted-foreground">{{ hint() }}</p>
      }
      @if (status() !== null || statusLabel() !== '') {
        <p
          class="mt-auto flex items-center gap-1 text-xs text-foreground"
          data-testid="stat-status"
        >
          @if (status(); as current) {
            <ng-icon
              [name]="current === 'good' ? 'lucideCircleCheck' : 'lucideTriangleAlert'"
              aria-hidden="true"
              size="14"
              [style.color]="
                current === 'good' ? 'var(--viz-status-good)' : 'var(--viz-status-warning)'
              "
            />
          }
          {{ statusLabel() }}
        </p>
      }
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatTile {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly tone = input<StatTone>('neutral');
  readonly status = input<StatStatus | null>(null);
  readonly statusLabel = input<string>('');

  protected readonly valueClass = computed(() => TONE_CLASS[this.tone()]);
}
