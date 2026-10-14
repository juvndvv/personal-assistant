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
import {
  RECURRING_FREQUENCIES,
  RecurringFrequency,
  RecurringTemplate,
  RecurringTemplateInput,
  RecurringType,
} from '../../core/api/models';
import { compareIsoDates, todayInMadrid } from '../../core/date/iso-date';
import {
  UiButton,
  UiCheckbox,
  UiDateInput,
  UiInput,
  UiMoneyInput,
  UiSegmented,
  UiSelect,
  UiSelectOption,
} from '../../shared/ui';
import { optionalText } from '../transactions/entry-errors';
import { CategoryOption } from '../transactions/reference-data';
import { FREQUENCY_LABELS } from './recurring-display';

const NAME_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 255;
const MERCHANT_MAX_LENGTH = 120;
const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, index) => index + 1);
const VARIABLE_EXPLANATION =
  'Cada vez que llegue la fecha te pediremos el importe real antes de registrarlo. Hasta que lo confirmes no afectará a tus saldos.';
const DAY_HINT = 'Si el mes tiene menos días, se usará el último día del mes.';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
];

export interface RecurringAccountOption {
  id: number;
  name: string;
}

export type RecurringTemplateFormErrors = Partial<Record<keyof RecurringTemplateInput, string>>;

