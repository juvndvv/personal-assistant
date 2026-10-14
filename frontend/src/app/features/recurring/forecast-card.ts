import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';
import { ForecastItem, PeriodLabel, RecurringForecast } from '../../core/api/models';
import { RecurringApi } from '../../core/api/recurring.api';
import { formatDate } from '../../core/date/iso-date';
import { EurPipe } from '../../core/money/eur.pipe';
import { UiAlert, UiBadge, UiCard, UiSkeleton } from '../../shared/ui';
import { MovementSheets } from '../transactions/movement-sheets';
import { FORECAST_STATUS_LABELS } from './recurring-display';

const PENDING_STATUSES = new Set<ForecastItem['status']>(['upcoming', 'awaiting_amount']);

@Component({
  selector: 'app-forecast-card',
  imports: [EurPipe, RouterLink, UiAlert, UiBadge, UiCard, UiSkeleton],
  template: `
    @if (failed()) {
      <section uiCard padding="lg" aria-labelledby="forecast-heading" data-testid="forecast-error">
        <h2 id="forecast-heading" class="text-lg font-semibold text-foreground">
          Fijos pendientes este periodo
        </h2>
        <ui-alert class="mt-3" retryable [retrying]="retrying()" (retry)="retry()">
          No se pudieron cargar los fijos pendientes.
        </ui-alert>
      </section>
    } @else if (loading()) {
      <ui-card padding="lg" data-testid="forecast-loading">
        <div role="status" aria-live="polite">
          <span class="sr-only">Cargando fijos pendientes</span>
          <ui-skeleton shape="title" />
          <div class="mt-4 grid grid-cols-2 gap-3">
            <ui-skeleton shape="block" height="4rem" />
            <ui-skeleton shape="block" height="4rem" />
          </div>
          <ui-skeleton class="mt-4" [lines]="3" />
        </div>
      </ui-card>
    } @else if (forecast(); as data) {
      <section
        uiCard
        padding="lg"
        aria-labelledby="forecast-heading"
        data-testid="recurring-forecast"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="forecast-heading" class="text-lg font-semibold text-foreground">
            Fijos pendientes este periodo
          </h2>
          <span class="text-xs text-muted-foreground">{{ periodRange() }}</span>
        </div>

        @if (data.items.length === 0) {
          <p class="mt-3 text-sm text-muted-foreground">
            No tienes ingresos ni gastos fijos en este periodo.
          </p>
          <a
            routerLink="/mas/fijos"
            class="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline"
          >
            Configurar fijos
          </a>
        } @else {
          <dl class="mt-3 grid grid-cols-2 gap-3">
            <div class="rounded-menu-item bg-fill-on-card px-3 py-2">
              <dt class="text-xs text-muted-foreground">Gastos pendientes</dt>
              <dd class="amount text-lg text-expense" data-testid="pending-expense">
                {{ data.pending_expense_cents | eur }}
              </dd>
            </div>
            <div class="rounded-menu-item bg-fill-on-card px-3 py-2">
              <dt class="text-xs text-muted-foreground">Ingresos pendientes</dt>
              <dd class="amount text-lg text-income" data-testid="pending-income">
                {{ data.pending_income_cents | eur }}
              </dd>
            </div>
          </dl>

          @if (pendingItems().length === 0) {
            <p class="mt-3 text-sm text-muted-foreground">
              No quedan fijos pendientes en este periodo.
            </p>
          } @else {
            <ul class="mt-3 divide-y divide-border" aria-label="Fijos pendientes">
              @for (item of pendingItems(); track item.template_id + item.due_date) {
                <li class="flex items-center gap-3 py-2 text-sm" data-testid="forecast-item">
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-foreground">{{ item.template_name }}</span>
                    <span class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {{ dueLabel(item) }}
                      @if (item.status === 'awaiting_amount') {
                        <a routerLink="/pendientes" class="hover:underline">
                          <ui-badge tone="warning">{{ statusLabel.awaiting_amount }}</ui-badge>
                        </a>
                      } @else {
                        <ui-badge tone="neutral">{{ statusLabel[item.status] }}</ui-badge>
                      }
                    </span>
                  </span>
                  <span
                    class="amount shrink-0"
                    [class]="item.type === 'income' ? 'text-income' : 'text-expense'"
                  >
                    @if (item.is_variable) {
                      <span class="text-xs font-normal text-muted-foreground">≈</span>
                    }
                    {{ signed(item) | eur: { signed: true } }}
                  </span>
                </li>
              }
            </ul>
          }

          <p class="mt-3 text-xs text-muted-foreground" data-testid="posted-totals">
            Ya registrados: {{ data.posted_expense_cents | eur }} en gastos y
            {{ data.posted_income_cents | eur }} en ingresos
          </p>
        }
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForecastCard {
  private readonly api = inject(RecurringApi);
  private readonly sheets = inject(MovementSheets);

  readonly period = input<PeriodLabel | undefined>(undefined);

  protected readonly statusLabel = FORECAST_STATUS_LABELS;
  protected readonly forecast = signal<RecurringForecast | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly retrying = signal(false);
  private readonly reloads = signal(0);
  protected readonly pendingItems = computed(() =>
    (this.forecast()?.items ?? []).filter((item) => PENDING_STATUSES.has(item.status)),
  );
  protected readonly periodRange = computed(() => {
    const period = this.forecast()?.period;
    return period === undefined
      ? ''
      : `${formatDate(period.start, 'medium')} – ${formatDate(period.end, 'medium')}`;
  });

  constructor() {
    combineLatest([
      toObservable(this.period),
      toObservable(this.sheets.changes),
      toObservable(this.reloads),
    ])
      .pipe(
        tap(() => this.loading.set(this.forecast() === null && !this.failed())),
        switchMap(([period]) =>
          (period === undefined ? this.api.forecast() : this.api.forecast(period)).pipe(
            map((forecast) => ({ forecast, failed: false })),
            catchError(() => of({ forecast: null, failed: true })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.forecast.set(result.forecast);
        this.failed.set(result.failed);
        this.loading.set(false);
        this.retrying.set(false);
      });
  }

  protected retry(): void {
    this.retrying.set(true);
    this.reloads.update((count) => count + 1);
  }

  protected signed(item: ForecastItem): number {
    return item.type === 'income' ? item.amount_cents : -item.amount_cents;
  }

  protected dueLabel(item: ForecastItem): string {
    return formatDate(item.due_date, 'medium');
  }
}
