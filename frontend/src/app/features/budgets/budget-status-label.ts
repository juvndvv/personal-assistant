import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheck, lucideTriangleAlert } from '@ng-icons/lucide';
import { BudgetStatus } from '../../core/api/models';
import { BUDGET_STATUS_LABELS } from './budget-display';

interface StatusStyle {
  icon: string;
  iconColor: string;
  pill: string;
}

const STATUS_STYLES: Record<BudgetStatus, StatusStyle> = {
  ok: { icon: 'lucideCircleCheck', iconColor: 'text-success-text', pill: 'bg-tint-green' },
  warning: { icon: 'lucideTriangleAlert', iconColor: 'text-warning-text', pill: 'bg-tint-orange' },
  over: { icon: 'lucideCircleAlert', iconColor: 'text-danger-text', pill: 'bg-tint-red' },
};

@Component({
  selector: 'app-budget-status-label',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCircleAlert, lucideCircleCheck, lucideTriangleAlert })],
  template: `
    <span
      class="inline-flex items-center gap-1 rounded-capsule px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-foreground"
      [class]="style().pill"
      [attr.data-status]="status()"
    >
      <ng-icon
        [name]="style().icon"
        size="14"
        aria-hidden="true"
        class="shrink-0"
        [class]="style().iconColor"
      />
      {{ label() }}
    </span>
  `,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetStatusLabel {
  readonly status = input.required<BudgetStatus>();

  protected readonly style = computed(() => STATUS_STYLES[this.status()]);
  protected readonly label = computed(() => BUDGET_STATUS_LABELS[this.status()]);
}
