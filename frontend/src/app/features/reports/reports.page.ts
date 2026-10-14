import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, filter, map, of, switchMap, tap } from 'rxjs';
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
import { TrendSection } from './trend-section';

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
      <p role="alert" class="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        No se pudo cargar el informe. Inténtalo de nuevo.
      </p>
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
          [value]="eur(data.income_cents)"
        />
        <app-stat-tile
          data-testid="summary-expense"
          label="Gastos"
          [value]="eur(data.expense_cents)"
        />
        <app-stat-tile
          data-testid="summary-net"
          label="Ahorro neto"
          [value]="signedEur(data.net_cents)"
          [tone]="netTone()"
        />
        <app-stat-tile
          data-testid="summary-savings-rate"
          label="Tasa de ahorro"
          [value]="rate(data.savings_rate_bp)"
          [tone]="rateTone()"
          [hint]="data.savings_rate_bp === null ? 'Sin ingresos en este periodo' : null"
        />
      </section>

      <div class="mt-6 transition-opacity" [class.opacity-60]="busy()">
        <app-category-breakdown
          [summary]="data"
          [kind]="kind()"
          [parentId]="parentId()"
          (kindChange)="setKind($event)"
        />
      </div>
    }

    <div class="mt-6">
      <app-budget-vs-actual-section [period]="navigator.label()" />
    </div>

    <app-trend-section
      class="mt-6"
      [until]="navigator.label()"
      [selected]="navigator.label()"
      (selectPeriod)="navigator.goTo($event)"
    />

    <div class="mt-6">
      <app-capture-quality-panel [period]="navigator.label()" />
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

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly kind = computed(() => kindFromParam(this.queryParams().get(KIND_QUERY_PARAM)));
  protected readonly parentId = computed(() =>
    categoryIdFromParam(this.queryParams().get(CATEGORY_QUERY_PARAM)),
  );
  protected readonly netTone = computed(() => signedTone(this.summary()?.net_cents ?? 0));
  protected readonly rateTone = computed(() =>
    savingsTone(this.summary()?.savings_rate_bp ?? null),
  );

  constructor() {
    toObservable(this.navigator.label)
      .pipe(
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
