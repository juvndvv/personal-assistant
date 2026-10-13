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
  untracked,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { serverMessage } from '../../core/api/api-error';
import { Account, SettlementSuggestion, Transfer } from '../../core/api/models';
import { TransfersApi } from '../../core/api/transfers.api';
import { formatDate, todayInMadrid } from '../../core/date/iso-date';
import { EurPipe } from '../../core/money/eur.pipe';
import {
  UiButton,
  UiDateInput,
  UiMoneyInput,
  UiSelect,
  UiSheet,
  UiSheetFooter,
  UiToast,
} from '../../shared/ui';
import { EntryErrors, entryErrorsFrom } from '../transactions/entry-errors';
import { MovementSheets } from '../transactions/movement-sheets';
import { LedgerReferenceData } from '../transactions/reference-data';

@Component({
  selector: 'app-settle-card-sheet',
  imports: [EurPipe, UiButton, UiDateInput, UiMoneyInput, UiSelect, UiSheet, UiSheetFooter],
  template: `
    <ui-sheet
      [(open)]="open"
      title="Liquidar tarjeta"
      description="Registra el pago de la tarjeta como una transferencia. No cuenta como gasto."
    >
      <form class="flex flex-col gap-5 pb-2" novalidate (submit)="submit($event)">
        @if (failure(); as message) {
          <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ message }}
          </p>
        }
        @if (suggestion(); as current) {
          <section
            class="rounded-xl bg-muted/60 p-4 text-sm"
            aria-label="Extracto"
            data-testid="statement-window"
          >
            @if (current.statement_start !== null && current.statement_end !== null) {
              <p class="font-medium text-foreground">
                Extracto del {{ formatDate(current.statement_start) }} al
                {{ formatDate(current.statement_end) }}
              </p>
              <dl class="mt-2 grid grid-cols-2 gap-2">
                <dt class="text-muted-foreground">Deuda al cierre</dt>
                <dd class="text-end tabular-nums">{{ -current.statement_balance_cents | eur }}</dd>
                <dt class="text-muted-foreground">Liquidado desde el cierre</dt>
                <dd class="text-end tabular-nums">{{ current.settled_since_cents | eur }}</dd>
              </dl>
            } @else {
              <p class="text-foreground">Sin día de corte: sugerimos la deuda actual.</p>
            }
            <p class="mt-2 font-medium text-foreground">
              Importe sugerido:
              <span class="tabular-nums" data-testid="suggested-amount">{{
                current.suggested_cents | eur
              }}</span>
            </p>
          </section>
        } @else if (loading()) {
          <p class="text-sm text-muted-foreground">Calculando el importe sugerido…</p>
        }
        <ui-money-input
          label="Importe"
          name="amount_cents"
          [required]="true"
          [(value)]="amount"
          [state]="errors().amount_cents ? 'error' : 'default'"
          [hint]="errors().amount_cents"
        />
        <ui-select
          label="Cuenta de pago"
          name="from_account_id"
          placeholder="Elige una cuenta"
          [required]="true"
          [options]="sourceOptions()"
          [(value)]="fromId"
          [state]="errors().from_account_id ? 'error' : 'default'"
          [hint]="errors().from_account_id"
        />
        <ui-date-input
          label="Fecha"
          name="date"
          [required]="true"
          [(value)]="date"
          [state]="errors().date ? 'error' : 'default'"
          [hint]="errors().date"
        />
      </form>
      <div uiSheetFooter>
        <ui-button [fullWidth]="true" [loading]="saving()" (clicked)="submit($event)">
          Liquidar
        </ui-button>
      </div>
    </ui-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettleCardSheet {
  private readonly accountsApi = inject(AccountsApi);
  private readonly transfersApi = inject(TransfersApi);
  private readonly reference = inject(LedgerReferenceData);
  private readonly sheets = inject(MovementSheets);
  private readonly toast = inject(UiToast);

  readonly open = model(false);
  readonly card = input.required<Account>();
  readonly settled = output<Transfer>();

  protected readonly formatDate = (iso: string) => formatDate(iso, 'medium');
  protected readonly suggestion = signal<SettlementSuggestion | null>(null);
  protected readonly amount = signal<number | null>(null);
  protected readonly fromId = signal<string | null>(null);
  protected readonly date = signal<string | null>(todayInMadrid());
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  private readonly serverErrors = signal<EntryErrors>({});
  private readonly attempted = signal(false);

  protected readonly sourceOptions = computed(() =>
    this.reference
      .writableAccounts()
      .filter((account) => account.type !== 'credit_card')
      .map((account) => ({ value: String(account.id), label: account.name })),
  );

  private readonly clientErrors = computed<EntryErrors>(() => {
    const errors: EntryErrors = {};
    const amount = this.amount();
    if (amount === null || amount <= 0) {
      errors.amount_cents = 'Indica un importe mayor que cero.';
    }
    if (this.fromId() === null) {
      errors.from_account_id = 'Elige la cuenta desde la que pagas.';
    }
    if (this.date() === null) {
      errors.date = 'Indica la fecha.';
    }
    return errors;
  });

  protected readonly errors = computed<EntryErrors>(() => ({
    ...this.serverErrors(),
    ...(this.attempted() ? this.clientErrors() : {}),
  }));

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => void this.prepare());
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
    const amount = this.amount();
    const from = this.fromId();
    const date = this.date();
    if (
      Object.keys(this.clientErrors()).length > 0 ||
      amount === null ||
      from === null ||
      date === null
    ) {
      return;
    }
    this.saving.set(true);
    try {
      const transfer = await firstValueFrom(
        this.transfersApi.create({
          kind: 'card_settlement',
          from_account_id: Number(from),
          to_account_id: this.card().id,
          amount_cents: amount,
          date,
        }),
      );
      this.sheets.notifyChanged();
      this.toast.success('Tarjeta liquidada');
      this.settled.emit(transfer);
      this.open.set(false);
    } catch (error: unknown) {
      const known = entryErrorsFrom(error);
      if (known === null || Object.keys(known).length === 0) {
        this.failure.set(serverMessage(error) ?? 'No se pudo liquidar la tarjeta.');
      } else {
        this.serverErrors.set(known);
      }
    } finally {
      this.saving.set(false);
    }
  }

  private async prepare(): Promise<void> {
    const today = todayInMadrid();
    this.suggestion.set(null);
    this.amount.set(null);
    this.fromId.set(
      this.card().settlement_account_id === null ? null : String(this.card().settlement_account_id),
    );
    this.date.set(today);
    this.failure.set(null);
    this.serverErrors.set({});
    this.attempted.set(false);
    this.loading.set(true);
    void this.reference.ensureLoaded().catch(() => undefined);
    try {
      const suggestion = await firstValueFrom(
        this.accountsApi.settlementSuggestion(this.card().id, today),
      );
      this.suggestion.set(suggestion);
      if (suggestion.suggested_cents > 0) {
        this.amount.set(suggestion.suggested_cents);
      }
      if (suggestion.from_account_id !== null) {
        this.fromId.set(String(suggestion.from_account_id));
      }
    } catch (error: unknown) {
      this.failure.set(serverMessage(error) ?? 'No se pudo calcular el importe sugerido.');
    } finally {
      this.loading.set(false);
    }
  }
}
