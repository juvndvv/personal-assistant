import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ProgressTone = 'neutral' | 'ok' | 'warning' | 'over';

const FILL: Record<ProgressTone, string> = {
  neutral: 'var(--viz-series-1)',
  ok: 'var(--viz-status-good)',
  warning: 'var(--viz-status-warning)',
  over: 'var(--viz-status-critical)',
};

@Component({
  selector: 'app-progress-bar',
  template: `
    <div
      role="progressbar"
      [attr.aria-label]="label()"
      aria-valuemin="0"
      [attr.aria-valuemax]="max()"
      [attr.aria-valuenow]="value()"
      [attr.aria-valuetext]="valueText()"
      class="h-2 w-full overflow-hidden rounded-capsule bg-[var(--viz-track)]"
    >
      <div
        class="h-full rounded-capsule transition-[width] duration-200 motion-reduce:transition-none"
        [style.width.%]="percent()"
        [style.background]="fill()"
        data-testid="progress-fill"
      ></div>
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressBar {
  readonly value = input.required<number>();
  readonly max = input(10_000);
  readonly label = input.required<string>();
  readonly valueText = input<string | null>(null);
  readonly tone = input<ProgressTone>('neutral');
  readonly color = input<string | null>(null);

  protected readonly percent = computed(() => {
    const max = this.max();
    return max <= 0 ? 0 : Math.min(100, Math.max(0, (this.value() / max) * 100));
  });
  protected readonly fill = computed(() => this.color() ?? FILL[this.tone()]);
}
