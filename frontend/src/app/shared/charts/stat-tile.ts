import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheck, lucideTriangleAlert } from '@ng-icons/lucide';

export type StatTone = 'neutral' | 'positive' | 'negative';
export type StatStatus = 'good' | 'warning';
export type StatVariant = 'tinted' | 'card';

const TONE_CLASS: Record<StatTone, string> = {
  neutral: 'text-foreground',
  positive: 'text-success-text',
  negative: 'text-danger-text',
};

const VARIANT_CLASS: Record<StatVariant, string> = {
  tinted: 'bg-fill-on-card',
  card: 'bg-card shadow-card border border-hairline dark:border-border',
};

const STATUS_STYLE: Record<StatStatus, { icon: string; color: string }> = {
  good: { icon: 'lucideCircleCheck', color: 'text-success-text' },
  warning: { icon: 'lucideTriangleAlert', color: 'text-warning-text' },
};

@Component({
  selector: 'app-stat-tile',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCircleCheck, lucideTriangleAlert })],
  template: `
    <div class="flex h-full flex-col gap-1 rounded-card px-4 py-3" [class]="surfaceClass()">
      <p class="text-sm text-muted-foreground">{{ label() }}</p>
      <p class="amount text-xl md:text-2xl" [class]="valueClass()" data-testid="stat-value">
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
              [name]="statusStyle[current].icon"
              aria-hidden="true"
              size="14"
              class="shrink-0"
              [class]="statusStyle[current].color"
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
  readonly variant = input<StatVariant>('tinted');

  protected readonly statusStyle = STATUS_STYLE;
  protected readonly surfaceClass = computed(() => VARIANT_CLASS[this.variant()]);
  protected readonly valueClass = computed(() => TONE_CLASS[this.tone()]);
}
