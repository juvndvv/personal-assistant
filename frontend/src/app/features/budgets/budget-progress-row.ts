import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BudgetVsActualItem } from '../../core/api/models';
import { EurPipe } from '../../core/money/eur.pipe';
import { ProgressBar, formatBasisPoints } from '../../shared/charts';
import { CategoryIcon } from '../categories/category-icon';
import { LedgerReferenceData } from '../transactions/reference-data';
import { BUDGET_STATUS_TONES, remainingLabel } from './budget-display';
import { BudgetStatusLabel } from './budget-status-label';

const FULL_BP = 10_000;

@Component({
  selector: 'app-budget-progress-row',
  imports: [BudgetStatusLabel, CategoryIcon, EurPipe, ProgressBar],
  template: `
    <div class="flex flex-col gap-1.5" data-testid="budget-row">
      <div class="flex items-center gap-3 text-sm">
        <app-category-icon size="sm" [icon]="visual().icon" [color]="visual().color" />
        <span
          class="min-w-0 flex-1 truncate font-medium text-foreground"
          data-testid="budget-name"
          >{{ item().category.name }}</span
        >
        <app-budget-status-label data-testid="budget-status" [status]="item().status" />
      </div>
      <app-progress-bar
        [value]="cappedUsage()"
        [max]="fullBp"
        [label]="'Presupuesto de ' + item().category.name"
        [valueText]="usage() + ' usado'"
        [tone]="tone()"
      />
      <div class="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span class="text-muted-foreground tabular-nums" data-testid="budget-spent">
          <span class="amount text-foreground">{{ item().actual_cents | eur }}</span>
          de {{ item().budget_cents | eur }}
          <span class="ms-1 text-xs" data-testid="budget-usage">{{ usage() }}</span>
        </span>
        <span
          class="text-xs tabular-nums"
          [class]="
            item().remaining_cents < 0 ? 'font-semibold text-danger-text' : 'text-muted-foreground'
          "
          data-testid="budget-remaining"
          >{{ remaining() }}</span
        >
      </div>
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetProgressRow {
  private readonly reference = inject(LedgerReferenceData);

  readonly item = input.required<BudgetVsActualItem>();

  protected readonly fullBp = FULL_BP;
  protected readonly cappedUsage = computed(() => Math.min(this.item().used_bp, FULL_BP));
  protected readonly usage = computed(() => formatBasisPoints(this.item().used_bp));
  protected readonly tone = computed(() => BUDGET_STATUS_TONES[this.item().status]);
  protected readonly visual = computed(() => this.reference.visualOf(this.item().category.id));
  protected readonly remaining = computed(() => remainingLabel(this.item()));
}
