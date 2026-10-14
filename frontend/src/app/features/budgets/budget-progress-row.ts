import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BudgetVsActualItem } from '../../core/api/models';
import { EurPipe } from '../../core/money/eur.pipe';
import { ProgressBar, formatBasisPoints } from '../../shared/charts';
import { UiBadge, UiBadgeTone } from '../../shared/ui';
import { BUDGET_STATUS_LABELS, BUDGET_STATUS_TONES, remainingLabel } from './budget-display';

const FULL_BP = 10_000;

const BADGE_TONES: Record<BudgetVsActualItem['status'], UiBadgeTone> = {
  ok: 'success',
  warning: 'warning',
  over: 'danger',
};

@Component({
  selector: 'app-budget-progress-row',
  imports: [EurPipe, ProgressBar, UiBadge],
  template: `
    <div class="flex flex-col gap-1.5" data-testid="budget-row">
      <div class="flex items-baseline justify-between gap-3 text-sm">
        <span class="truncate font-medium text-foreground" data-testid="budget-name">{{
          item().category.name
        }}</span>
        <span data-testid="budget-status">
          <ui-badge [tone]="badgeTone()">{{ statusLabel() }}</ui-badge>
        </span>
      </div>
      <app-progress-bar
        [value]="cappedUsage()"
        [max]="fullBp"
        [label]="'Presupuesto de ' + item().category.name"
        [valueText]="usage() + ' usado'"
        [tone]="tone()"
      />
      <div class="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span class="tabular-nums text-foreground" data-testid="budget-spent">
          {{ item().actual_cents | eur }} de {{ item().budget_cents | eur }}
          <span class="ms-1 text-muted-foreground" data-testid="budget-usage">{{ usage() }}</span>
        </span>
        <span
          class="tabular-nums"
          [class]="item().remaining_cents < 0 ? 'text-destructive' : 'text-muted-foreground'"
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
  readonly item = input.required<BudgetVsActualItem>();

  protected readonly fullBp = FULL_BP;
  protected readonly cappedUsage = computed(() => Math.min(this.item().used_bp, FULL_BP));
  protected readonly usage = computed(() => formatBasisPoints(this.item().used_bp));
  protected readonly tone = computed(() => BUDGET_STATUS_TONES[this.item().status]);
  protected readonly badgeTone = computed(() => BADGE_TONES[this.item().status]);
  protected readonly statusLabel = computed(() => BUDGET_STATUS_LABELS[this.item().status]);
  protected readonly remaining = computed(() => remainingLabel(this.item()));
}
