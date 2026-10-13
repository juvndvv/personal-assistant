import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, filter, map, of, switchMap, tap } from 'rxjs';
import { CategoriesApi } from '../../core/api/categories.api';
import { Category, PeriodLabel, TrendPoint } from '../../core/api/models';
import { ReportsApi } from '../../core/api/reports.api';
import { BarChart, ChartSeries, LineChart, formatBasisPoints } from '../../shared/charts';
import { UiSelect, UiSelectOption } from '../../shared/ui';
import { TREND_PERIODS, trendCategories } from './reports-display';

@Component({
  selector: 'app-trend-section',
  imports: [BarChart, LineChart, UiSelect],
  template: `
    <section
      class="rounded-2xl border border-border bg-background p-5"
      aria-labelledby="trend-heading"
      data-testid="trend-section"
    >
      <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="trend-heading" class="text-lg font-semibold text-foreground">
            Evolución de {{ periods }} periodos
          </h2>
          <p class="text-xs text-muted-foreground">Toca un periodo para ver su informe.</p>
        </div>
        <div class="w-full sm:w-60">
          <ui-select
            label="Comparar con categoría"
            placeholder="Sin categoría"
            size="sm"
            [options]="categoryOptions()"
            [value]="categoryValue()"
            (valueChange)="categoryValue.set($event)"
          />
        </div>
      </div>
      @if (failed()) {
        <p role="alert" class="text-sm text-destructive">No se pudo cargar la evolución.</p>
      } @else if (points().length > 0) {
        <app-bar-chart
          ariaLabel="Ingresos y gastos por periodo"
          selectable
          [categories]="categories()"
          [series]="series()"
          [overlay]="overlay()"
          [selectedKey]="selected()"
          [busy]="busy()"
          (selectCategory)="selectPeriod.emit($event)"
        />
      }
    </section>

    <section
      class="mt-6 rounded-2xl border border-border bg-background p-5"
      aria-labelledby="savings-history-heading"
      data-testid="savings-history"
    >
      <h2 id="savings-history-heading" class="text-lg font-semibold text-foreground">
        Tasa de ahorro por periodo
      </h2>
      <p class="mb-3 text-xs text-muted-foreground">
        (Ingresos − gastos) / ingresos. Sin valor en periodos sin ingresos.
      </p>
      @if (points().length > 0) {
        <app-line-chart
          ariaLabel="Tasa de ahorro por periodo"
          [categories]="categories()"
          [series]="savingsSeries()"
          [valueFormatter]="formatRate"
          [busy]="busy()"
        />
      }
    </section>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrendSection {
  private readonly reportsApi = inject(ReportsApi);
  private readonly categoriesApi = inject(CategoriesApi);

  readonly until = input.required<PeriodLabel | null>();
  readonly selected = input<PeriodLabel | null>(null);
  readonly reload = input(0);
  readonly selectPeriod = output<PeriodLabel>();

  protected readonly periods = TREND_PERIODS;
  protected readonly formatRate = formatBasisPoints;
  protected readonly points = signal<TrendPoint[]>([]);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  protected readonly categoryValue = signal<string | null>(null);
  private readonly expenseCategories = signal<Category[]>([]);

  protected readonly categoryOptions = computed<UiSelectOption[]>(() =>
    this.expenseCategories().flatMap((parent) => [
      { value: String(parent.id), label: parent.name },
      ...parent.children.map((child) => ({
        value: String(child.id),
        label: `${parent.name} › ${child.name}`,
      })),
    ]),
  );

  private readonly categoryName = computed(
    () =>
      this.categoryOptions().find((option) => option.value === this.categoryValue())?.label ?? null,
  );

  protected readonly categories = computed(() => trendCategories(this.points()));
  protected readonly series = computed<ChartSeries[]>(() => [
    {
      key: 'income',
      label: 'Ingresos',
      slot: 1,
      values: this.points().map((point) => point.income_cents),
    },
    {
      key: 'expense',
      label: 'Gastos',
      slot: 2,
      values: this.points().map((point) => point.expense_cents),
    },
  ]);
  protected readonly overlay = computed<ChartSeries | null>(() => {
    const name = this.categoryName();
    if (name === null) {
      return null;
    }
    return {
      key: 'category',
      label: name,
      slot: 3,
      values: this.points().map((point) => point.category_cents ?? 0),
    };
  });
  protected readonly savingsSeries = computed<ChartSeries[]>(() => [
    {
      key: 'savings',
      label: 'Tasa de ahorro',
      slot: 1,
      values: this.points().map((point) => point.savings_rate_bp),
    },
  ]);

  constructor() {
    this.categoriesApi
      .list({ kind: 'expense' })
      .pipe(
        catchError(() => of<Category[]>([])),
        takeUntilDestroyed(),
      )
      .subscribe((categories) => this.expenseCategories.set(categories));

    combineLatest([
      toObservable(this.until),
      toObservable(this.categoryValue),
      toObservable(this.reload),
    ])
      .pipe(
        filter(([until]) => until !== null),
        tap(() => this.busy.set(true)),
        switchMap(([until, category]) =>
          this.reportsApi
            .trend({
              periods: TREND_PERIODS,
              until: until ?? undefined,
              ...(category === null ? {} : { category_id: Number(category) }),
            })
            .pipe(
              map((points) => ({ points, failed: false })),
              catchError(() => of({ points: [] as TrendPoint[], failed: true })),
            ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ points, failed }) => {
        this.points.set(points);
        this.failed.set(failed);
        this.busy.set(false);
      });

    effect(() => {
      const options = this.categoryOptions();
      untracked(() => {
        const value = this.categoryValue();
        if (value !== null && !options.some((option) => option.value === value)) {
          this.categoryValue.set(null);
        }
      });
    });
  }
}
