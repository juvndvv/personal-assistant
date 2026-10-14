import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { conflictCode, serverMessage } from '../../../core/api/api-error';
import { DraftsApi } from '../../../core/api/drafts.api';
import {
  AccountType,
  Draft,
  DraftField,
  DraftType,
  FieldSource,
  TransferKind,
} from '../../../core/api/models';
import { TransactionsApi } from '../../../core/api/transactions.api';
import { TransfersApi } from '../../../core/api/transfers.api';
import { todayInMadrid } from '../../../core/date/iso-date';
import { formatCents } from '../../../core/money/format-cents';
import { PageHeader } from '../../../shared/layout/page-header';
import {
  UiButton,
  UiDateInput,
  UiInput,
  UiMoneyInput,
  UiSegmented,
  UiSelect,
  UiState,
  UiToast,
} from '../../../shared/ui';
import { EntryErrors, entryErrorsFrom, optionalText } from '../../transactions/entry-errors';
import { MovementSheets } from '../../transactions/movement-sheets';
import { LedgerReferenceData } from '../../transactions/reference-data';
import { TagInput } from '../../transactions/tag-input/tag-input';
import { transferKindBetween } from '../../transfers/transfer-kind';
import { DRAFT_NOT_PENDING_MESSAGE, DRAFT_ORIGIN_LABEL } from '../draft-display';
import { PendingDrafts } from '../pending-drafts';
import { ReviewField } from './review-field';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'transfer', label: 'Transferencia' },
];

const DESCRIPTION_MAX = 255;
const MERCHANT_MAX = 120;

export const REVIEW_MESSAGES = {
  failed:
    'No pudimos analizar la captura automáticamente. Completa los datos a mano antes de confirmar.',
  notPending: DRAFT_NOT_PENDING_MESSAGE,
  loadFailed: 'No se pudo cargar el borrador.',
} as const;

interface Prefill {
  type: DraftType;
  amount: number | null;
  categoryId: string | null;
  accountId: string | null;
  toAccountId: string | null;
  date: string | null;
  description: string;
  merchant: string;
}

function idText(id: number | null): string | null {
  return id === null ? null : String(id);
}

function prefillFrom(draft: Draft): Prefill {
  const proposal = draft.proposal;
  const transcript = draft.capture?.transcript ?? null;
  const fallbackDescription = draft.capture?.status === 'failed' ? transcript : null;
  return {
    type: proposal.type ?? 'expense',
    amount: proposal.amount_cents,
    categoryId: idText(proposal.category_id),
    accountId: idText(proposal.account_id),
    toAccountId: idText(proposal.to_account_id),
    date: proposal.date ?? todayInMadrid(),
    description: (proposal.description ?? fallbackDescription ?? '').slice(0, DESCRIPTION_MAX),
    merchant: (proposal.merchant ?? '').slice(0, MERCHANT_MAX),
  };
}

