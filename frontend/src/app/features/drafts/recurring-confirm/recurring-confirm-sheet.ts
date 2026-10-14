import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { conflictCode, serverMessage } from '../../../core/api/api-error';
import { DraftsApi } from '../../../core/api/drafts.api';
import { Draft, EntryType } from '../../../core/api/models';
import { TransactionsApi } from '../../../core/api/transactions.api';
import { formatDate } from '../../../core/date/iso-date';
import { formatCents, formatCentsForInput } from '../../../core/money/format-cents';
import {
  UiAlert,
  UiButton,
  UiMoneyInput,
  UiSheet,
  UiSheetFooter,
  UiToast,
} from '../../../shared/ui';
import { entryErrorsFrom } from '../../transactions/entry-errors';
import { MovementSheets } from '../../transactions/movement-sheets';
import { DRAFT_NOT_PENDING_MESSAGE } from '../draft-display';

export const RECURRING_AMOUNT_ID = 'recurring-confirm-amount';
const FOCUS_ATTEMPTS = 20;
const FOCUS_RETRY_MS = 16;

interface ConfirmableDraft {
  draft: Draft;
  type: EntryType;
  accountId: number;
  categoryId: number;
  date: string;
}

function confirmable(draft: Draft | null): ConfirmableDraft | null {
  const proposal = draft?.proposal;
  const date = proposal?.date ?? draft?.recurring?.due_date ?? null;
  if (
    draft === null ||
    proposal === undefined ||
    (proposal.type !== 'expense' && proposal.type !== 'income') ||
    proposal.account_id === null ||
    proposal.category_id === null ||
    date === null
  ) {
    return null;
  }
  return {
    draft,
    type: proposal.type,
    accountId: proposal.account_id,
    categoryId: proposal.category_id,
    date,
  };
}

