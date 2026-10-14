import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PeriodLabel } from '../../core/api/models';
import { EurPipe } from '../../core/money/eur.pipe';
import { BUDGETS_PATH } from './budget-display';
import { BudgetProgressRow } from './budget-progress-row';
import { budgetVsActualSource } from './budget-vs-actual-source';

@Component({
  selector: 'app-budget-vs-actual-section',
  imports: [BudgetProgressRow, EurPipe, RouterLink],
  template: `
    <section
      class="rounded-2xl border border-border bg-background p-5"
      aria-labelledby="budget-vs-actual-heading"
      data-testid="budget-vs-actual"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="budget-vs-actual-heading" class="text-lg font-semibold text-foreground">
          Presupuesto vs real
        </h2>
        @if (source.report()?.items?.length) {
          <a
            [routerLink]="budgetsPath"
            [queryParams]="{ period: period() }"
            class="text-sm text-primary-text hover:underline"
            >Editar presupuestos</a
          >
        }
      </div>

      @if (source.failed()) {
        <p role="alert" class="mt-2 text-sm text-destructive">
          No se pudo cargar el presupuesto de este periodo.
        </p>
      } @else if (source.report(); as data) {
        @if (data.items.length === 0) {
          <p class="mt-2 text-sm text-muted-foreground">No tienes presupuestos en este periodo.</p>
          <a
            [routerLink]="budgetsPath"
            [queryParams]="{ period: period() }"
            class="mt-2 inline-block text-sm text-primary-text hover:underline"
            >Definir presupuestos</a
          >
        } @else {
          <p class="mt-1 text-sm text-muted-foreground" data-testid="budget-totals">
            Gastado
            <span class="font-semibold tabular-nums text-foreground"
              >{{ data.actual_budgeted_cents | eur }} de {{ data.budgeted_cents | eur }}</span
            >
            en categorías con presupuesto
          </p>
          <ul class="mt-4 flex flex-col gap-4" aria-label="Presupuestos por categoría">
            @for (item of data.items; track item.category.id) {
              <li><app-budget-progress-row [item]="item" /></li>
            }
          </ul>
          <p class="mt-4 text-xs text-muted-foreground" data-testid="unbudgeted-actual">
            Gasto sin presupuesto: {{ data.unbudgeted_actual_cents | eur }}
          </p>
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetVsActualSection {
  readonly period = input.required<PeriodLabel | null>();

  protected readonly budgetsPath = BUDGETS_PATH;
  protected readonly source = budgetVsActualSource(this.period);
}
