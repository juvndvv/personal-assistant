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
import { firstValueFrom } from 'rxjs';
import { serverMessage } from '../../core/api/api-error';
import { AccountType, Transfer, TransferInput, TransferKind } from '../../core/api/models';
import { TransfersApi } from '../../core/api/transfers.api';
import { todayInMadrid } from '../../core/date/iso-date';
import {
  UiAlert,
  UiButton,
  UiDateInput,
  UiInput,
  UiMoneyInput,
  UiSelect,
  UiSheet,
  UiSheetFooter,
  UiSkeleton,
  UiToast,
} from '../../shared/ui';
import { EntryErrors, entryErrorsFrom, optionalText } from '../transactions/entry-errors';
import { MovementActions } from '../transactions/movement-actions';
import { MovementSheets, TransferRequest } from '../transactions/movement-sheets';
import { ReceiptsGallery } from '../transactions/receipts/receipts-gallery';
import { LedgerReferenceData } from '../transactions/reference-data';
import { ReferenceLoadAlert } from '../transactions/reference-load-alert';
import { transferKindBetween } from './transfer-kind';

@Component({
  selector: 'app-transfer-form-sheet',
  imports: [
    ReceiptsGallery,
    ReferenceLoadAlert,
    UiAlert,
    UiButton,
    UiDateInput,
    UiInput,
    UiMoneyInput,
    UiSelect,
    UiSheet,
    UiSheetFooter,
    UiSkeleton,
  ],
  template: `
    <ui-sheet
      [open]="request() !== null"
      (openChange)="onOpenChange($event)"
      [title]="title()"
      description="Mueve dinero entre tus cuentas. No cuenta como gasto ni como ingreso."
    >
      @if (loadFailure(); as message) {
        <ui-alert class="mb-4" [retryable]="true" [retrying]="loading()" (retry)="reload()">
          {{ message }}
        </ui-alert>
      }
      @if (loading()) {
        <div role="status" class="flex flex-col gap-5 pb-2" data-testid="transfer-skeleton">
          <span class="sr-only">Cargando transferencia…</span>
          @for (field of skeletonFields; track field) {
            <div class="flex flex-col gap-2" aria-hidden="true">
              <ui-skeleton width="5rem" />
              <ui-skeleton shape="pill" width="100%" height="2.75rem" />
            </div>
          }
        </div>
      }
      <form
        class="flex flex-col gap-5 pb-2"
        novalidate
        [hidden]="!formReady()"
        (submit)="submit($event)"
      >
        @if (failure(); as message) {
          <ui-alert>{{ message }}</ui-alert>
        }
        <app-reference-load-alert />
        <ui-select
          label="Desde"
          name="from_account_id"
          placeholder="Cuenta de origen"
          [required]="true"
          [options]="accountOptions()"
          [(value)]="fromId"
          [state]="errors().from_account_id ? 'error' : 'default'"
          [hint]="errors().from_account_id"
        />
        <ui-select
          label="Hacia"
          name="to_account_id"
          placeholder="Cuenta de destino"
          [required]="true"
          [options]="toOptions()"
          [(value)]="toId"
          [state]="errors().to_account_id ? 'error' : 'default'"
          [hint]="errors().to_account_id"
        />
        <ui-money-input
          label="Importe"
          name="amount_cents"
          [required]="true"
          [(value)]="amount"
          [state]="errors().amount_cents ? 'error' : 'default'"
          [hint]="errors().amount_cents"
        />
        <ui-date-input
          label="Fecha"
          name="date"
          [required]="true"
          [(value)]="date"
          [state]="errors().date ? 'error' : 'default'"
          [hint]="errors().date"
        />
        <ui-input label="Nota" name="note" [maxlength]="1000" [(value)]="note" />
      </form>
      @if (outLegId(); as legId) {
        <div class="border-t border-border pt-4 pb-2">
          <app-receipts-gallery [transactionId]="legId" />
        </div>
      }
      <div uiSheetFooter class="flex flex-col gap-2">
        <ui-button
          [fullWidth]="true"
          [loading]="saving()"
          [disabled]="!formReady()"
          (clicked)="submit($event)"
        >
          {{ editing() ? 'Guardar cambios' : 'Guardar transferencia' }}
        </ui-button>
        @if (editing()) {
          <ui-button variant="ghost" [fullWidth]="true" (clicked)="remove()">Eliminar</ui-button>
        }
      </div>
    </ui-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferFormSheet {
  private readonly api = inject(TransfersApi);
  private readonly reference = inject(LedgerReferenceData);
  private readonly sheets = inject(MovementSheets);
  private readonly actions = inject(MovementActions);
  private readonly toast = inject(UiToast);

  readonly request = input<TransferRequest | null>(null);
  readonly closed = output<void>();

  protected readonly fromId = signal<string | null>(null);
  protected readonly toId = signal<string | null>(null);
  protected readonly amount = signal<number | null>(null);
  protected readonly date = signal<string | null>(todayInMadrid());
  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly loading = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly loadFailure = signal<string | null>(null);
  protected readonly skeletonFields = ['from', 'to', 'amount', 'date', 'note'];
  private readonly existing = signal<Transfer | null>(null);
  private readonly serverErrors = signal<EntryErrors>({});
  private readonly attempted = signal(false);

  protected readonly editing = computed(() => this.request()?.transferId != null);
  protected readonly formReady = computed(() => !this.loading() && this.loadFailure() === null);
  protected readonly outLegId = computed(() => this.existing()?.out_transaction_id ?? null);
  protected readonly title = computed(() => {
    if (!this.editing()) {
      return 'Nueva transferencia';
    }
    return this.existing()?.kind === 'card_settlement'
      ? 'Editar liquidación de tarjeta'
      : 'Editar transferencia';
  });

  protected readonly accountOptions = computed(() => {
    const transfer = this.existing();
    const keep = new Set([transfer?.from_account.id, transfer?.to_account.id]);
    return this.reference
      .accounts()
      .filter((account) => account.archived_at === null || keep.has(account.id))
      .map((account) => ({ value: String(account.id), label: account.name }));
  });
  protected readonly toOptions = computed(() =>
    this.accountOptions().filter((option) => option.value !== this.fromId()),
  );

  private readonly clientErrors = computed<EntryErrors>(() => {
    const errors: EntryErrors = {};
    if (this.fromId() === null) {
      errors.from_account_id = 'Elige la cuenta de origen.';
    }
    if (this.toId() === null) {
      errors.to_account_id = 'Elige la cuenta de destino.';
    } else if (this.toId() === this.fromId()) {
      errors.to_account_id = 'Elige una cuenta distinta de la de origen.';
    }
    const amount = this.amount();
    if (amount === null || amount <= 0) {
      errors.amount_cents = 'Indica un importe mayor que cero.';
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
      const request = this.request();
      if (request !== null) {
        untracked(() => void this.prepare(request));
      }
    });
  }

  protected onOpenChange(open: boolean): void {
    if (!open) {
      this.closed.emit();
    }
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving() || !this.formReady()) {
      return;
    }
    this.attempted.set(true);
    this.serverErrors.set({});
    this.failure.set(null);
    const from = this.fromId();
    const to = this.toId();
    const amount = this.amount();
    const date = this.date();
    if (
      Object.keys(this.clientErrors()).length > 0 ||
      from === null ||
      to === null ||
      amount === null ||
      date === null
    ) {
      return;
    }
    const payload: TransferInput = {
      from_account_id: Number(from),
      to_account_id: Number(to),
      amount_cents: amount,
      date,
      note: optionalText(this.note()),
    };
    this.saving.set(true);
    try {
      const transferId = this.request()?.transferId ?? null;
      const kind = await this.resolveKind(payload);
      if (kind === null) {
        this.failure.set('No se pudieron cargar tus cuentas. Inténtalo de nuevo.');
        return;
      }
      if (transferId === null) {
        await firstValueFrom(
          this.api.create(kind === 'card_settlement' ? { ...payload, kind } : payload),
        );
        this.toast.success('Transferencia guardada');
      } else {
        await firstValueFrom(this.api.update(transferId, { ...payload, kind }));
        this.toast.success('Transferencia actualizada');
      }
      this.sheets.notifyChanged();
      this.closed.emit();
    } catch (error: unknown) {
      const known = entryErrorsFrom(error);
      if (known === null || Object.keys(known).length === 0) {
        this.failure.set(serverMessage(error) ?? 'No se pudo guardar la transferencia.');
      } else {
        this.serverErrors.set(known);
      }
    } finally {
      this.saving.set(false);
    }
  }

  private async resolveKind(payload: TransferInput): Promise<TransferKind | null> {
    const existing = this.existing();
    if (
      existing !== null &&
      existing.from_account.id === payload.from_account_id &&
      existing.to_account.id === payload.to_account_id
    ) {
      return existing.kind;
    }
    let from = this.accountTypeOf(payload.from_account_id);
    let to = this.accountTypeOf(payload.to_account_id);
    if (from === undefined || to === undefined) {
      await this.reference.ensureLoaded().catch(() => undefined);
      from = this.accountTypeOf(payload.from_account_id);
      to = this.accountTypeOf(payload.to_account_id);
    }
    if (from === undefined || to === undefined) {
      return null;
    }
    return transferKindBetween(from, to);
  }

  private accountTypeOf(accountId: number): AccountType | undefined {
    const existing = this.existing();
    const known = [existing?.from_account, existing?.to_account, ...this.reference.accounts()];
    return known.find((account) => account?.id === accountId)?.type;
  }

  protected async remove(): Promise<void> {
    const transferId = this.request()?.transferId ?? null;
    if (transferId !== null && (await this.actions.deleteTransfer(transferId))) {
      this.closed.emit();
    }
  }

  protected reload(): void {
    const transferId = this.request()?.transferId ?? null;
    if (transferId !== null && !this.loading()) {
      void this.load(transferId);
    }
  }

  private async prepare(request: TransferRequest): Promise<void> {
    this.existing.set(null);
    this.fromId.set(request.fromAccountId === null ? null : String(request.fromAccountId));
    this.toId.set(null);
    this.amount.set(null);
    this.date.set(todayInMadrid());
    this.note.set('');
    this.failure.set(null);
    this.loadFailure.set(null);
    this.serverErrors.set({});
    this.attempted.set(false);
    void this.reference.ensureLoaded().catch(() => undefined);
    if (request.transferId !== null) {
      await this.load(request.transferId);
    }
  }

  private async load(transferId: number): Promise<void> {
    this.loading.set(true);
    this.loadFailure.set(null);
    try {
      const transfer = await firstValueFrom(this.api.get(transferId));
      this.existing.set(transfer);
      this.fromId.set(String(transfer.from_account.id));
      this.toId.set(String(transfer.to_account.id));
      this.amount.set(transfer.amount_cents);
      this.date.set(transfer.date);
      this.note.set(transfer.note ?? '');
    } catch (error: unknown) {
      this.loadFailure.set(serverMessage(error) ?? 'No se pudo cargar la transferencia.');
    } finally {
      this.loading.set(false);
    }
  }
}
