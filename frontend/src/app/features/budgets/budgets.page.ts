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
import { PeriodNavigator } from '../reports/period/period-navigator';
import { PeriodSwitcher } from '../reports/period/period-switcher';
import {
  BUDGET_PERIODS_AHEAD,
  BUDGET_STATUS_TONES,
  budgetAmountLabel,
  hasBudget,
} from './budget-display';
import { BudgetEditor } from './budget-editor';
import { BudgetHistorySheet } from './budget-history-sheet';
import { budgetVsActualSource } from './budget-vs-actual-source';

@Component({
  selector: 'app-budgets-page',
  imports: [
    BudgetEditor,
    BudgetHistorySheet,
    EurPipe,
    NgIcon,
    PageHeader,
    PeriodSwitcher,
    ProgressBar,
    RouterLink,
  ],
  providers: [PeriodNavigator, provideIcons({ lucideHistory, lucidePencil })],
  template: `
    <a
      routerLink="/mas"
      class="mb-4 inline-flex min-w-11 items-center text-sm text-primary-text hover:underline"
      >← Más</a
    >
    <app-page-header
      title="Presupuestos"
      subtitle="Límite mensual por categoría de gasto. Se repite cada periodo hasta que lo cambies."
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
      <p role="alert" class="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        No se pudieron cargar los presupuestos. Inténtalo de nuevo.
      </p>
    }

    @if (budgets(); as list) {
      @if (list.length === 0) {
        <p class="mt-6 text-sm text-muted-foreground">
          No tienes categorías de gasto.
          <a routerLink="/mas/categorias" class="text-primary-text hover:underline">Crea una</a>
          para fijar su presupuesto.
        </p>
      } @else {
        <p class="mt-4 text-sm text-muted-foreground" data-testid="budget-total">
          Total presupuestado:
          <span class="font-semibold tabular-nums text-foreground">{{ total() | eur }}</span>
        </p>
        <ul
          class="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background transition-opacity"
          [class.opacity-60]="busy()"
          aria-label="Presupuestos por categoría"
        >
          @for (budget of list; track budget.category.id) {
            <li class="flex flex-col gap-3 px-4 py-3" data-testid="budget-category">
              <div class="flex items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium text-foreground">{{ budget.category.name }}</p>
                  @if (sinceLabel(budget); as since) {
                    <p class="text-xs text-muted-foreground">{{ since }}</p>
                  }
                </div>
                <span
                  class="shrink-0 tabular-nums"
                  [class]="
                    hasBudget(budget.amount_cents) ? 'text-foreground' : 'text-muted-foreground'
                  "
                  data-testid="budget-amount"
                  >{{ amountLabel(budget.amount_cents) }}</span
                >
                <button
                  type="button"
                  class="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  [attr.aria-label]="'Historial de ' + budget.category.name"
                  (click)="openHistory(budget.category)"
                >
                  <ng-icon name="lucideHistory" size="18" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  [attr.aria-label]="'Editar presupuesto de ' + budget.category.name"
                  [attr.aria-expanded]="editingId() === budget.category.id"
                  (click)="edit(budget.category.id)"
                >
                  <ng-icon name="lucidePencil" size="18" aria-hidden="true" />
                </button>
              </div>

              @if (actualFor(budget); as item) {
                <div class="flex flex-col gap-1" data-testid="budget-actual">
                  <app-progress-bar
                    [value]="cappedUsage(item)"
                    [label]="'Gastado en ' + budget.category.name"
                    [valueText]="usage(item)"
                    [tone]="tone(item)"
                  />
                  <p class="text-xs text-muted-foreground">
                    Gastado {{ item.actual_cents | eur }} · {{ usage(item) }}
                  </p>
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

  constructor() {
    this.navigator.allowPeriodsAhead(BUDGET_PERIODS_AHEAD);
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
