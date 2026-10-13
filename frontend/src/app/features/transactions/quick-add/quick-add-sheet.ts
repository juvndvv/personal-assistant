import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  model,
  signal,
  untracked,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeftRight, lucideChevronDown } from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { serverMessage } from '../../../core/api/api-error';
import { EntryType, QuickAddDefaults } from '../../../core/api/models';
import { QuickAddApi } from '../../../core/api/quick-add.api';
import { TransactionsApi } from '../../../core/api/transactions.api';
import { formatDate, todayInMadrid } from '../../../core/date/iso-date';
import { formatCents } from '../../../core/money/format-cents';
import {
  UiButton,
  UiDateInput,
  UiInput,
  UiMoneyInput,
  UiSegmented,
  UiSelect,
  UiSheet,
  UiSheetFooter,
} from '../../../shared/ui';
import { CATEGORY_ICON_SVGS, iconNameFor } from '../../categories/category-appearance';
import { EntryErrors, entryErrorsFrom, optionalText } from '../entry-errors';
import { CaptureFlow } from '../../drafts/capture-flow';
import { MovementActions } from '../movement-actions';
import { MovementSheets } from '../movement-sheets';
import { CategoryOption, LedgerReferenceData } from '../reference-data';
import { TagInput } from '../tag-input/tag-input';
import { CaptureControls, CapturedFile } from './capture-controls';

export const QUICK_ADD_AMOUNT_ID = 'quick-add-amount';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
];

const PROCESSING_LABEL = {
  voice: 'Analizando la nota de voz…',
  photo: 'Leyendo el ticket…',
} as const;

const SAVED_LABEL: Record<EntryType, string> = {
  expense: 'Gasto guardado',
  income: 'Ingreso guardado',
};

