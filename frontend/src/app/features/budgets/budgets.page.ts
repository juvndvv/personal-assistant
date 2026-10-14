import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHistory, lucidePencil } from '@ng-icons/lucide';
import { catchError, combineLatest, filter, map, of, switchMap, tap } from 'rxjs';
import { BudgetsApi } from '../../core/api/budgets.api';
import { Budget, BudgetVsActualItem, CategorySummary, PeriodLabel } from '../../core/api/models';
import { formatPeriodLabel } from '../../core/date/period-label';
import { EurPipe } from '../../core/money/eur.pipe';
import { ProgressBar, ProgressTone, formatBasisPoints } from '../../shared/charts';
import { PageHeader } from '../../shared/layout/page-header';
import { UiAlert, UiCard, UiSkeletonList } from '../../shared/ui';
import { PeriodNavigator } from '../reports/period/period-navigator';
import { PeriodSwitcher } from '../reports/period/period-switcher';
import {
  BUDGET_PERIODS_AHEAD,
  BUDGET_STATUS_TONES,
  budgetAmountLabel,
  hasBudget,
} from './budget-display';
import { CategoryIcon } from '../categories/category-icon';
import { CategoryVisual, LedgerReferenceData } from '../transactions/reference-data';
import { BudgetEditor } from './budget-editor';
import { BudgetHistorySheet } from './budget-history-sheet';
import { BudgetStatusLabel } from './budget-status-label';
import { budgetVsActualSource } from './budget-vs-actual-source';