@Component({
  selector: 'app-recurring-template-form',
  imports: [UiButton, UiCheckbox, UiDateInput, UiInput, UiMoneyInput, UiSegmented, UiSelect],
  template: `
    <form class="flex flex-col gap-5" novalidate (submit)="submit($event)">
      <div class="flex flex-col gap-1.5">
        <ui-segmented
          ariaLabel="Tipo de fijo"
          [options]="typeOptions"
          [value]="type()"
          (valueChange)="changeType($event)"
        />
        @if (errors().type; as message) {
          <p role="alert" class="text-xs text-danger-text">{{ message }}</p>
        }
      </div>

      <ui-input
        label="Nombre"
        name="name"
        placeholder="Alquiler, nómina, luz…"
        [required]="true"
        [maxlength]="nameMaxLength"
        [(value)]="name"
        [state]="stateOf('name')"
        [hint]="errors().name"
      />

      <div class="flex flex-col gap-1.5">
        <ui-checkbox name="is_variable" [(checked)]="isVariable">Importe variable</ui-checkbox>
        @if (isVariable()) {
          <p class="text-xs text-muted-foreground" data-testid="variable-explanation">
            {{ variableExplanation }}
          </p>
        }
      </div>

      <ui-money-input
        [label]="isVariable() ? 'Importe estimado' : 'Importe'"
        name="amount_cents"
        [required]="true"
        [(value)]="amount"
        [state]="stateOf('amount_cents')"
        [hint]="errors().amount_cents"
      />

      <ui-select
        label="Cuenta"
        name="account_id"
        placeholder="Elige una cuenta"
        [required]="true"
        [options]="accountOptions()"
        [(value)]="accountId"
        [state]="stateOf('account_id')"
        [hint]="errors().account_id"
      />

      <ui-select
        label="Categoría"
        name="category_id"
        placeholder="Elige una categoría"
        [required]="true"
        [options]="categoryOptions()"
        [(value)]="categoryId"
        [state]="stateOf('category_id')"
        [hint]="errors().category_id"
      />

      <div class="grid gap-5 sm:grid-cols-2">
        <ui-select
          label="Frecuencia"
          name="frequency"
          [required]="true"
          [options]="frequencyOptions"
          [value]="frequency()"
          (valueChange)="changeFrequency($event)"
          [state]="stateOf('frequency')"
          [hint]="errors().frequency"
        />
        <ui-select
          label="Día del mes"
          name="day_of_month"
          [required]="true"
          [options]="dayOptions"
          [value]="dayOfMonth()"
          (valueChange)="dayOfMonth.set($event ?? dayOfMonth())"
          [state]="stateOf('day_of_month')"
          [hint]="errors().day_of_month ?? dayHint"
        />
      </div>

      <div class="grid gap-5 sm:grid-cols-2">
        <ui-date-input
          label="Empieza el"
          name="starts_on"
          [required]="true"
          [(value)]="startsOn"
          [state]="stateOf('starts_on')"
          [hint]="errors().starts_on"
        />
        <ui-date-input
          label="Termina el"
          name="ends_on"
          [min]="startsOn() ?? undefined"
          [(value)]="endsOn"
          [state]="stateOf('ends_on')"
          [hint]="errors().ends_on ?? 'Opcional. Déjalo vacío si no tiene fin.'"
        />
      </div>

      <ui-input
        label="Descripción"
        name="description"
        [maxlength]="descriptionMaxLength"
        [(value)]="description"
        [state]="stateOf('description')"
        [hint]="errors().description"
      />
      <ui-input
        label="Comercio"
        name="merchant"
        [maxlength]="merchantMaxLength"
        [(value)]="merchant"
        [state]="stateOf('merchant')"
        [hint]="errors().merchant"
      />

      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ui-button variant="outline" (clicked)="cancelled.emit()">Cancelar</ui-button>
        <ui-button type="submit" [loading]="saving()">{{ submitLabel() }}</ui-button>
      </div>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringTemplateForm {
  readonly template = input<RecurringTemplate | null>(null);
  readonly accounts = input<readonly RecurringAccountOption[]>([]);
  readonly categories = input<readonly CategoryOption[]>([]);
  readonly serverErrors = input<RecurringTemplateFormErrors>({});
  readonly saving = input(false, { transform: booleanAttribute });

  readonly submitted = output<RecurringTemplateInput>();
  readonly cancelled = output<void>();

  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly nameMaxLength = NAME_MAX_LENGTH;
  protected readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH;
  protected readonly merchantMaxLength = MERCHANT_MAX_LENGTH;
  protected readonly variableExplanation = VARIABLE_EXPLANATION;
  protected readonly dayHint = DAY_HINT;
  protected readonly frequencyOptions: UiSelectOption[] = RECURRING_FREQUENCIES.map(
    (frequency) => ({ value: frequency, label: FREQUENCY_LABELS[frequency] }),
  );
  protected readonly dayOptions: UiSelectOption[] = DAYS_OF_MONTH.map((day) => ({
    value: String(day),
    label: String(day),
  }));

  protected readonly type = linkedSignal<RecurringType>(() => this.template()?.type ?? 'expense');
  protected readonly name = linkedSignal(() => this.template()?.name ?? '');
  protected readonly isVariable = linkedSignal(() => this.template()?.is_variable ?? false);
  protected readonly amount = linkedSignal<number | null>(
    () => this.template()?.amount_cents ?? null,
  );
  protected readonly accountId = linkedSignal<string | null>(() =>
    idText(this.template()?.account.id),
  );
  protected readonly categoryId = linkedSignal<string | null>(() =>
    idText(this.template()?.category.id),
  );
  protected readonly frequency = linkedSignal<RecurringFrequency>(
    () => this.template()?.frequency ?? 'monthly',
  );
  protected readonly dayOfMonth = linkedSignal<string>(() =>
    String(this.template()?.day_of_month ?? Number(todayInMadrid().slice(8, 10))),
  );
  protected readonly startsOn = linkedSignal<string | null>(
    () => this.template()?.starts_on ?? todayInMadrid(),
  );
  protected readonly endsOn = linkedSignal<string | null>(() => this.template()?.ends_on ?? null);
  protected readonly description = linkedSignal(() => this.template()?.description ?? '');
  protected readonly merchant = linkedSignal(() => this.template()?.merchant ?? '');

  private readonly attempted = signal(false);

  protected readonly submitLabel = computed(() =>
    this.template() === null ? 'Crear fijo' : 'Guardar cambios',
  );

  protected readonly accountOptions = computed<UiSelectOption[]>(() => {
    const options = this.accounts().map((account) => ({
      value: String(account.id),
      label: account.name,
    }));
    const current = this.template()?.account;
    if (current !== undefined && !options.some((option) => option.value === String(current.id))) {
      options.push({ value: String(current.id), label: current.name });
    }
    return options;
  });

  protected readonly categoryOptions = computed<UiSelectOption[]>(() => {
    const type = this.type();
    const options = this.categories()
      .filter((category) => category.kind === type)
      .map((category) => ({ value: String(category.id), label: category.label }));
    const current = this.template()?.category;
    if (
      current !== undefined &&
      current.kind === type &&
      !options.some((option) => option.value === String(current.id))
    ) {
      const label =
        current.parent_name === null ? current.name : `${current.parent_name} › ${current.name}`;
      options.push({ value: String(current.id), label });
    }
    return options;
  });

  private readonly clientErrors = computed<RecurringTemplateFormErrors>(() => {
    const errors: RecurringTemplateFormErrors = {};
    if (this.name().trim() === '') {
      errors.name = 'Escribe un nombre.';
    }
    const amount = this.amount();
    if (amount === null || amount <= 0) {
      errors.amount_cents = 'Indica un importe mayor que cero.';
    }
    if (this.accountId() === null) {
      errors.account_id = 'Elige una cuenta.';
    }
    if (this.categoryId() === null) {
      errors.category_id = 'Elige una categoría.';
    }
    const startsOn = this.startsOn();
    const endsOn = this.endsOn();
    if (startsOn === null) {
      errors.starts_on = 'Indica la fecha de inicio.';
    } else if (endsOn !== null && compareIsoDates(endsOn, startsOn) < 0) {
      errors.ends_on = 'La fecha de fin no puede ser anterior al inicio.';
    }
    return errors;
  });

  protected readonly errors = computed<RecurringTemplateFormErrors>(() => ({
    ...this.serverErrors(),
    ...(this.attempted() ? this.clientErrors() : {}),
  }));

  protected stateOf(field: keyof RecurringTemplateInput): 'error' | 'default' {
    return this.errors()[field] === undefined ? 'default' : 'error';
  }

  protected changeType(value: string): void {
    const type: RecurringType = value === 'income' ? 'income' : 'expense';
    if (type === this.type()) {
      return;
    }
    this.type.set(type);
    const selected = this.categoryId();
    if (selected !== null && !this.categoryOptions().some((option) => option.value === selected)) {
      this.categoryId.set(null);
    }
  }

  protected changeFrequency(value: string | null): void {
    if (isFrequency(value)) {
      this.frequency.set(value);
    }
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.attempted.set(true);
    const amount = this.amount();
    const startsOn = this.startsOn();
    if (Object.keys(this.clientErrors()).length > 0 || amount === null || startsOn === null) {
      return;
    }
    this.submitted.emit({
      name: this.name().trim(),
      type: this.type(),
      amount_cents: amount,
      is_variable: this.isVariable(),
      account_id: Number(this.accountId()),
      category_id: Number(this.categoryId()),
      frequency: this.frequency(),
      day_of_month: Number(this.dayOfMonth()),
      starts_on: startsOn,
      ends_on: this.endsOn(),
      description: optionalText(this.description()),
      merchant: optionalText(this.merchant()),
    });
  }
}

function idText(id: number | undefined): string | null {
  return id === undefined ? null : String(id);
}

function isFrequency(value: string | null): value is RecurringFrequency {
  return (RECURRING_FREQUENCIES as readonly (string | null)[]).includes(value);
}