@Component({
  selector: 'app-quick-add-sheet',
  imports: [
    CaptureControls,
    NgIcon,
    TagInput,
    UiButton,
    UiDateInput,
    UiInput,
    UiMoneyInput,
    UiSegmented,
    UiSelect,
    UiSheet,
    UiSheetFooter,
  ],
  providers: [provideIcons({ ...CATEGORY_ICON_SVGS, lucideArrowLeftRight, lucideChevronDown })],
  template: `
    <ui-sheet [(open)]="open" title="Nuevo movimiento">
      @if (processing(); as kind) {
        <div
          class="flex flex-col items-center gap-4 py-10 text-center"
          role="status"
          aria-live="polite"
          data-testid="capture-processing"
        >
          <span
            class="size-10 animate-spin rounded-full border-4 border-muted border-t-primary"
            aria-hidden="true"
          ></span>
          <p class="font-medium text-foreground">{{ processingLabel[kind] }}</p>
          <p class="text-sm text-muted-foreground">
            Puede tardar unos segundos. Revisarás el borrador antes de guardarlo.
          </p>
          <ui-button variant="outline" (clicked)="cancelCapture()">Cancelar</ui-button>
        </div>
      }
      <form
        id="quick-add-form"
        class="flex flex-col gap-5 pb-2"
        novalidate
        [hidden]="processing() !== null"
        (submit)="submit($event)"
      >
        @if (captureFailure(); as message) {
          <p
            role="alert"
            class="rounded-lg bg-warning/15 px-3 py-2 text-sm text-foreground"
            data-testid="capture-failure"
          >
            {{ message }}
          </p>
        }
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2 gap-y-3">
          <ui-money-input
            label="Importe"
            size="lg"
            name="amount_cents"
            [inputId]="amountId"
            [required]="true"
            [(value)]="amount"
            [state]="errors().amount_cents ? 'error' : 'default'"
            [hint]="errors().amount_cents"
          />
          <app-capture-controls
            [disabled]="saving()"
            [active]="open()"
            (captured)="capture($event)"
          />
        </div>
        <ui-segmented
          ariaLabel="Tipo de movimiento"
          [options]="typeOptions"
          [value]="type()"
          (valueChange)="changeType($event)"
        />

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-medium text-foreground">Categoría</legend>
          @if (frequent().length === 0 && !defaultsLoaded()) {
            <p class="text-sm text-muted-foreground">Cargando categorías…</p>
          }
          <div class="flex flex-wrap gap-2" data-testid="quick-add-categories">
            @for (category of frequent(); track category.id) {
              <button
                type="button"
                class="inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors"
                [class]="
                  category.id === categoryId()
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                "
                [attr.aria-pressed]="category.id === categoryId()"
                (click)="categoryId.set(category.id)"
              >
                <ng-icon [name]="iconFor(category)" size="16" aria-hidden="true" />
                {{ category.name }}
              </button>
            }
          </div>
          @if (errors().category_id; as message) {
            <p role="alert" class="text-xs text-destructive">{{ message }}</p>
          }
        </fieldset>

        <p class="text-sm text-muted-foreground" data-testid="quick-add-summary">{{ summary() }}</p>

        @if (failure(); as message) {
          <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ message }}
          </p>
        }

        <div class="rounded-xl border border-border">
          <button
            type="button"
            class="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
            aria-controls="quick-add-details"
            [attr.aria-expanded]="detailsOpen()"
            (click)="detailsOpen.update((value) => !value)"
          >
            Más detalles
            <ng-icon
              name="lucideChevronDown"
              aria-hidden="true"
              [class.rotate-180]="detailsOpen()"
            />
          </button>
          <div
            id="quick-add-details"
            class="flex flex-col gap-4 border-t border-border px-4 py-4"
            [hidden]="!detailsOpen()"
          >
            <ui-date-input
              label="Fecha"
              name="date"
              [required]="true"
              [(value)]="date"
              [state]="errors().date ? 'error' : 'default'"
              [hint]="errors().date"
            />
            <ui-select
              label="Cuenta"
              name="account_id"
              [required]="true"
              placeholder="Elige una cuenta"
              [options]="accountOptions()"
              [(value)]="accountId"
              [state]="errors().account_id ? 'error' : 'default'"
              [hint]="errors().account_id"
            />
            <ui-select
              label="Otra categoría"
              name="category_id"
              placeholder="Elige una categoría"
              [options]="categoryOptions()"
              [value]="categoryId() === null ? null : categoryId() + ''"
              (valueChange)="categoryId.set($event === null ? null : +$event)"
            />
            <ui-input
              label="Descripción"
              name="description"
              [maxlength]="255"
              [(value)]="description"
            />
            <ui-input label="Comercio" name="merchant" [maxlength]="120" [(value)]="merchant" />
            <ui-input label="Nota" name="note" [maxlength]="1000" [(value)]="note" />
            <app-tag-input [(tags)]="tags" />
            @if (errors().tags; as message) {
              <p role="alert" class="text-xs text-destructive">{{ message }}</p>
            }
          </div>
        </div>

        <ui-button variant="ghost" (clicked)="openTransfer()">
          <ng-icon name="lucideArrowLeftRight" aria-hidden="true" />
          Transferencia entre cuentas
        </ui-button>
      </form>
      <div uiSheetFooter>
        @if (processing() === null) {
          <ui-button [fullWidth]="true" size="lg" [loading]="saving()" (clicked)="submit($event)">
            Guardar
          </ui-button>
        }
      </div>
    </ui-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickAddSheet {
  private readonly quickAddApi = inject(QuickAddApi);
  private readonly transactionsApi = inject(TransactionsApi);
  private readonly reference = inject(LedgerReferenceData);
  private readonly actions = inject(MovementActions);
  private readonly sheets = inject(MovementSheets);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly captureFlow = inject(CaptureFlow);

  readonly open = model(false);

  protected readonly amountId = QUICK_ADD_AMOUNT_ID;
  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly processingLabel = PROCESSING_LABEL;
  protected readonly processing = this.captureFlow.processing;
  protected readonly captureFailure = this.captureFlow.failure;
  private clientStartedAt = new Date().toISOString();
  protected readonly type = signal<EntryType>('expense');
  protected readonly amount = signal<number | null>(null);
  protected readonly categoryId = signal<number | null>(null);
  protected readonly date = signal<string | null>(todayInMadrid());
  protected readonly accountId = signal<string | null>(null);
  protected readonly description = signal('');
  protected readonly merchant = signal('');
  protected readonly note = signal('');
  protected readonly tags = signal<string[]>([]);
  protected readonly detailsOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  private readonly defaults = signal<QuickAddDefaults | null>(null);
  private readonly defaultsPending = signal(false);
  private openedOn = todayInMadrid();
  private readonly serverErrors = signal<EntryErrors>({});
  private readonly attempted = signal(false);

  protected readonly defaultsLoaded = computed(() => this.defaults() !== null);

  protected readonly frequent = computed<CategoryOption[]>(() => {
    const byId = this.reference.categoryById();
    const type = this.type();
    const ids = this.defaults()?.frequent_category_ids[type] ?? [];
    const chips = ids
      .map((id) => byId.get(id))
      .filter((category): category is CategoryOption => category?.kind === type);
    const selected = this.categoryId();
    const extra = selected === null ? undefined : byId.get(selected);
    return extra !== undefined && !chips.some((chip) => chip.id === extra.id)
      ? [...chips, extra]
      : chips;
  });

  protected readonly accountOptions = computed(() =>
    this.reference
      .writableAccounts()
      .map((account) => ({ value: String(account.id), label: account.name })),
  );

  protected readonly categoryOptions = computed(() =>
    this.reference
      .categoriesOf(this.type())
      .map((category) => ({ value: String(category.id), label: category.label })),
  );

  protected readonly summary = computed(() => {
    const date = this.date();
    const day =
      date === null ? 'Sin fecha' : date === todayInMadrid() ? 'Hoy' : formatDate(date, 'medium');
    const account = this.reference
      .accounts()
      .find((candidate) => String(candidate.id) === this.accountId());
    return `${day} · ${account?.name ?? 'Sin cuenta'}`;
  });

  private readonly clientErrors = computed<EntryErrors>(() => {
    const errors: EntryErrors = {};
    const amount = this.amount();
    if (amount === null || amount <= 0) {
      errors.amount_cents = 'Indica un importe mayor que cero.';
    }
    if (this.categoryId() === null) {
      errors.category_id = 'Elige una categoría.';
    }
    if (this.defaultsPending()) {
      return errors;
    }
    if (this.date() === null) {
      errors.date = 'Indica la fecha.';
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
      if (this.open()) {
        untracked(() => {
          this.reset();
          void this.loadDefaults();
          this.focusAmount();
        });
      } else {
        untracked(() => {
          if (this.captureFlow.processing() !== null) {
            this.captureFlow.cancel();
          }
        });
      }
    });
  }

  protected async capture(captured: CapturedFile): Promise<void> {
    const result = await this.captureFlow.submit({
      kind: captured.kind,
      file: captured.file,
      filename: captured.filename,
      clientStartedAt: this.clientStartedAt,
    });
    if (result !== null) {
      this.open.set(false);
    }
  }

  protected cancelCapture(): void {
    this.captureFlow.cancel();
    this.focusAmount();
  }

  protected iconFor(category: CategoryOption): string {
    return iconNameFor(category.icon);
  }

  protected changeType(value: string): void {
    const type: EntryType = value === 'income' ? 'income' : 'expense';
    if (type !== this.type()) {
      this.type.set(type);
      this.categoryId.set(null);
    }
  }

  protected openTransfer(): void {
    this.open.set(false);
    this.sheets.openNewTransfer();
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
    const categoryId = this.categoryId();
    const date = this.date();
    const accountId = this.accountId();
    if (Object.keys(this.clientErrors()).length > 0) {
      if (this.clientErrors().date || this.clientErrors().account_id) {
        this.detailsOpen.set(true);
      }
      return;
    }
    if (amount === null || categoryId === null) {
      return;
    }
    this.saving.set(true);
    try {
      const type = this.type();
      const tags = this.tags();
      const created = await firstValueFrom(
        this.transactionsApi.create({
          type,
          amount_cents: amount,
          category_id: categoryId,
          ...(date !== null ? { date } : {}),
          ...(accountId !== null ? { account_id: Number(accountId) } : {}),
          description: optionalText(this.description()),
          merchant: optionalText(this.merchant()),
          note: optionalText(this.note()),
          ...(tags.length > 0 ? { tags } : {}),
        }),
      );
      this.open.set(false);
      this.sheets.notifyChanged();
      this.actions.announceCreated(SAVED_LABEL[type], created, formatCents(amount));
    } catch (error: unknown) {
      this.handleError(error);
    } finally {
      this.saving.set(false);
    }
  }

  private handleError(error: unknown): void {
    const known = entryErrorsFrom(error);
    if (known === null || Object.keys(known).length === 0) {
      this.failure.set(serverMessage(error) ?? 'No se pudo guardar. Inténtalo de nuevo.');
      return;
    }
    this.serverErrors.set(known);
    if (known.date || known.account_id || known.tags || known.description || known.merchant) {
      this.detailsOpen.set(true);
    }
  }

  private reset(): void {
    this.clientStartedAt = new Date().toISOString();
    this.captureFlow.clearFailure();
    this.type.set('expense');
    this.amount.set(null);
    this.categoryId.set(null);
    this.openedOn = todayInMadrid();
    this.date.set(this.openedOn);
    this.accountId.set(null);
    this.description.set('');
    this.merchant.set('');
    this.note.set('');
    this.tags.set([]);
    this.detailsOpen.set(false);
    this.failure.set(null);
    this.serverErrors.set({});
    this.attempted.set(false);
  }

  private async loadDefaults(): Promise<void> {
    this.defaults.set(null);
    this.defaultsPending.set(true);
    try {
      const [defaults] = await Promise.all([
        firstValueFrom(this.quickAddApi.defaults()),
        this.reference.ensureLoaded(),
      ]);
      const accountId = defaults.account_id;
      if (accountId !== null && !this.reference.accounts().some((a) => a.id === accountId)) {
        await this.reference.refresh();
      }
      this.defaults.set(defaults);
      if (this.date() === this.openedOn) {
        this.date.set(defaults.date);
      }
      if (this.accountId() === null && defaults.account_id !== null) {
        this.accountId.set(String(defaults.account_id));
      }
    } catch {
      this.failure.set('No se pudieron cargar los valores por defecto. Revisa los detalles.');
      this.detailsOpen.set(true);
    } finally {
      this.defaultsPending.set(false);
    }
  }

  private focusAmount(attempt = 0): void {
    const element = this.host.nativeElement.ownerDocument.getElementById(QUICK_ADD_AMOUNT_ID);
    if (element !== null) {
      element.focus();
      return;
    }
    if (attempt < 20) {
      setTimeout(() => this.focusAmount(attempt + 1), 16);
    }
  }
}