@Component({
  selector: 'app-budgets-page',
  imports: [
    BudgetEditor,
    BudgetHistorySheet,
    BudgetStatusLabel,
    CategoryIcon,
    EurPipe,
    NgIcon,
    PageHeader,
    PeriodSwitcher,
    ProgressBar,
    RouterLink,
    UiAlert,
    UiCard,
    UiSkeletonList,
  ],
  providers: [PeriodNavigator, provideIcons({ lucideHistory, lucidePencil })],
  template: `
    <app-page-header
      title="Presupuestos"
      subtitle="Límite mensual por categoría de gasto. Se repite cada periodo hasta que lo cambies."
      backLink="/mas"
      backLabel="Más"
    />
    <app-period-switcher
      [label]="navigator.label()"
      [period]="actual.report()?.period ?? null"
      [canGoNext]="navigator.canGoNext()"
      [isCurrent]="navigator.isCurrent()"
      (previous)="navigator.previous()"
      (next)="navigator.next()"
      (current)="navigator.goToCurrent()"
    />

    @if (failed() || navigator.failed()) {
      <ui-alert class="mt-4" retryable [retrying]="busy()" (retry)="retry()">
        No se pudieron cargar los presupuestos. Inténtalo de nuevo.
      </ui-alert>
    }

    @if (budgets(); as list) {
      @if (list.length === 0) {
        <p class="mt-6 text-sm text-muted-foreground">
          No tienes categorías de gasto.
          <a routerLink="/mas/categorias" class="font-medium text-link hover:underline">Crea una</a>
          para fijar su presupuesto.
        </p>
      } @else {
        <div class="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-1">
          <p class="flex flex-col text-sm text-muted-foreground" data-testid="budget-total">
            Total presupuestado:
            <span class="amount text-2xl text-foreground">{{ total() | eur }}</span>
          </p>
          @if (attention(); as counts) {
            <p class="flex flex-wrap gap-x-4 gap-y-2" data-testid="budget-attention">
              @if (counts.over > 0) {
                <span class="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <app-budget-status-label status="over" />
                  en {{ categoriesLabel(counts.over) }}
                </span>
              }
              @if (counts.warning > 0) {
                <span class="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <app-budget-status-label status="warning" />
                  en {{ categoriesLabel(counts.warning) }}
                </span>
              }
            </p>
          }
        </div>
        <ul
          uiCard
          divided
          class="mt-3 transition-opacity"
          [class.opacity-60]="busy()"
          aria-label="Presupuestos por categoría"
        >
          @for (budget of list; track budget.category.id) {
            <li
              class="flex flex-col gap-3 px-4 py-3"
              [attr.data-status]="actualFor(budget)?.status ?? null"
              data-testid="budget-category"
            >
              <div class="flex items-center gap-3">
                <app-category-icon
                  size="sm"
                  [icon]="visualOf(budget).icon"
                  [color]="visualOf(budget).color"
                />
                <div class="min-w-0 flex-1">
                  <p class="font-medium break-words text-foreground">{{ budget.category.name }}</p>
                  @if (hasBudget(budget.amount_cents)) {
                    @if (sinceLabel(budget); as since) {
                      <p class="text-xs text-muted-foreground">{{ since }}</p>
                    }
                  } @else {
                    <p class="text-xs text-muted-foreground" data-testid="budget-amount">
                      {{ amountLabel(budget.amount_cents) }}
                    </p>
                  }
                </div>
                @if (hasBudget(budget.amount_cents)) {
                  <span class="amount shrink-0 text-foreground" data-testid="budget-amount">{{
                    amountLabel(budget.amount_cents)
                  }}</span>
                }
                <button
                  type="button"
                  class="grid size-11 shrink-0 place-items-center rounded-capsule text-muted-foreground transition-colors duration-150 hover:bg-hover hover:text-foreground active:bg-pressed"
                  [attr.aria-label]="'Historial de ' + budget.category.name"
                  (click)="openHistory(budget.category)"
                >
                  <ng-icon name="lucideHistory" size="20" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="grid size-11 shrink-0 place-items-center rounded-capsule text-muted-foreground transition-colors duration-150 hover:bg-hover hover:text-foreground active:bg-pressed aria-expanded:bg-fill-strong aria-expanded:text-foreground"
                  [attr.aria-label]="'Editar presupuesto de ' + budget.category.name"
                  [attr.aria-expanded]="editingId() === budget.category.id"
                  (click)="edit(budget.category.id)"
                >
                  <ng-icon name="lucidePencil" size="20" aria-hidden="true" />
                </button>
              </div>

              @if (actualFor(budget); as item) {
                <div class="flex flex-col gap-1.5" data-testid="budget-actual">
                  <app-progress-bar
                    [value]="cappedUsage(item)"
                    [label]="'Gastado en ' + budget.category.name"
                    [valueText]="usage(item)"
                    [tone]="tone(item)"
                  />
                  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p class="text-sm text-muted-foreground">
                      Gastado
                      <span class="amount text-foreground">{{ item.actual_cents | eur }}</span>
                      · <span class="tabular-nums">{{ usage(item) }}</span>
                    </p>
                    @if (item.status !== 'ok') {
                      <app-budget-status-label [status]="item.status" />
                    }
                  </div>
                </div>
              }

              @if (editingId() === budget.category.id && navigator.label(); as period) {
                <app-budget-editor
                  [budget]="budget"
                  [period]="period"
                  (saved)="onSaved($event)"
                  (cancelled)="editingId.set(null)"
                />
              }
            </li>
          }
        </ul>
      }
    } @else if (loading()) {
      <ui-card padding="none" class="mt-4">
        <ui-skeleton-list label="Cargando presupuestos" [rows]="5" />
      </ui-card>
    }

    <app-budget-history-sheet
      [category]="historyCategory()"
      [(open)]="historyOpen"
      (cleared)="onCleared()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetsPage {
  private readonly api = inject(BudgetsApi);
  private readonly reference = inject(LedgerReferenceData);
  protected readonly navigator = inject(PeriodNavigator);
  protected readonly actual = budgetVsActualSource(this.navigator.label);

  protected readonly budgets = signal<Budget[] | null>(null);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly historyCategory = signal<CategorySummary | null>(null);
  protected readonly historyOpen = signal(false);
  private readonly listReloads = signal(0);

  protected readonly total = computed(() =>
    (this.budgets() ?? []).reduce(
      (sum, budget) => sum + (hasBudget(budget.amount_cents) ? budget.amount_cents : 0),
      0,
    ),
  );
  private readonly actualByCategory = computed(
    () =>
      new Map((this.actual.report()?.items ?? []).map((item) => [item.category.id, item] as const)),
  );
  protected readonly loading = computed(
    () => this.budgets() === null && !this.failed() && !this.navigator.failed(),
  );
  protected readonly attention = computed(() => {
    const items = this.actual.report()?.items ?? [];
    const over = items.filter((item) => item.status === 'over').length;
    const warning = items.filter((item) => item.status === 'warning').length;
    return over + warning === 0 ? null : { over, warning };
  });

  constructor() {
    this.navigator.allowPeriodsAhead(BUDGET_PERIODS_AHEAD);
    void this.reference.ensureLoaded().catch(() => undefined);
    combineLatest([toObservable(this.navigator.label), toObservable(this.listReloads)])
      .pipe(
        map(([label]) => label),
        filter((label): label is PeriodLabel => label !== null),
        tap(() => {
          this.busy.set(true);
          this.editingId.set(null);
        }),
        switchMap((label) =>
          this.api.list(label).pipe(
            map((budgets) => ({ budgets, failed: false })),
            catchError(() => of({ budgets: null, failed: true })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ budgets, failed }) => {
        this.budgets.set(budgets);
        this.failed.set(failed);
        this.busy.set(false);
      });
  }

  protected retry(): void {
    if (this.navigator.failed()) {
      this.navigator.reload();
    }
    this.listReloads.update((count) => count + 1);
    this.actual.reload();
  }

  protected categoriesLabel(count: number): string {
    return `${count} ${count === 1 ? 'categoría' : 'categorías'}`;
  }

  protected edit(categoryId: number): void {
    this.editingId.update((current) => (current === categoryId ? null : categoryId));
  }

  protected onSaved(saved: Budget): void {
    this.budgets.update((list) =>
      (list ?? []).map((budget) =>
        budget.category.id === saved.category.id
          ? { ...budget, ...saved, category: budget.category }
          : budget,
      ),
    );
    this.editingId.set(null);
    this.actual.reload();
  }

  protected onCleared(): void {
    this.listReloads.update((count) => count + 1);
    this.actual.reload();
  }

  protected openHistory(category: CategorySummary): void {
    this.historyCategory.set(category);
    this.historyOpen.set(true);
  }

  protected visualOf(budget: Budget): CategoryVisual {
    return this.reference.visualOf(budget.category.id);
  }

  protected hasBudget(amountCents: number | null): boolean {
    return hasBudget(amountCents);
  }

  protected amountLabel(amountCents: number | null): string {
    return budgetAmountLabel(amountCents);
  }

  protected sinceLabel(budget: Budget): string | null {
    return hasBudget(budget.amount_cents) && budget.effective_from !== null
      ? `Desde ${formatPeriodLabel(budget.effective_from)}`
      : null;
  }

  protected actualFor(budget: Budget): BudgetVsActualItem | null {
    return hasBudget(budget.amount_cents)
      ? (this.actualByCategory().get(budget.category.id) ?? null)
      : null;
  }

  protected cappedUsage(item: BudgetVsActualItem): number {
    return Math.min(item.used_bp, 10_000);
  }

  protected usage(item: BudgetVsActualItem): string {
    return formatBasisPoints(item.used_bp);
  }

  protected tone(item: BudgetVsActualItem): ProgressTone {
    return BUDGET_STATUS_TONES[item.status];
  }
}
