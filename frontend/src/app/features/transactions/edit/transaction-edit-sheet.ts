import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHistory } from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { serverMessage } from '../../../core/api/api-error';
import { EntryType, Transaction, TransactionPatch } from '../../../core/api/models';
import { TransactionsApi } from '../../../core/api/transactions.api';
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiDateInput,
  UiInput,
  UiMoneyInput,
  UiSegmented,
  UiSelect,
  UiSheet,
  UiSheetFooter,
  UiToast,
} from '../../../shared/ui';
import { HISTORY_SUGGESTION_LABEL, injectCategorizationAssist } from '../categorization-assist';
import { EntryErrors, entryErrorsFrom, optionalText } from '../entry-errors';
import { MovementActions } from '../movement-actions';
import { MovementSheets } from '../movement-sheets';
import { ReceiptsGallery } from '../receipts/receipts-gallery';
import { LedgerReferenceData } from '../reference-data';
import { ReferenceLoadAlert } from '../reference-load-alert';
import { TagInput } from '../tag-input/tag-input';

function idOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
];

@Component({
  selector: 'app-transaction-edit-sheet',
  imports: [
    NgIcon,
    ReceiptsGallery,
    ReferenceLoadAlert,
    TagInput,
    UiAlert,
    UiBadge,
    UiButton,
    UiDateInput,
    UiInput,
    UiMoneyInput,
    UiSegmented,
    UiSelect,
    UiSheet,
    UiSheetFooter,
  ],
  providers: [provideIcons({ lucideHistory })],
  template: `
    <ui-sheet
      [open]="transaction() !== null"
      (openChange)="onOpenChange($event)"
      [title]="isAdjustment() ? 'Editar ajuste de saldo' : 'Editar movimiento'"
      [description]="
        isAdjustment()
          ? 'Indica el saldo real en la fecha. Recalcularemos la diferencia sin contar este ajuste.'
          : undefined
      "
    >
      <form class="flex flex-col gap-5 pb-2" novalidate (submit)="submit($event)">
        @if (failure(); as message) {
          <ui-alert>{{ message }}</ui-alert>
        }
        @if (!isAdjustment()) {
          <app-reference-load-alert />
        }
        @if (isAdjustment()) {
          <ui-money-input
            label="Saldo real"
            name="target_balance_cents"
            [required]="true"
            [allowNegative]="true"
            [(value)]="target"
            [state]="errors().target_balance_cents ? 'error' : 'default'"
            [hint]="errors().target_balance_cents"
          />
        } @else {
          <ui-segmented
            ariaLabel="Tipo de movimiento"
            onGlass
            [options]="typeOptions"
            [value]="type()"
            (valueChange)="changeType($event)"
          />
          <ui-money-input
            label="Importe"
            name="amount_cents"
            [required]="true"
            [(value)]="amount"
            [state]="errors().amount_cents ? 'error' : 'default'"
            [hint]="errors().amount_cents"
          />
          <ui-select
            label="Categoría"
            name="category_id"
            placeholder="Elige una categoría"
            [required]="true"
            [options]="categoryOptions()"
            [value]="categoryId()"
            (valueChange)="pickCategory($event)"
            [state]="errors().category_id ? 'error' : 'default'"
            [hint]="errors().category_id"
          />
          <ui-select
            label="Cuenta"
            name="account_id"
            placeholder="Elige una cuenta"
            [required]="true"
            [options]="accountOptions()"
            [value]="accountId()"
            (valueChange)="pickAccount($event)"
            [state]="errors().account_id ? 'error' : 'default'"
            [hint]="errors().account_id"
          />
          @if (assist.active()) {
            <div data-testid="history-suggestion">
              <ui-badge tone="primary" variant="soft">
                <ng-icon name="lucideHistory" size="14" aria-hidden="true" />
                {{ historyLabel }}
              </ui-badge>
            </div>
          }
        }
        <ui-date-input
          label="Fecha"
          name="date"
          [required]="true"
          [(value)]="date"
          [state]="errors().date ? 'error' : 'default'"
          [hint]="errors().date"
        />
        @if (!isAdjustment()) {
          <ui-input
            label="Descripción"
            name="description"
            [maxlength]="255"
            [(value)]="description"
            (focusout)="suggestFromHistory()"
          />
          <ui-input
            label="Comercio"
            name="merchant"
            [maxlength]="120"
            [(value)]="merchant"
            (focusout)="suggestFromHistory()"
          />
        }
        <ui-input label="Nota" name="note" [maxlength]="1000" [(value)]="note" />
        @if (!isAdjustment()) {
          <app-tag-input [(tags)]="tags" />
          @if (errors().tags; as message) {
            <p role="alert" class="text-sm text-danger-text">{{ message }}</p>
          }
        }
      </form>
      @if (!isAdjustment()) {
        <div class="mt-2 border-t border-border pt-4 pb-2">
          <app-receipts-gallery [transactionId]="transaction()?.id ?? null" />
        </div>
      }
      <div uiSheetFooter class="flex flex-col gap-2">
        <ui-button [fullWidth]="true" [loading]="saving()" (clicked)="submit($event)">
          Guardar cambios
        </ui-button>
        <ui-button variant="ghost" [fullWidth]="true" (clicked)="remove()">Eliminar</ui-button>
      </div>
    </ui-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionEditSheet {
  private readonly api = inject(TransactionsApi);
  private readonly reference = inject(LedgerReferenceData);
  private readonly sheets = inject(MovementSheets);
  private readonly actions = inject(MovementActions);
  private readonly toast = inject(UiToast);
  protected readonly assist = injectCategorizationAssist();
  protected readonly historyLabel = HISTORY_SUGGESTION_LABEL;

  readonly transaction = input<Transaction | null>(null);
  readonly closed = output<void>();

  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly type = signal<EntryType>('expense');
  protected readonly amount = signal<number | null>(null);
  protected readonly target = signal<number | null>(null);
  protected readonly categoryId = signal<string | null>(null);
  protected readonly accountId = signal<string | null>(null);
  protected readonly date = signal<string | null>(null);
  protected readonly description = signal('');
  protected readonly merchant = signal('');
  protected readonly note = signal('');
  protected readonly tags = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  private readonly serverErrors = signal<EntryErrors>({});
  private readonly attempted = signal(false);

  protected readonly isAdjustment = computed(() => this.transaction()?.type === 'adjustment');

  protected readonly categoryOptions = computed(() =>
    this.reference
      .categoriesOf(this.type())
      .map((category) => ({ value: String(category.id), label: category.label })),
  );
  protected readonly accountOptions = computed(() => {
    const current = this.transaction()?.account.id;
    return this.reference
      .accounts()
      .filter((account) => account.archived_at === null || account.id === current)
      .map((account) => ({ value: String(account.id), label: account.name }));
  });

  private readonly clientErrors = computed<EntryErrors>(() => {
    const errors: EntryErrors = {};
    if (this.date() === null) {
      errors.date = 'Indica la fecha.';
    }
    if (this.isAdjustment()) {
      if (this.target() === null) {
        errors.target_balance_cents = 'Indica el saldo real.';
      }
      return errors;
    }
    const amount = this.amount();
    if (amount === null || amount <= 0) {
      errors.amount_cents = 'Indica un importe mayor que cero.';
    }
    if (this.categoryId() === null) {
      errors.category_id = 'Elige una categoría.';
    }
    if (this.accountId() === null) {
      errors.account_id = 'Elige una cuenta.';
    }
    return errors;
  });

  protected readonly errors = computed<EntryErrors>(() => ({
    ...this.serverErrors(),
    ...(this.attempted() ? this.clientErrors() : {}),
  }));

  constructor() {
    effect(() => {
      const transaction = this.transaction();
      if (transaction !== null) {
        untracked(() => this.prepare(transaction));
      }
    });
  }

  protected onOpenChange(open: boolean): void {
    if (!open) {
      this.closed.emit();
    }
  }

  protected changeType(value: string): void {
    const type: EntryType = value === 'income' ? 'income' : 'expense';
    if (type !== this.type()) {
      this.type.set(type);
      this.categoryId.set(null);
      this.assist.typeChanged();
      this.suggestFromHistory();
    }
  }

  protected pickCategory(id: string | null): void {
    this.categoryId.set(id);
    this.assist.touchCategory();
  }

  protected pickAccount(id: string | null): void {
    this.accountId.set(id);
    this.assist.touchAccount();
  }

  protected suggestFromHistory(): void {
    if (this.isAdjustment()) {
      return;
    }
    void this.assist.lookup(
      { type: this.type(), merchant: this.merchant(), description: this.description() },
      {
        acceptsCategory: (id) =>
          this.reference.categoriesOf(this.type()).some((category) => category.id === id),
        acceptsAccount: (id) => this.accountOptions().some((option) => option.value === String(id)),
        currentCategory: () => idOrNull(this.categoryId()),
        currentAccount: () => idOrNull(this.accountId()),
        applyCategory: (id) => this.categoryId.set(id === null ? null : String(id)),
        applyAccount: (id) => this.accountId.set(id === null ? null : String(id)),
      },
    );
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const transaction = this.transaction();
    if (transaction === null || this.saving()) {
      return;
    }
    this.attempted.set(true);
    this.serverErrors.set({});
    this.failure.set(null);
    const patch = this.buildPatch();
    if (Object.keys(this.clientErrors()).length > 0 || patch === null) {
      return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.update(transaction.id, patch));
      this.sheets.notifyChanged();
      this.toast.success('Movimiento actualizado');
      this.closed.emit();
    } catch (error: unknown) {
      const known = entryErrorsFrom(error);
      if (known === null || Object.keys(known).length === 0) {
        this.failure.set(serverMessage(error) ?? 'No se pudo guardar el movimiento.');
      } else {
        this.serverErrors.set(known);
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const transaction = this.transaction();
    if (transaction !== null && (await this.actions.delete(transaction))) {
      this.closed.emit();
    }
  }

  private buildPatch(): TransactionPatch | null {
    const date = this.date();
    if (date === null) {
      return null;
    }
    if (this.isAdjustment()) {
      const target = this.target();
      return target === null
        ? null
        : { date, target_balance_cents: target, note: optionalText(this.note()) };
    }
    const amount = this.amount();
    const categoryId = this.categoryId();
    const accountId = this.accountId();
    if (amount === null || categoryId === null || accountId === null) {
      return null;
    }
    return {
      type: this.type(),
      amount_cents: amount,
      date,
      account_id: Number(accountId),
      category_id: Number(categoryId),
      description: optionalText(this.description()),
      merchant: optionalText(this.merchant()),
      note: optionalText(this.note()),
      tags: this.tags(),
    };
  }

  private prepare(transaction: Transaction): void {
    void this.reference.ensureLoaded().catch(() => undefined);
    this.type.set(transaction.type === 'income' ? 'income' : 'expense');
    this.amount.set(transaction.amount_cents);
    this.target.set(transaction.adjustment_target_cents);
    this.categoryId.set(transaction.category === null ? null : String(transaction.category.id));
    this.accountId.set(String(transaction.account.id));
    this.date.set(transaction.date);
    this.description.set(transaction.description ?? '');
    this.merchant.set(transaction.merchant ?? '');
    this.note.set(transaction.note ?? '');
    this.tags.set(transaction.tags.map((tag) => tag.name));
    this.assist.reset(this.type(), {
      merchant: this.merchant(),
      description: this.description(),
    });
    if (this.categoryId() !== null) {
      this.assist.touchCategory();
    }
    this.assist.touchAccount();
    this.failure.set(null);
    this.serverErrors.set({});
    this.attempted.set(false);
  }
}
