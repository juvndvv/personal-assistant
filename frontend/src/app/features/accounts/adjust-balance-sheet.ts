import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { serverMessage, validationErrors } from '../../core/api/api-error';
import { Account, Transaction } from '../../core/api/models';
import { compareIsoDates, formatDate, todayInMadrid } from '../../core/date/iso-date';
import { EurPipe } from '../../core/money/eur.pipe';
import { formatCents } from '../../core/money/format-cents';
import {
  UiAlert,
  UiButton,
  UiDateInput,
  UiInput,
  UiMoneyInput,
  UiSheet,
  UiSheetFooter,
} from '../../shared/ui';

const ZERO_DELTA_MESSAGE = 'El saldo indicado coincide con el actual: no hay nada que ajustar.';

interface AdjustmentErrors {
  target_balance_cents?: string;
  date?: string;
  note?: string;
}

@Component({
  selector: 'app-adjust-balance-sheet',
  imports: [EurPipe, UiAlert, UiButton, UiDateInput, UiInput, UiMoneyInput, UiSheet, UiSheetFooter],
  template: `
    <ui-sheet
      [(open)]="open"
      title="Ajustar saldo"
      description="Indica el saldo real de la cuenta en una fecha. Registraremos la diferencia como un ajuste."
    >
      @if (result(); as adjustment) {
        <div class="flex flex-col gap-2 px-1 py-2" role="status">
          <p class="text-sm text-muted-foreground">Ajuste registrado</p>
          <p
            class="amount text-3xl"
            [class]="adjustment.signed_amount_cents > 0 ? 'text-income' : 'text-expense'"
            data-testid="adjustment-delta"
          >
            {{ adjustment.signed_amount_cents | eur: { signed: true } }}
          </p>
          <p class="text-sm text-foreground">
            Saldo a {{ formatDate(adjustment.date) }}:
            <strong class="amount">{{ adjustment.adjustment_target_cents | eur }}</strong>
          </p>
        </div>
      } @else {
        <form
          id="adjust-balance-form"
          class="flex flex-col gap-5"
          novalidate
          (submit)="submit($event)"
        >
          @if (failure(); as message) {
            <ui-alert>{{ message }}</ui-alert>
          }
          <ui-money-input
            label="Saldo real"
            name="target_balance_cents"
            [required]="true"
            [allowNegative]="true"
            [(value)]="target"
            [state]="errors().target_balance_cents ? 'error' : 'default'"
            [hint]="errors().target_balance_cents ?? currentBalanceHint()"
          />
          <ui-date-input
            label="Fecha"
            name="date"
            [required]="true"
            [min]="account().opening_date"
            [max]="today"
            [(value)]="date"
            [state]="errors().date ? 'error' : 'default'"
            [hint]="errors().date"
          />
          <ui-input
            label="Nota (opcional)"
            name="note"
            [maxlength]="500"
            [(value)]="note"
            [state]="errors().note ? 'error' : 'default'"
            [hint]="errors().note"
          />
        </form>
      }
      <div uiSheetFooter>
        @if (result()) {
          <ui-button [fullWidth]="true" (clicked)="open.set(false)">Hecho</ui-button>
        } @else {
          <ui-button [fullWidth]="true" [loading]="saving()" (clicked)="submit($event)">
            Guardar ajuste
          </ui-button>
        }
      </div>
    </ui-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdjustBalanceSheet {
  private readonly api = inject(AccountsApi);

  readonly open = model(false);
  readonly account = input.required<Account>();
  readonly adjusted = output<Transaction>();

  protected readonly today = todayInMadrid();
  protected readonly formatDate = formatDate;
  protected readonly target = signal<number | null>(null);
  protected readonly date = signal<string | null>(this.today);
  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly result = signal<Transaction | null>(null);
  protected readonly failure = signal<string | null>(null);
  private readonly serverErrors = signal<AdjustmentErrors>({});
  private readonly attempted = signal(false);

  private readonly clientErrors = computed<AdjustmentErrors>(() => {
    const errors: AdjustmentErrors = {};
    const target = this.target();
    const date = this.date();
    if (target === null) {
      errors.target_balance_cents = 'Indica el saldo real.';
    } else if (date === this.today && target === this.account().balance_cents) {
      errors.target_balance_cents = ZERO_DELTA_MESSAGE;
    }
    if (date === null) {
      errors.date = 'Indica la fecha del saldo.';
    } else if (compareIsoDates(date, this.today) > 0) {
      errors.date = 'La fecha no puede ser futura.';
    } else if (compareIsoDates(date, this.account().opening_date) < 0) {
      errors.date = `La fecha no puede ser anterior al ${formatDate(this.account().opening_date, 'medium')}.`;
    }
    return errors;
  });

  protected readonly errors = computed<AdjustmentErrors>(() => ({
    ...this.serverErrors(),
    ...(this.attempted() ? this.clientErrors() : {}),
  }));

  protected readonly currentBalanceHint = computed(
    () => `Saldo actual calculado: ${formatCents(this.account().balance_cents)}`,
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        this.reset();
      }
    });
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) {
      return;
    }
    this.attempted.set(true);
    this.serverErrors.set({});
    this.failure.set(null);
    const target = this.target();
    const date = this.date();
    if (Object.keys(this.clientErrors()).length > 0 || target === null || date === null) {
      return;
    }
    this.saving.set(true);
    try {
      const note = this.note().trim();
      const adjustment = await firstValueFrom(
        this.api.adjust(this.account().id, {
          date,
          target_balance_cents: target,
          note: note === '' ? null : note,
        }),
      );
      this.result.set(adjustment);
      this.adjusted.emit(adjustment);
    } catch (error: unknown) {
      this.handleError(error);
    } finally {
      this.saving.set(false);
    }
  }

  private handleError(error: unknown): void {
    const fields = validationErrors(error);
    if (fields === null) {
      this.failure.set(serverMessage(error) ?? 'No se pudo guardar el ajuste. Inténtalo de nuevo.');
      return;
    }
    const known = withoutEmpty({
      target_balance_cents: fields['target_balance_cents'],
      date: fields['date'],
      note: fields['note'],
    });
    this.serverErrors.set(known);
    if (Object.keys(known).length === 0) {
      this.failure.set(serverMessage(error) ?? 'No se pudo guardar el ajuste.');
    }
  }

  private reset(): void {
    this.target.set(null);
    this.date.set(this.today);
    this.note.set('');
    this.result.set(null);
    this.failure.set(null);
    this.serverErrors.set({});
    this.attempted.set(false);
  }
}

function withoutEmpty(errors: AdjustmentErrors): AdjustmentErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== undefined),
  ) as AdjustmentErrors;
}
