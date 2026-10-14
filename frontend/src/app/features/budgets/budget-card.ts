import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PeriodLabel } from '../../core/api/models';
import { UiAlert, UiCard, UiSkeleton } from '../../shared/ui';
import { BUDGETS_PATH, HOME_BUDGETS_SHOWN, topBudgetsByUsage } from './budget-display';
import { BudgetProgressRow } from './budget-progress-row';
import { budgetVsActualSource } from './budget-vs-actual-source';

@Component({
  selector: 'app-budget-card',
  imports: [BudgetProgressRow, RouterLink, UiAlert, UiCard, UiSkeleton],
  template: `
    <section uiCard padding="lg" aria-labelledby="budget-card-heading" data-testid="budget-card">
      <div class="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="budget-card-heading" class="text-lg font-semibold text-foreground">Presupuestos</h2>
        @if (source.report()?.items?.length) {
          <a
            routerLink="/informes"
            [queryParams]="{ period: source.report()?.period?.label }"
            class="text-sm font-medium text-link hover:underline"
            >Ver todos</a
          >
        }
      </div>
      @if (source.failed()) {
        <ui-alert retryable (retry)="source.reload()">
          No se pudieron cargar los presupuestos.
        </ui-alert>
      } @else if (source.report(); as data) {
        @if (data.items.length === 0) {
          <p class="text-sm text-muted-foreground">
            Fija un límite mensual por categoría para ver cómo vas.
          </p>
          <a
            [routerLink]="budgetsPath"
            [queryParams]="{ period: data.period.label }"
            class="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline"
            >Definir presupuestos</a
          >
        } @else {
          <ul class="flex flex-col gap-4" aria-label="Presupuestos más usados">
            @for (item of topItems(); track item.category.id) {
              <li><app-budget-progress-row [item]="item" /></li>
            }
          </ul>
        }
      } @else {
        <div role="status" aria-live="polite" class="flex flex-col gap-5">
          <span class="sr-only">Cargando presupuestos</span>
          @for (row of placeholders; track row) {
            <div>
              <ui-skeleton width="40%" />
              <ui-skeleton class="mt-2" height="0.5rem" />
              <ui-skeleton class="mt-2" width="55%" />
            </div>
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetCard {
  readonly period = input.required<PeriodLabel | null>();

  protected readonly budgetsPath = BUDGETS_PATH;
  protected readonly placeholders = [0, 1, 2];
  protected readonly source = budgetVsActualSource(this.period);
  protected readonly topItems = computed(() =>
    topBudgetsByUsage(this.source.report()?.items ?? [], HOME_BUDGETS_SHOWN),
  );
}
