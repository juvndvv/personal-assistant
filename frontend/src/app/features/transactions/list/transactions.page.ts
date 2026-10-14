import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeftRight,
  lucideChevronRight,
  lucideDownload,
  lucideFunnel,
  lucideInbox,
  lucidePlus,
} from '@ng-icons/lucide';
import { catchError, debounceTime, distinctUntilChanged, map, of, skip } from 'rxjs';
import { transactionsCsvUrl } from '../../../core/api/exports.api';
import { PeriodsApi } from '../../../core/api/periods.api';
import { Period, TransactionListQuery, TransactionTotals } from '../../../core/api/models';
import { formatDate } from '../../../core/date/iso-date';
import { formatPeriodLabel } from '../../../core/date/period-label';
import { EurPipe } from '../../../core/money/eur.pipe';
import { PageHeader } from '../../../shared/layout/page-header';
import { DOWNLOAD_LINK_CLASS } from '../../export/download-link-class';
import { UiButton, UiInput } from '../../../shared/ui';
import { PendingDrafts } from '../../drafts/pending-drafts';
import { MovementSheets } from '../movement-sheets';
import { TransactionFeed } from './transaction-feed';
import { TransactionFilterSheet } from './transaction-filter-sheet';
import {
  ALL_PERIODS,
  TransactionFilters,
  activeFilterCount,
  filtersFromQueryParams,
  filtersToListQuery,
  filtersToQueryParams,
  hasDateRange,
} from './transaction-filters';

export const SEARCH_DEBOUNCE_MS = 300;
const PERIOD_HISTORY = 24;

@Component({
  selector: 'app-transactions-page',
  imports: [
    EurPipe,
    NgIcon,
    PageHeader,
    RouterLink,
    TransactionFeed,
    TransactionFilterSheet,
    UiButton,
    UiInput,
  ],
  providers: [
    provideIcons({
      lucideArrowLeftRight,
      lucideChevronRight,
      lucideDownload,
      lucideFunnel,
      lucideInbox,
      lucidePlus,
    }),
  ],
  template: `
    <app-page-header title="Movimientos" />
    @if (pendingCount() > 0) {
      <a
        routerLink="/pendientes"
        class="mb-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-foreground hover:bg-primary/10"
        data-testid="pending-drafts-banner"
      >
        <ng-icon name="lucideInbox" size="20" class="text-primary-text" aria-hidden="true" />
        <span class="flex-1">
          {{
            pendingCount() === 1
              ? '1 borrador pendiente de revisar'
              : pendingCount() + ' borradores pendientes de revisar'
          }}
        </span>
        <ng-icon name="lucideChevronRight" class="text-muted-foreground" aria-hidden="true" />
      </a>
    }
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div class="flex-1">
        <ui-input
          label="Buscar"
          name="q"
          type="text"
          placeholder="Descripción, comercio o nota"
          [value]="search()"
          (valueChange)="search.set($event)"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <ui-button variant="outline" (clicked)="filtersOpen.set(true)">
          <ng-icon name="lucideFunnel" aria-hidden="true" />
          {{ filterCount() > 0 ? 'Filtros (' + filterCount() + ')' : 'Filtros' }}
        </ui-button>
        <ui-button variant="outline" (clicked)="sheets.openNewTransfer()">
          <ng-icon name="lucideArrowLeftRight" aria-hidden="true" />
          Transferencia
        </ui-button>
        @if (exportUrl(); as url) {
          <a [href]="url" download [class]="downloadLinkClass" data-testid="export-csv">
            <ng-icon name="lucideDownload" aria-hidden="true" />
            Exportar CSV
          </a>
        }
      </div>
    </div>

    <section
      class="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-border bg-background p-4"
      aria-label="Totales"
    >
      <p class="col-span-2 text-sm text-muted-foreground" data-testid="list-scope">{{ scope() }}</p>
      <div>
        <p class="text-xs text-muted-foreground">Ingresos</p>
        <p class="font-semibold tabular-nums text-success-text" data-testid="total-income">
          {{ totals().income_cents | eur }}
        </p>
      </div>
      <div>
        <p class="text-xs text-muted-foreground">Gastos</p>
        <p class="font-semibold tabular-nums text-foreground" data-testid="total-expense">
          {{ totals().expense_cents | eur }}
        </p>
      </div>
    </section>

    <app-transaction-feed
      [query]="listQuery()"
      [accountScoped]="filters().accountIds.length > 0"
      (metaChange)="totals.set($event.totals)"
    />
    <div class="h-20" aria-hidden="true"></div>

    <button
      type="button"
      class="fixed end-4 bottom-24 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:bottom-8"
      aria-label="Nuevo movimiento"
      (click)="sheets.openQuickAdd()"
    >
      <ng-icon name="lucidePlus" size="28" aria-hidden="true" />
    </button>

    <app-transaction-filter-sheet
      [(open)]="filtersOpen"
      [filters]="filters()"
      [periods]="periods() ?? []"
      (applied)="navigate($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly sheets = inject(MovementSheets);
  protected readonly pendingCount = inject(PendingDrafts).count;

  protected readonly filtersOpen = signal(false);
  protected readonly totals = signal<TransactionTotals>({ income_cents: 0, expense_cents: 0 });

  protected readonly filters = toSignal(
    this.route.queryParamMap.pipe(map(filtersFromQueryParams)),
    {
      requireSync: true,
    },
  );
  protected readonly periods = toSignal(
    inject(PeriodsApi)
      .list({ count: PERIOD_HISTORY })
      .pipe(catchError(() => of<Period[]>([]))),
  );
  protected readonly search = signal(this.filters().q);

  private readonly currentPeriod = computed(() => this.periods()?.at(-1) ?? null);
  protected readonly filterCount = computed(() => activeFilterCount(this.filters()));

  protected readonly listQuery = computed<TransactionListQuery | null>(() => {
    const filters = this.filters();
    const needsCurrent = filters.period === null && !hasDateRange(filters);
    if (needsCurrent && this.periods() === undefined) {
      return null;
    }
    return filtersToListQuery(filters, this.currentPeriod()?.label ?? null);
  });

  protected readonly downloadLinkClass = DOWNLOAD_LINK_CLASS;
  protected readonly exportUrl = computed(() => {
    const query = this.listQuery();
    return query === null ? null : transactionsCsvUrl(query);
  });

  protected readonly scope = computed(() => {
    const filters = this.filters();
    if (hasDateRange(filters)) {
      const from = filters.dateFrom === null ? 'el inicio' : formatDate(filters.dateFrom, 'medium');
      const to = filters.dateTo === null ? 'hoy' : formatDate(filters.dateTo, 'medium');
      return `Del ${from} a ${to}`;
    }
    if (filters.period === ALL_PERIODS) {
      return 'Todo el historial';
    }
    const label = filters.period ?? this.currentPeriod()?.label;
    if (label === undefined) {
      return '';
    }
    const period =
      this.periods()?.find((candidate) => candidate.label === label) ??
      (filters.period === null ? this.currentPeriod() : null);
    const name = formatPeriodLabel(label);
    return period === null
      ? `Periodo ${name}`
      : `Periodo ${name}: del ${formatDate(period.start, 'medium')} al ${formatDate(period.end, 'medium')}`;
  });

  constructor() {
    toObservable(this.search)
      .pipe(skip(1), debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((q) => this.navigate({ ...this.filters(), q: q.trim() }));
  }

  protected navigate(filters: TransactionFilters): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filtersToQueryParams(filters),
      replaceUrl: true,
    });
  }
}
