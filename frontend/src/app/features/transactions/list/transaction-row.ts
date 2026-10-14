import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeftRight,
  lucideEllipsisVertical,
  lucidePaperclip,
  lucideScale,
} from '@ng-icons/lucide';
import { Transaction } from '../../../core/api/models';
import { EurPipe } from '../../../core/money/eur.pipe';
import { CategoryIcon } from '../../categories/category-icon';
import { LedgerReferenceData, categoryVisual } from '../reference-data';
import {
  TRANSACTION_ORIGIN_LABELS,
  transactionAmount,
  transactionSubtitle,
  transactionTitle,
} from '../transaction-display';

@Component({
  selector: 'app-transaction-row',
  imports: [CategoryIcon, CdkMenu, CdkMenuItem, CdkMenuTrigger, EurPipe, NgIcon],
  providers: [
    provideIcons({
      lucideArrowLeftRight,
      lucideEllipsisVertical,
      lucidePaperclip,
      lucideScale,
    }),
  ],
  host: { class: 'block' },
  template: `
    <div class="flex h-16 items-center gap-1 ps-4 pe-1.5" data-testid="transaction-row">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-3 self-stretch text-start"
        [attr.aria-label]="'Editar ' + title()"
        (click)="edit.emit(transaction())"
      >
        @if (category(); as visual) {
          <app-category-icon [icon]="visual.icon" [color]="visual.color" size="md" />
        } @else {
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill-on-card text-transfer"
            aria-hidden="true"
            data-testid="movement-icon"
          >
            <ng-icon [name]="neutralIcon()" size="20" />
          </span>
        }
        <span class="min-w-0 flex-1">
          <span class="flex min-w-0 items-center gap-1.5">
            <span class="truncate font-medium text-foreground">{{ title() }}</span>
            @if (transaction().origin === 'recurring') {
              <span
                class="shrink-0 rounded-capsule bg-tint-blue px-2 text-xs leading-5 font-medium text-info-text"
                data-testid="origin-badge"
                >{{ recurringLabel }}</span
              >
            }
          </span>
          <span class="block truncate text-sm text-muted-foreground">
            {{ subtitle() }}
            @for (tag of transaction().tags; track tag.id) {
              <span class="ms-1 text-link">#{{ tag.name }}</span>
            }
          </span>
        </span>
        @if (transaction().attachments_count > 0) {
          <ng-icon
            name="lucidePaperclip"
            size="14"
            class="shrink-0 text-muted-foreground"
            aria-label="Con justificante"
          />
        }
        <span
          class="amount shrink-0 text-base"
          [class]="amountClass()"
          data-testid="transaction-amount"
        >
          {{ amount().cents | eur: { signed: amount().signed } }}
        </span>
      </button>
      <button
        type="button"
        class="flex size-11 shrink-0 items-center justify-center rounded-capsule text-muted-foreground transition-colors duration-150 hover:bg-hover active:bg-pressed"
        [attr.aria-label]="'Acciones de ' + title()"
        [cdkMenuTriggerFor]="actions"
      >
        <ng-icon name="lucideEllipsisVertical" size="18" aria-hidden="true" />
      </button>
    </div>
    <ng-template #actions>
      <div
        cdkMenu
        class="glass-menu min-w-44 rounded-menu p-1.5 text-[0.9375rem] text-popover-foreground"
      >
        <button
          cdkMenuItem
          type="button"
          class="flex min-h-11 w-full items-center rounded-menu-item px-3 text-start transition-colors duration-150 hover:bg-hover focus-visible:bg-hover"
          (cdkMenuItemTriggered)="edit.emit(transaction())"
        >
          Editar
        </button>
        <button
          cdkMenuItem
          type="button"
          class="flex min-h-11 w-full items-center rounded-menu-item px-3 text-start text-danger-text transition-colors duration-150 hover:bg-hover focus-visible:bg-hover"
          (cdkMenuItemTriggered)="remove.emit(transaction())"
        >
          Eliminar
        </button>
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionRow {
  private readonly reference = inject(LedgerReferenceData);

  readonly transaction = input.required<Transaction>();
  readonly accountScoped = input(false);
  readonly edit = output<Transaction>();
  readonly remove = output<Transaction>();

  protected readonly recurringLabel = TRANSACTION_ORIGIN_LABELS.recurring;
  protected readonly title = computed(() => transactionTitle(this.transaction()));
  protected readonly subtitle = computed(() => transactionSubtitle(this.transaction()));
  protected readonly amount = computed(() =>
    transactionAmount(this.transaction(), this.accountScoped()),
  );
  protected readonly amountClass = computed(() => {
    const { cents, signed } = this.amount();
    if (!signed) {
      return 'text-transfer';
    }
    return cents > 0 ? 'text-income' : 'text-expense';
  });
  protected readonly neutralIcon = computed(() =>
    this.transaction().type === 'adjustment' ? 'lucideScale' : 'lucideArrowLeftRight',
  );
  protected readonly category = computed(() => {
    const transaction = this.transaction();
    if (transaction.type === 'transfer' || transaction.type === 'adjustment') {
      return null;
    }
    const categoryId = transaction.category?.id;
    const category =
      categoryId === undefined ? undefined : this.reference.categoryById().get(categoryId);
    return categoryVisual(category ?? { icon: null, color: null });
  });
}
