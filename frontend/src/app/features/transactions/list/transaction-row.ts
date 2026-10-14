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
import { CATEGORY_ICON_SVGS, iconNameFor } from '../../categories/category-appearance';
import { LedgerReferenceData } from '../reference-data';
import {
  TRANSACTION_ORIGIN_LABELS,
  transactionAmount,
  transactionSubtitle,
  transactionTitle,
} from '../transaction-display';

@Component({
  selector: 'app-transaction-row',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger, EurPipe, NgIcon],
  providers: [
    provideIcons({
      ...CATEGORY_ICON_SVGS,
      lucideArrowLeftRight,
      lucideEllipsisVertical,
      lucidePaperclip,
      lucideScale,
    }),
  ],
  host: { class: 'block' },
  template: `
    <div class="flex h-16 items-center gap-3 px-3" data-testid="transaction-row">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-3 text-start"
        [attr.aria-label]="'Editar ' + title()"
        (click)="edit.emit(transaction())"
      >
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <ng-icon [name]="icon()" size="18" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex min-w-0 items-center gap-1.5">
            <span class="truncate font-medium text-foreground">{{ title() }}</span>
            @if (transaction().origin === 'recurring') {
              <span
                class="shrink-0 rounded-md bg-info/15 px-1.5 py-px text-[0.6875rem] font-medium text-info-text"
                data-testid="origin-badge"
                >{{ recurringLabel }}</span
              >
            }
          </span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ subtitle() }}
            @for (tag of transaction().tags; track tag.id) {
              <span class="ms-1 text-primary-text">#{{ tag.name }}</span>
            }
          </span>
        </span>
        @if (transaction().attachments_count > 0) {
          <ng-icon
            name="lucidePaperclip"
            size="14"
            class="text-muted-foreground"
            aria-label="Con justificante"
          />
        }
        <span
          class="shrink-0 font-medium tabular-nums"
          [class]="amountClass()"
          data-testid="transaction-amount"
        >
          {{ amount().cents | eur: { signed: amount().signed } }}
        </span>
      </button>
      <button
        type="button"
        class="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        [attr.aria-label]="'Acciones de ' + title()"
        [cdkMenuTriggerFor]="actions"
      >
        <ng-icon name="lucideEllipsisVertical" size="18" aria-hidden="true" />
      </button>
    </div>
    <ng-template #actions>
      <div
        cdkMenu
        class="min-w-40 rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
      >
        <button
          cdkMenuItem
          type="button"
          class="block w-full rounded-md px-3 py-2 text-start hover:bg-muted"
          (cdkMenuItemTriggered)="edit.emit(transaction())"
        >
          Editar
        </button>
        <button
          cdkMenuItem
          type="button"
          class="block w-full rounded-md px-3 py-2 text-start text-destructive hover:bg-muted"
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
      return 'text-foreground';
    }
    return cents < 0 ? 'text-foreground' : 'text-success-text';
  });
  protected readonly icon = computed(() => {
    const transaction = this.transaction();
    if (transaction.type === 'transfer') {
      return 'lucideArrowLeftRight';
    }
    if (transaction.type === 'adjustment') {
      return 'lucideScale';
    }
    const categoryId = transaction.category?.id;
    const category =
      categoryId === undefined ? undefined : this.reference.categoryById().get(categoryId);
    return iconNameFor(category?.icon ?? null);
  });
}
