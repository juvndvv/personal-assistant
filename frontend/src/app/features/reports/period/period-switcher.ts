import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import { Period, PeriodLabel } from '../../../core/api/models';
import { formatDate } from '../../../core/date/iso-date';
import { formatPeriodLabel } from '../../../core/date/period-label';

@Component({
  selector: 'app-period-switcher',
  imports: [NgIcon],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  template: `
    <nav
      class="flex items-center gap-2 rounded-2xl border border-border bg-background p-2"
      aria-label="Periodo"
    >
      <button
        type="button"
        class="grid size-10 shrink-0 place-items-center rounded-xl text-foreground hover:bg-muted disabled:opacity-40"
        aria-label="Periodo anterior"
        [disabled]="label() === null"
        (click)="previous.emit()"
      >
        <ng-icon name="lucideChevronLeft" size="20" aria-hidden="true" />
      </button>
      <div class="min-w-0 flex-1 text-center" aria-live="polite">
        <p class="font-semibold text-foreground first-letter:uppercase" data-testid="period-name">
          {{ name() }}
        </p>
        <p class="text-xs text-muted-foreground" data-testid="period-range">{{ range() }}</p>
      </div>
      @if (!isCurrent() && label() !== null) {
        <button
          type="button"
          class="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-primary-text hover:underline"
          (click)="current.emit()"
        >
          Ir al actual
        </button>
      }
      <button
        type="button"
        class="grid size-10 shrink-0 place-items-center rounded-xl text-foreground hover:bg-muted disabled:opacity-40"
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
    return label === null ? 'Cargando periodo…' : formatPeriodLabel(label);
  });

  protected readonly range = computed(() => {
    const period = this.period();
    if (period === null || period.label !== this.label()) {
      return '\u00a0';
    }
    return `${formatDate(period.start, 'medium')} – ${formatDate(period.end, 'medium')}`;
  });
}
