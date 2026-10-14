import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, combineLatest, filter, map, of, switchMap, tap } from 'rxjs';
import { CategoryKind, PeriodLabel, PeriodSummary } from '../../core/api/models';
import { ReportsApi } from '../../core/api/reports.api';
import { formatCents } from '../../core/money/format-cents';
import { StatTile, formatBasisPoints } from '../../shared/charts';
import { BudgetVsActualSection } from '../budgets/budget-vs-actual-section';
import { PageHeader } from '../../shared/layout/page-header';
import { CaptureQualityPanel } from './capture-quality-panel';
import { CategoryBreakdown } from './category-breakdown';
import { PeriodNavigator } from './period/period-navigator';
import { PeriodSwitcher } from './period/period-switcher';
import { ReportsNav } from './reports-nav';
import {
  CATEGORY_QUERY_PARAM,
  KIND_QUERY_PARAM,
  categoryIdFromParam,
  kindFromParam,
  savingsTone,
  signedTone,
} from './reports-display';
import { LedgerReferenceData } from '../transactions/reference-data';
import { TrendSection } from './trend-section';
import { UiAlert, UiCard, UiSkeleton } from '../../shared/ui';

@Component({
  selector: 'app-reports-page',
  imports: [
    BudgetVsActualSection,
    CaptureQualityPanel,
    CategoryBreakdown,
    PageHeader,
    PeriodSwitcher,
    ReportsNav,
    StatTile,
    TrendSection,
    UiAlert,
    UiCard,
    UiSkeleton,
  ],
  providers: [PeriodNavigator],
  template: `
    <app-page-header title="Informes" />
    <app-reports-nav class="mb-4 block" />
    <app-period-switcher
      [label]="navigator.label()"
      [period]="summary()?.period ?? null"
      [canGoNext]="navigator.canGoNext()"
      [isCurrent]="navigator.isCurrent()"
      (previous)="navigator.previous()"
      (next)="navigator.next()"
      (current)="navigator.goToCurrent()"
    />

    @if (failed() || navigator.failed()) {
      <ui-alert class="mt-4" retryable [retrying]="busy()" (retry)="retry()">
        No se pudo cargar el informe. Inténtalo de nuevo.
      </ui-alert>
    }

    @if (summary(); as data) {
      <section
        class="mt-4 grid grid-cols-2 gap-3 transition-opacity lg:grid-cols-4"
        [class.opacity-60]="busy()"
        aria-label="Resumen del periodo"
        data-testid="period-summary"
      >
        <app-stat-tile
          data-testid="summary-income"
          label="Ingresos"
          variant="card"
          [value]="signedEur(data.income_cents)"
          [tone]="incomeTone()"
        />
        <app-stat-tile
          data-testid="summary-expense"
          label="Gastos"
          variant="card"
          [value]="eur(data.expense_cents)"
        />
        <app-stat-tile
          data-testid="summary-net"
          label="Ahorro neto"
          variant="card"
          [value]="signedEur(data.net_cents)"
          [tone]="netTone()"
        />
        <app-stat-tile
          data-testid="summary-savings-rate"
          label="Tasa de ahorro"
          variant="card"
          [value]="rate(data.savings_rate_bp)"
          [tone]="rateTone()"
          [hint]="data.savings_rate_bp === null ? 'Sin ingresos en este periodo' : null"
        />
      </section>
    } @else if (loading()) {
      <div
        role="status"
        aria-live="polite"
        class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
        data-testid="period-summary-loading"
      >
        <span class="sr-only">Cargando resumen del periodo</span>
        @for (tile of summaryPlaceholders; track tile) {
          <ui-card padding="sm" class="px-4">
            <ui-skeleton width="50%" />
            <ui-skeleton shape="amount" class="mt-3" />
          </ui-card>
        }
      </div>
    }

    <div
      class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start"
      data-testid="reports-columns"
    >
      <div class="flex min-w-0 flex-col gap-6">
        @if (summary(); as data) {
          <div class="transition-opacity" [class.opacity-60]="busy()">
            <app-category-breakdown
              [summary]="data"
              [kind]="kind()"
              [parentId]="parentId()"
              (kindChange)="setKind($event)"
            />
          </div>
        } @else if (loading()) {
          <ui-card padding="lg" role="status" aria-live="polite">
            <span class="sr-only">Cargando gasto por categoría</span>
            <ui-skeleton shape="title" />
            <div class="mt-5 flex items-center gap-5">
              <ui-skeleton shape="circle" width="9rem" height="9rem" />
              <ui-skeleton [lines]="4" class="flex-1" />
            </div>
          </ui-card>
        }
        <app-budget-vs-actual-section [period]="navigator.label()" />
      </div>

      <div class="flex min-w-0 flex-col gap-6">
        <app-trend-section
          [until]="navigator.label()"
          [selected]="navigator.label()"
          (selectPeriod)="navigator.goTo($event)"
        />
        <app-capture-quality-panel [period]="navigator.label()" />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {
  private readonly api = inject(ReportsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly navigator = inject(PeriodNavigator);

  protected readonly summary = signal<PeriodSummary | null>(null);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  protected readonly summaryPlaceholders = [0, 1, 2, 3];
  private readonly reloads = signal(0);

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly kind = computed(() => kindFromParam(this.queryParams().get(KIND_QUERY_PARAM)));
  protected readonly parentId = computed(() =>
    categoryIdFromParam(this.queryParams().get(CATEGORY_QUERY_PARAM)),
  );
  protected readonly incomeTone = computed(() => signedTone(this.summary()?.income_cents ?? 0));
  protected readonly netTone = computed(() => signedTone(this.summary()?.net_cents ?? 0));
  protected readonly rateTone = computed(() =>
    savingsTone(this.summary()?.savings_rate_bp ?? null),
  );
  protected readonly loading = computed(
    () => this.summary() === null && !this.failed() && !this.navigator.failed(),
  );

  constructor() {
    void inject(LedgerReferenceData)
      .ensureLoaded()
      .catch(() => undefined);
    combineLatest([toObservable(this.navigator.label), toObservable(this.reloads)])
      .pipe(
        map(([label]) => label),
        filter((label): label is PeriodLabel => label !== null),
        tap(() => this.busy.set(true)),
        switchMap((label) =>
          this.api.summary(label).pipe(
            map((summary) => ({ summary, failed: false })),
            catchError(() => of({ summary: null, failed: true })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ summary, failed }) => {
        this.summary.set(summary);
        this.failed.set(failed);
        this.busy.set(false);
      });
  }

  protected retry(): void {
    if (this.navigator.failed()) {
      this.navigator.reload();
    }
    this.reloads.update((count) => count + 1);
  }

  protected setKind(kind: CategoryKind): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        [KIND_QUERY_PARAM]: kind === 'expense' ? null : kind,
        [CATEGORY_QUERY_PARAM]: null,
      },
      queryParamsHandling: 'merge',
    });
  }

  protected eur(cents: number): string {
    return formatCents(cents);
  }

  protected signedEur(cents: number): string {
    return formatCents(cents, { signed: true });
  }

  protected rate(basisPoints: number | null): string {
    return formatBasisPoints(basisPoints);
  }
}
