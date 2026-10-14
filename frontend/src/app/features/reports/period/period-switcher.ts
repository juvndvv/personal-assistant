import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import { Period, PeriodLabel } from '../../../core/api/models';
import { formatDate } from '../../../core/date/iso-date';
import { formatPeriodLabel } from '../../../core/date/period-label';
import { UiCard, UiSkeleton } from '../../../shared/ui';

@Component({
  selector: 'app-period-switcher',
  imports: [NgIcon, UiCard, UiSkeleton],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  template: `
    <nav uiCard padding="none" class="flex items-center gap-1 p-1.5" aria-label="Periodo">
      <button
        type="button"
        class="grid size-11 shrink-0 place-items-center rounded-capsule text-foreground transition-colors duration-150 hover:bg-hover active:bg-pressed disabled:pointer-events-none disabled:text-disabled-foreground"
        aria-label="Periodo anterior"
        [disabled]="label() === null"
        (click)="previous.emit()"
      >
        <ng-icon name="lucideChevronLeft" size="20" aria-hidden="true" />
      </button>
      <div class="min-w-0 flex-1 text-center" aria-live="polite">
        @if (name(); as periodName) {
          <p class="font-semibold text-foreground first-letter:uppercase" data-testid="period-name">
            {{ periodName }}
          </p>
        } @else {
          <p class="flex justify-center py-1" data-testid="period-name">
            <span class="sr-only">Cargando periodo</span>
            <ui-skeleton shape="title" width="9rem" />
          </p>
        }
        <p class="text-xs text-muted-foreground tabular-nums" data-testid="period-range">
          {{ range() }}
        </p>
      </div>
      @if (!isCurrent() && label() !== null) {
        <button
          type="button"
          class="min-h-11 shrink-0 rounded-capsule px-3 text-sm font-medium text-link transition-colors duration-150 hover:bg-hover active:bg-pressed"
          (click)="current.emit()"
        >
          Ir al actual
        </button>
      }
      <button
        type="button"
        class="grid size-11 shrink-0 place-items-center rounded-capsule text-foreground transition-colors duration-150 hover:bg-hover active:bg-pressed disabled:pointer-events-none disabled:text-disabled-foreground"
        aria-label="Periodo siguiente"
        [disabled]="!canGoNext()"
        (click)="next.emit()"
      >
        <ng-icon name="lucideChevronRight" size="20" aria-hidden="true" />
      </button>
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodSwitcher {
  readonly label = input.required<PeriodLabel | null>();
  readonly period = input<Period | null>(null);
  readonly canGoNext = input(false);
  readonly isCurrent = input(true);

  readonly previous = output<void>();
  readonly next = output<void>();
  readonly current = output<void>();

  protected readonly name = computed(() => {
    const label = this.label();
    return label === null ? null : formatPeriodLabel(label);
  });

  protected readonly range = computed(() => {
    const period = this.period();
    if (period === null || period.label !== this.label()) {
      return '\u00a0';
    }
    return `${formatDate(period.start, 'medium')} – ${formatDate(period.end, 'medium')}`;
  });
}
