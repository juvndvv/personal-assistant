import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PeriodLabel } from '../../core/api/models';
import { BUDGETS_PATH, HOME_BUDGETS_SHOWN, topBudgetsByUsage } from './budget-display';
import { BudgetProgressRow } from './budget-progress-row';
import { budgetVsActualSource } from './budget-vs-actual-source';

@Component({
  selector: 'app-budget-card',
  imports: [BudgetProgressRow, RouterLink],
  template: `
    @if (source.report(); as data) {
      <section
        class="rounded-2xl border border-border bg-background p-5"
        aria-labelledby="budget-card-heading"
        data-testid="budget-card"
      >
        <div class="mb-3 flex items-baseline justify-between gap-2">
          <h2 id="budget-card-heading" class="text-lg font-semibold text-foreground">
            Presupuestos
          </h2>
          @if (data.items.length > 0) {
            <a
              routerLink="/informes"
              [queryParams]="{ period: data.period.label }"
              class="text-sm text-primary hover:underline"
              >Ver todos</a
            >
          }
        </div>
        @if (data.items.length === 0) {
          <p class="text-sm text-muted-foreground">
            Fija un límite mensual por categoría para ver cómo vas.
          </p>
          <a
            [routerLink]="budgetsPath"
            [queryParams]="{ period: data.period.label }"
            class="mt-2 inline-block text-sm text-primary hover:underline"
            >Definir presupuestos</a
          >
        } @else {
          <ul class="flex flex-col gap-4" aria-label="Presupuestos más usados">
            @for (item of topItems(); track item.category.id) {
              <li><app-budget-progress-row [item]="item" /></li>
            }
          </ul>
        }
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetCard {
  readonly period = input.required<PeriodLabel | null>();

  protected readonly budgetsPath = BUDGETS_PATH;
  protected readonly source = budgetVsActualSource(this.period);
  protected readonly topItems = computed(() =>
    topBudgetsByUsage(this.source.report()?.items ?? [], HOME_BUDGETS_SHOWN),
  );
}