@Component({
  selector: 'app-draft-review-page',
  imports: [
    PageHeader,
    ReviewField,
    RouterLink,
    TagInput,
    UiButton,
    UiDateInput,
    UiInput,
    UiMoneyInput,
    UiSegmented,
    UiSelect,
  ],
  template: `
    <app-page-header title="Revisar movimiento" [subtitle]="subtitle()" />

    @if (loadFailure(); as message) {
      <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {{ message }}
      </p>
      <a routerLink="/pendientes" class="mt-4 inline-block text-sm font-medium text-primary-text">
        Volver a pendientes
      </a>
    } @else if (draft(); as current) {
      @if (current.status !== 'pending') {
        <p role="status" class="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
          {{ notPendingMessage }}
        </p>
        <a routerLink="/pendientes" class="mt-4 inline-block text-sm font-medium text-primary-text">
          Volver a pendientes
        </a>
      } @else {
        <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
          <form
            class="flex flex-col gap-5 rounded-2xl border border-border bg-background p-4"
            novalidate
            aria-label="Borrador del movimiento"
            (submit)="confirm($event)"
          >
            @if (captureFailed()) {
              <p
                role="alert"
                class="rounded-lg bg-warning/15 px-3 py-2 text-sm text-foreground"
                data-testid="capture-failed"
              >
                {{ failedMessage }}
              </p>
            }
            @if (failure(); as message) {
              <p
                role="alert"
                class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {{ message }}
              </p>
            }

            <app-review-field
              field="type"
              [source]="sourceOf('type')"
              [lowConfidence]="isFlagged('type')"
            >
              <ui-segmented
                ariaLabel="Tipo de movimiento"
                [options]="typeOptions"
                [value]="type()"
                (valueChange)="changeType($event)"
              />
            </app-review-field>

            <app-review-field
              field="amount_cents"
              [source]="sourceOf('amount_cents')"
              [lowConfidence]="isFlagged('amount_cents')"
            >
              <ui-money-input
                label="Importe"
                size="lg"
                name="amount_cents"
                [required]="true"
                [(value)]="amount"
                [state]="stateOf('amount_cents')"
                [hint]="errors().amount_cents"
              />
            </app-review-field>

            @if (type() !== 'transfer') {
              <app-review-field
                field="category_id"
                [source]="sourceOf('category_id')"
                [lowConfidence]="isFlagged('category_id')"
              >
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
              </app-review-field>
            }

            <app-review-field
              field="account_id"
              [source]="sourceOf('account_id')"
              [lowConfidence]="isFlagged('account_id')"
            >
              <ui-select
                [label]="type() === 'transfer' ? 'Desde' : 'Cuenta'"
                name="account_id"
                placeholder="Elige una cuenta"
                [required]="true"
                [options]="accountOptions()"
                [(value)]="accountId"
                [state]="stateOf('account_id', 'from_account_id')"
                [hint]="errors().account_id ?? errors().from_account_id"
              />
            </app-review-field>

            @if (type() === 'transfer') {
              <app-review-field
                field="to_account_id"
                [source]="sourceOf('to_account_id')"
                [lowConfidence]="isFlagged('to_account_id')"
              >
                <ui-select
                  label="Hacia"
                  name="to_account_id"
                  placeholder="Cuenta de destino"
                  [required]="true"
                  [options]="toAccountOptions()"
                  [(value)]="toAccountId"
                  [state]="stateOf('to_account_id')"
                  [hint]="errors().to_account_id"
                />
              </app-review-field>
            }

            <app-review-field
              field="date"
              [source]="sourceOf('date')"
              [lowConfidence]="isFlagged('date')"
            >
              <ui-date-input
                label="Fecha"
                name="date"
                [required]="true"
                [(value)]="date"
                [state]="stateOf('date')"
                [hint]="errors().date"
              />
            </app-review-field>

            <app-review-field
              field="description"
              [source]="sourceOf('description')"
              [lowConfidence]="isFlagged('description')"
            >
              <ui-input
                [label]="type() === 'transfer' ? 'Nota' : 'Descripción'"
                name="description"
                [maxlength]="descriptionMax"
                [(value)]="description"
                [state]="stateOf('description', 'note')"
                [hint]="errors().description ?? errors().note"
              />
            </app-review-field>

            @if (type() !== 'transfer') {
              <app-review-field
                field="merchant"
                [source]="sourceOf('merchant')"
                [lowConfidence]="isFlagged('merchant')"
              >
                <ui-input
                  label="Comercio"
                  name="merchant"
                  [maxlength]="merchantMax"
                  [(value)]="merchant"
                  [state]="stateOf('merchant')"
                  [hint]="errors().merchant"
                />
              </app-review-field>
              <app-tag-input [(tags)]="tags" />
              @if (errors().tags; as message) {
                <p role="alert" class="text-xs text-destructive">{{ message }}</p>
              }
            }

            <div class="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
              <ui-button size="lg" [loading]="saving()" (clicked)="confirm($event)">
                Confirmar
              </ui-button>
              <ui-button
                variant="ghost"
                size="lg"
                [disabled]="saving()"
                [loading]="discarding()"
                (clicked)="discard()"
              >
                Descartar
              </ui-button>
            </div>
          </form>

          <aside class="flex flex-col gap-4" aria-label="Captura original">
            @if (current.capture; as capture) {
              @if (capture.transcript) {
                <figure class="rounded-2xl border border-border bg-background p-4">
                  <figcaption class="mb-2 text-xs font-medium text-muted-foreground">
                    Transcripción
                  </figcaption>
                  <blockquote class="text-sm text-foreground" data-testid="draft-transcript">
                    “{{ capture.transcript }}”
                  </blockquote>
                </figure>
              }
              @for (file of capture.attachments; track file.id) {
                <div class="rounded-2xl border border-border bg-background p-3">
                  @if (file.kind === 'image') {
                    <a [href]="file.url" target="_blank" rel="noopener">
                      <img
                        [src]="file.url"
                        alt="Foto del ticket"
                        class="max-h-80 w-full rounded-xl bg-muted object-contain"
                        data-testid="draft-photo"
                      />
                    </a>
                  } @else {
                    <audio
                      controls
                      preload="none"
                      class="w-full"
                      [src]="file.url"
                      data-testid="draft-audio"
                    >
                      <track kind="captions" />
                    </audio>
                  }
                </div>
              }
            }
          </aside>
        </div>
      }
    } @else {
      <p class="text-sm text-muted-foreground" role="status">Cargando borrador…</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftReviewPage {
  private readonly draftsApi = inject(DraftsApi);
  private readonly transactionsApi = inject(TransactionsApi);
  private readonly transfersApi = inject(TransfersApi);
  private readonly reference = inject(LedgerReferenceData);
  private readonly pending = inject(PendingDrafts);
  private readonly sheets = inject(MovementSheets);
  private readonly toast = inject(UiToast);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly descriptionMax = DESCRIPTION_MAX;
  protected readonly merchantMax = MERCHANT_MAX;
  protected readonly failedMessage = REVIEW_MESSAGES.failed;
  protected readonly notPendingMessage = REVIEW_MESSAGES.notPending;

  protected readonly draft = signal<Draft | null>(null);
  protected readonly loadFailure = signal<string | null>(null);
  protected readonly type = signal<DraftType>('expense');
  protected readonly amount = signal<number | null>(null);
  protected readonly categoryId = signal<string | null>(null);
  protected readonly accountId = signal<string | null>(null);
  protected readonly toAccountId = signal<string | null>(null);
  protected readonly date = signal<string | null>(null);
  protected readonly description = signal('');
  protected readonly merchant = signal('');
  protected readonly tags = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly discarding = signal(false);
  protected readonly failure = signal<string | null>(null);
  private readonly initial = signal<Prefill | null>(null);
  private readonly serverErrors = signal<EntryErrors>({});
  private readonly attempted = signal(false);

  protected readonly subtitle = computed(() => {
    const draft = this.draft();
    return draft === null ? undefined : `Borrador · ${DRAFT_ORIGIN_LABEL[draft.origin]}`;
  });
  protected readonly captureFailed = computed(() => this.draft()?.capture?.status === 'failed');

  protected readonly categoryOptions = computed(() => {
    const type = this.type();
    return type === 'transfer'
      ? []
      : this.reference
          .categoriesOf(type)
          .map((category) => ({ value: String(category.id), label: category.label }));
  });
  protected readonly accountOptions = computed(() =>
    this.reference
      .writableAccounts()
      .map((account) => ({ value: String(account.id), label: account.name })),
  );
  protected readonly toAccountOptions = computed(() =>
    this.accountOptions().filter((option) => option.value !== this.accountId()),
  );

  private readonly flagged = computed(() => new Set(this.draft()?.low_confidence_fields ?? []));

  private readonly currentValues = computed<Prefill>(() => ({
    type: this.type(),
    amount: this.amount(),
    categoryId: this.categoryId(),
    accountId: this.accountId(),
    toAccountId: this.toAccountId(),
    date: this.date(),
    description: this.description(),
    merchant: this.merchant(),
  }));

  private readonly clientErrors = computed<EntryErrors>(() => {
    const errors: EntryErrors = {};
    const amount = this.amount();
    if (amount === null || amount <= 0) {
      errors.amount_cents = 'Indica un importe mayor que cero.';
    }
    if (this.date() === null) {
      errors.date = 'Indica la fecha.';
    }
    if (this.accountId() === null) {
      errors.account_id = 'Elige una cuenta.';
    }
    if (this.type() === 'transfer') {
      if (this.toAccountId() === null) {
        errors.to_account_id = 'Elige la cuenta de destino.';
      } else if (this.toAccountId() === this.accountId()) {
        errors.to_account_id = 'Elige una cuenta distinta de la de origen.';
      }
    } else if (this.categoryId() === null) {
      errors.category_id = 'Elige una categoría.';
    }
    return errors;
  });

  protected readonly errors = computed<EntryErrors>(() => ({
    ...this.serverErrors(),
    ...(this.attempted() ? this.clientErrors() : {}),
  }));

  constructor() {
    effect(() => {
      const id = Number(this.id());
      untracked(() => void this.load(id));
    });
  }

  protected sourceOf(field: DraftField): FieldSource | null {
    return this.draft()?.field_sources[field] ?? null;
  }

  protected isFlagged(field: DraftField): boolean {
    if (!this.flagged().has(field)) {
      return false;
    }
    const initial = this.initial();
    return initial === null || this.unchanged(field, initial);
  }

  protected stateOf(...fields: string[]): UiState {
    const errors = this.errors() as Record<string, string | undefined>;
    if (fields.some((field) => errors[field] !== undefined)) {
      return 'error';
    }
    const draftField = fields[0] as DraftField;
    return this.isFlagged(draftField) ? 'warning' : 'default';
  }

  protected changeType(value: string): void {
    const type: DraftType = value === 'income' || value === 'transfer' ? value : 'expense';
    if (type === this.type()) {
      return;
    }
    this.type.set(type);
    const category = this.categoryId();
    const kind = category === null ? undefined : this.reference.categoryById().get(+category)?.kind;
    if (kind !== type) {
      this.categoryId.set(null);
    }
  }

  protected async confirm(event: Event): Promise<void> {
    event.preventDefault();
    const draft = this.draft();
    if (draft === null || this.saving() || this.discarding()) {
      return;
    }
    this.attempted.set(true);
    this.serverErrors.set({});
    this.failure.set(null);
    const amount = this.amount();
    const date = this.date();
    const accountId = this.accountId();
    if (Object.keys(this.clientErrors()).length > 0 || amount === null || accountId === null) {
      return;
    }
    this.saving.set(true);
    try {
      await this.save(draft, amount, date ?? todayInMadrid(), Number(accountId));
      this.pending.forget(draft.id);
      this.sheets.notifyChanged();
      this.toast.success('Movimiento guardado', { description: formatCents(amount) });
      await this.leave();
    } catch (error: unknown) {
      this.handleError(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected async discard(): Promise<void> {
    const draft = this.draft();
    if (draft === null || this.saving() || this.discarding()) {
      return;
    }
    this.failure.set(null);
    this.discarding.set(true);
    try {
      await firstValueFrom(this.draftsApi.discard(draft.id));
      this.pending.forget(draft.id);
      this.toast.info('Borrador descartado');
      await this.pending.refresh();
      await this.router.navigate(['/pendientes']);
    } catch (error: unknown) {
      this.failure.set(
        conflictCode(error) === 'draft_not_pending'
          ? REVIEW_MESSAGES.notPending
          : (serverMessage(error) ?? 'No se pudo descartar el borrador.'),
      );
    } finally {
      this.discarding.set(false);
    }
  }

  private async save(draft: Draft, amount: number, date: string, accountId: number): Promise<void> {
    const type = this.type();
    if (type === 'transfer') {
      const toAccountId = Number(this.toAccountId());
      const kind = await this.transferKindOf(accountId, toAccountId);
      await firstValueFrom(
        this.transfersApi.create({
          ...(kind === 'card_settlement' ? { kind } : {}),
          from_account_id: accountId,
          to_account_id: toAccountId,
          amount_cents: amount,
          date,
          note: optionalText(this.description()),
          draft_id: draft.id,
        }),
      );
      return;
    }
    const tags = this.tags();
    await firstValueFrom(
      this.transactionsApi.create({
        type,
        amount_cents: amount,
        category_id: Number(this.categoryId()),
        date,
        account_id: accountId,
        description: optionalText(this.description()),
        merchant: optionalText(this.merchant()),
        ...(tags.length > 0 ? { tags } : {}),
        draft_id: draft.id,
      }),
    );
  }

  private async transferKindOf(
    fromAccountId: number,
    toAccountId: number,
  ): Promise<TransferKind | null> {
    let from = this.accountTypeOf(fromAccountId);
    let to = this.accountTypeOf(toAccountId);
    if (from === undefined || to === undefined) {
      await this.reference.ensureLoaded().catch(() => undefined);
      from = this.accountTypeOf(fromAccountId);
      to = this.accountTypeOf(toAccountId);
    }
    return from === undefined || to === undefined ? null : transferKindBetween(from, to);
  }

  private accountTypeOf(accountId: number): AccountType | undefined {
    return this.reference.accounts().find((account) => account.id === accountId)?.type;
  }

  private handleError(error: unknown): void {
    if (conflictCode(error) === 'draft_not_pending') {
      this.failure.set(REVIEW_MESSAGES.notPending);
      void this.pending.refresh();
      return;
    }
    const known = entryErrorsFrom(error);
    if (known === null || Object.keys(known).length === 0) {
      this.failure.set(serverMessage(error) ?? 'No se pudo guardar el movimiento.');
      return;
    }
    this.serverErrors.set(known);
  }

  private async leave(): Promise<void> {
    await this.pending.refresh();
    await this.router.navigate([this.pending.count() > 0 ? '/pendientes' : '/movimientos']);
  }

  private unchanged(field: DraftField, initial: Prefill): boolean {
    const current = this.currentValues();
    switch (field) {
      case 'type':
        return current.type === initial.type;
      case 'amount_cents':
        return current.amount === initial.amount;
      case 'category_id':
        return current.categoryId === initial.categoryId;
      case 'account_id':
        return current.accountId === initial.accountId;
      case 'to_account_id':
        return current.toAccountId === initial.toAccountId;
      case 'date':
        return current.date === initial.date;
      case 'description':
        return current.description === initial.description;
      case 'merchant':
        return current.merchant === initial.merchant;
    }
  }

  private async load(id: number): Promise<void> {
    this.loadFailure.set(null);
    void this.reference.ensureLoaded().catch(() => undefined);
    const known = this.pending.recall(id);
    if (known !== null) {
      this.prepare(known);
      return;
    }
    this.draft.set(null);
    try {
      this.prepare(await firstValueFrom(this.draftsApi.get(id)));
    } catch (error: unknown) {
      this.loadFailure.set(serverMessage(error) ?? REVIEW_MESSAGES.loadFailed);
    }
  }

  private prepare(draft: Draft): void {
    const prefill = prefillFrom(draft);
    this.type.set(prefill.type);
    this.amount.set(prefill.amount);
    this.categoryId.set(prefill.categoryId);
    this.accountId.set(prefill.accountId);
    this.toAccountId.set(prefill.toAccountId);
    this.date.set(prefill.date);
    this.description.set(prefill.description);
    this.merchant.set(prefill.merchant);
    this.tags.set([]);
    this.initial.set(prefill);
    this.failure.set(null);
    this.serverErrors.set({});
    this.attempted.set(false);
    this.draft.set(draft);
  }
}