@Component({
  selector: 'app-recurring-confirm-sheet',
  imports: [RouterLink, UiAlert, UiButton, UiMoneyInput, UiSheet, UiSheetFooter],
  template: `
    <ui-sheet
      [open]="draft() !== null"
      (openChange)="$event || closed.emit()"
      [title]="title()"
      [description]="description()"
    >
      <form class="flex flex-col gap-4 pb-2" novalidate (submit)="confirm($event)">
        @if (failure(); as message) {
          <ui-alert>
            <p>{{ message }}</p>
            @if (needsFullReview()) {
              <a
                [routerLink]="['/pendientes', draft()?.id]"
                class="mt-1 inline-block font-medium text-link underline"
                (click)="closed.emit()"
              >
                Revisar todos los datos
              </a>
            }
          </ui-alert>
        }
        <ui-money-input
          label="Importe real"
          size="lg"
          name="amount_cents"
          [inputId]="amountId"
          [required]="true"
          [placeholder]="estimatePlaceholder()"
          [(value)]="amount"
          [state]="amountError() ? 'error' : 'default'"
          [hint]="amountHint()"
        />
      </form>
      <div uiSheetFooter class="flex flex-col gap-2">
        <ui-button
          [fullWidth]="true"
          size="lg"
          [disabled]="skipping()"
          [loading]="saving()"
          (clicked)="confirm($event)"
        >
          Confirmar
        </ui-button>
        <ui-button
          variant="outline"
          [fullWidth]="true"
          size="lg"
          [disabled]="saving()"
          [loading]="skipping()"
          (clicked)="skip()"
        >
          Omitir este mes
        </ui-button>
      </div>
    </ui-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringConfirmSheet {
  private readonly transactionsApi = inject(TransactionsApi);
  private readonly draftsApi = inject(DraftsApi);
  private readonly sheets = inject(MovementSheets);
  private readonly toast = inject(UiToast);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly draft = input<Draft | null>(null);
  readonly resolved = output<number>();
  readonly closed = output<void>();

  protected readonly amountId = RECURRING_AMOUNT_ID;
  protected readonly amount = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly skipping = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly needsFullReview = signal(false);
  private readonly amountServerError = signal<string | null>(null);
  private readonly attempted = signal(false);

  protected readonly title = computed(() => this.draft()?.recurring?.template_name ?? 'Fijo');
  protected readonly description = computed(() => {
    const date = this.draft()?.recurring?.due_date ?? this.draft()?.proposal.date ?? null;
    const due = date === null ? '' : ` · Vence el ${formatDate(date, 'medium')}`;
    return `Introduce el importe real${due}`;
  });
  private readonly estimate = computed(() => this.draft()?.proposal.amount_cents ?? null);
  protected readonly estimatePlaceholder = computed(() => {
    const estimate = this.estimate();
    return estimate === null ? '0,00' : formatCentsForInput(estimate);
  });
  protected readonly amountHint = computed(() => {
    const estimate = this.estimate();
    return (
      this.amountError() ?? (estimate === null ? undefined : `Estimado: ${formatCents(estimate)}`)
    );
  });
  protected readonly amountError = computed(() => {
    if (this.amountServerError() !== null) {
      return this.amountServerError();
    }
    const amount = this.amount();
    return this.attempted() && (amount === null || amount <= 0)
      ? 'Introduce el importe real.'
      : null;
  });

  constructor() {
    effect(() => {
      const draft = this.draft();
      untracked(() => {
        this.reset();
        if (draft !== null) {
          this.focusAmount();
        }
      });
    });
  }

  protected async confirm(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving() || this.skipping()) {
      return;
    }
    this.attempted.set(true);
    this.amountServerError.set(null);
    this.failure.set(null);
    this.needsFullReview.set(false);
    const amount = this.amount();
    if (amount === null || amount <= 0) {
      return;
    }
    const target = confirmable(this.draft());
    if (target === null) {
      this.failure.set('A este borrador le faltan datos.');
      this.needsFullReview.set(true);
      return;
    }
    this.saving.set(true);
    try {
      const proposal = target.draft.proposal;
      await firstValueFrom(
        this.transactionsApi.create({
          type: target.type,
          amount_cents: amount,
          date: target.date,
          account_id: target.accountId,
          category_id: target.categoryId,
          description: proposal.description,
          merchant: proposal.merchant,
          draft_id: target.draft.id,
        }),
      );
      this.sheets.notifyChanged();
      this.toast.success('Movimiento guardado', {
        description: `${this.title()} · ${formatCents(amount)}`,
      });
      this.resolved.emit(target.draft.id);
    } catch (error: unknown) {
      this.handleError(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected async skip(): Promise<void> {
    const draft = this.draft();
    if (draft === null || this.saving() || this.skipping()) {
      return;
    }
    this.failure.set(null);
    this.needsFullReview.set(false);
    this.skipping.set(true);
    try {
      await firstValueFrom(this.draftsApi.discard(draft.id));
      this.sheets.notifyChanged();
      this.toast.info('Omitido este mes', { description: this.title() });
      this.resolved.emit(draft.id);
    } catch (error: unknown) {
      if (conflictCode(error) === 'draft_not_pending') {
        this.sheets.notifyChanged();
        this.toast.info(DRAFT_NOT_PENDING_MESSAGE);
        this.resolved.emit(draft.id);
        return;
      }
      this.failure.set(serverMessage(error) ?? 'No se pudo omitir este fijo.');
    } finally {
      this.skipping.set(false);
    }
  }

  private handleError(error: unknown): void {
    if (conflictCode(error) === 'draft_not_pending') {
      this.failure.set(DRAFT_NOT_PENDING_MESSAGE);
      return;
    }
    const fields = entryErrorsFrom(error) ?? {};
    const { amount_cents: amountMessage, ...others } = fields;
    if (amountMessage !== undefined) {
      this.amountServerError.set(amountMessage);
    }
    const otherMessage = Object.values(others)[0];
    if (otherMessage !== undefined) {
      this.failure.set(otherMessage);
      this.needsFullReview.set(true);
      return;
    }
    if (amountMessage === undefined) {
      this.failure.set(serverMessage(error) ?? 'No se pudo guardar el movimiento.');
      this.needsFullReview.set(true);
    }
  }

  private reset(): void {
    this.amount.set(null);
    this.failure.set(null);
    this.needsFullReview.set(false);
    this.amountServerError.set(null);
    this.attempted.set(false);
    this.saving.set(false);
    this.skipping.set(false);
  }

  private focusAmount(attempt = 0): void {
    const element = this.host.nativeElement.ownerDocument.getElementById(RECURRING_AMOUNT_ID);
    if (element !== null) {
      element.focus();
      return;
    }
    if (attempt < FOCUS_ATTEMPTS) {
      setTimeout(() => this.focusAmount(attempt + 1), FOCUS_RETRY_MS);
    }
  }
}
