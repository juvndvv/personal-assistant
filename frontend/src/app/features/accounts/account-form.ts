import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { ACCOUNT_TYPES, Account, AccountInput, AccountType } from '../../core/api/models';
import { compareIsoDates, todayInMadrid } from '../../core/date/iso-date';
import {
  UiButton,
  UiDateInput,
  UiInput,
  UiMoneyInput,
  UiSelect,
  UiSelectOption,
} from '../../shared/ui';
import { ACCOUNT_TYPE_LABELS } from './account-types';

const NAME_MAX_LENGTH = 80;
const STATEMENT_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);

export type AccountFormErrors = Partial<Record<keyof AccountInput, string>>;

@Component({
  selector: 'app-account-form',
  imports: [UiButton, UiDateInput, UiInput, UiMoneyInput, UiSelect],
  template: `
    <form class="flex flex-col gap-5" novalidate (submit)="submit($event)">
      <ui-input
        label="Nombre"
        name="name"
        [required]="true"
        [maxlength]="nameMaxLength"
        [(value)]="name"
        [state]="errors().name ? 'error' : 'default'"
        [hint]="errors().name"
      />

      <ui-select
        label="Tipo"
        name="type"
        [required]="true"
        [options]="typeOptions"
        [value]="type()"
        (valueChange)="onTypeChange($event)"
        [state]="errors().type ? 'error' : 'default'"
        [hint]="errors().type"
      />

      <ui-money-input
        label="Saldo inicial"
        name="opening_balance_cents"
        [required]="true"
        allowNegative
        [(value)]="openingBalance"
        [state]="errors().opening_balance_cents ? 'error' : 'default'"
        [hint]="errors().opening_balance_cents ?? openingBalanceHint()"
      />

      <ui-date-input
        label="Fecha del saldo inicial"
        name="opening_date"
        [required]="true"
        [max]="today"
        [(value)]="openingDate"
        [state]="errors().opening_date ? 'error' : 'default'"
        [hint]="errors().opening_date"
      />

      @if (isCard()) {
        <ui-select
          label="Día de corte"
          name="statement_day"
          placeholder="Sin día de corte"
          [options]="statementDayOptions"
          [(value)]="statementDay"
          [state]="errors().statement_day ? 'error' : 'default'"
          [hint]="errors().statement_day ?? 'Día del mes en que cierra el extracto.'"
        />

        <ui-select
          label="Cuenta de pago"
          name="settlement_account_id"
          placeholder="Sin cuenta de pago"
          [options]="settlementOptions()"
          [(value)]="settlementAccountId"
          [state]="errors().settlement_account_id ? 'error' : 'default'"
          [hint]="errors().settlement_account_id ?? 'Cuenta desde la que se paga la tarjeta.'"
        />
      }

      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ui-button variant="outline" (clicked)="cancelled.emit()">Cancelar</ui-button>
        <ui-button type="submit" [loading]="saving()">{{ submitLabel() }}</ui-button>
      </div>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountForm {
  readonly account = input<Account | null>(null);
  readonly settlementCandidates = input<readonly Account[]>([]);
  readonly serverErrors = input<AccountFormErrors>({});
  readonly saving = input(false, { transform: booleanAttribute });

  readonly submitted = output<AccountInput>();
  readonly cancelled = output<void>();

  protected readonly today = todayInMadrid();
  protected readonly nameMaxLength = NAME_MAX_LENGTH;
  protected readonly typeOptions: UiSelectOption[] = ACCOUNT_TYPES.map((type) => ({
    value: type,
    label: ACCOUNT_TYPE_LABELS[type],
  }));
  protected readonly statementDayOptions: UiSelectOption[] = STATEMENT_DAYS.map((day) => ({
    value: String(day),
    label: String(day),
  }));

  protected readonly name = linkedSignal(() => this.account()?.name ?? '');
  protected readonly type = linkedSignal<AccountType>(() => this.account()?.type ?? 'checking');
  protected readonly openingBalance = linkedSignal<number | null>(
    () => this.account()?.opening_balance_cents ?? 0,
  );
  protected readonly openingDate = linkedSignal<string | null>(
    () => this.account()?.opening_date ?? this.today,
  );
  protected readonly statementDay = linkedSignal<string | null>(() =>
    toOptionValue(this.account()?.statement_day),
  );
  protected readonly settlementAccountId = linkedSignal<string | null>(() =>
    toOptionValue(this.account()?.settlement_account_id),
  );

  private readonly attempted = signal(false);

  protected readonly isCard = computed(() => this.type() === 'credit_card');
  protected readonly submitLabel = computed(() =>
    this.account() === null ? 'Crear cuenta' : 'Guardar cambios',
  );
  protected readonly openingBalanceHint = computed(() =>
    this.isCard() ? 'Si debes dinero en la tarjeta, usa un importe negativo.' : undefined,
  );
  protected readonly settlementOptions = computed<UiSelectOption[]>(() =>
    this.settlementCandidates()
      .filter(
        (candidate) =>
          candidate.type !== 'credit_card' &&
          candidate.archived_at === null &&
          candidate.id !== this.account()?.id,
      )
      .map((candidate) => ({ value: String(candidate.id), label: candidate.name })),
  );

  private readonly clientErrors = computed<AccountFormErrors>(() => {
    const errors: AccountFormErrors = {};
    const name = this.name().trim();
    if (name === '') {
      errors.name = 'Escribe un nombre para la cuenta.';
    } else if (name.length > NAME_MAX_LENGTH) {
      errors.name = `El nombre no puede superar ${NAME_MAX_LENGTH} caracteres.`;
    }
    const openingBalance = this.openingBalance();
    if (openingBalance === null) {
      errors.opening_balance_cents = 'Indica el saldo inicial (puede ser 0).';
    }
    const openingDate = this.openingDate();
    if (openingDate === null) {
      errors.opening_date = 'Indica la fecha del saldo inicial.';
    } else if (compareIsoDates(openingDate, this.today) > 0) {
      errors.opening_date = 'La fecha no puede ser futura.';
    }
    return errors;
  });

  protected readonly errors = computed<AccountFormErrors>(() => ({
    ...this.serverErrors(),
    ...(this.attempted() ? this.clientErrors() : {}),
  }));

  protected onTypeChange(value: string | null): void {
    if (isAccountType(value)) {
      this.type.set(value);
    }
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.attempted.set(true);
    if (Object.keys(this.clientErrors()).length > 0) {
      return;
    }
    const payload: AccountInput = {
      name: this.name().trim(),
      type: this.type(),
      opening_balance_cents: this.openingBalance() ?? 0,
      opening_date: this.openingDate() ?? this.today,
    };
    if (this.isCard()) {
      payload.statement_day = toNumberOrNull(this.statementDay());
      payload.settlement_account_id = toNumberOrNull(this.settlementAccountId());
    }
    this.submitted.emit(payload);
  }
}

function isAccountType(value: string | null): value is AccountType {
  return (ACCOUNT_TYPES as readonly (string | null)[]).includes(value);
}

function toOptionValue(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toNumberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}
