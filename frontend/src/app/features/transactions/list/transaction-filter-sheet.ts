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
import {
  Period,
  TRANSACTION_ORIGINS,
  TRANSACTION_TYPES,
  Tag,
  TransactionOrigin,
  TransactionType,
} from '../../../core/api/models';
import { TagsApi } from '../../../core/api/tags.api';
import { formatPeriodLabel } from '../../../core/date/period-label';
import {
  UiButton,
  UiCheckbox,
  UiDateInput,
  UiMoneyInput,
  UiSegmented,
  UiSelect,
  UiSheet,
  UiSheetFooter,
} from '../../../shared/ui';
import { LedgerReferenceData } from '../reference-data';
import { ReferenceLoadAlert } from '../reference-load-alert';
import { TRANSACTION_ORIGIN_LABELS, TRANSACTION_TYPE_LABELS } from '../transaction-display';
import {
  ALL_PERIODS,
  EMPTY_FILTERS,
  TransactionFilters,
  hasDateRange,
} from './transaction-filters';

const CURRENT_PERIOD = '';

@Component({
  selector: 'app-transaction-filter-sheet',
  imports: [
    ReferenceLoadAlert,
    UiButton,
    UiCheckbox,
    UiDateInput,
    UiMoneyInput,
    UiSegmented,
    UiSelect,
    UiSheet,
    UiSheetFooter,
  ],
  template: `
    <ui-sheet [(open)]="open" title="Filtros">
      <div class="flex flex-col gap-6 pb-4">
        <app-reference-load-alert />
        <section class="flex flex-col gap-3">
          <h3 class="text-sm font-semibold text-foreground">Fechas</h3>
          <ui-segmented
            ariaLabel="Tipo de fechas"
            onGlass
            [options]="dateModes"
            [value]="dateMode()"
            (valueChange)="dateMode.set($event === 'range' ? 'range' : 'period')"
          />
          @if (dateMode() === 'period') {
            <ui-select
              label="Periodo"
              [options]="periodOptions()"
              [value]="draft().period ?? currentPeriod"
              (valueChange)="patch({ period: $event === null || $event === '' ? null : $event })"
            />
          } @else {
            <div class="grid grid-cols-2 gap-3">
              <ui-date-input
                label="Desde"
                [value]="draft().dateFrom"
                (valueChange)="patch({ dateFrom: $event })"
              />
              <ui-date-input
                label="Hasta"
                [value]="draft().dateTo"
                (valueChange)="patch({ dateTo: $event })"
              />
            </div>
          }
        </section>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-semibold text-foreground">Tipo</legend>
          @for (type of types; track type) {
            <ui-checkbox
              [checked]="draft().types.includes(type)"
              (checkedChange)="toggleType(type, $event)"
              >{{ typeLabels[type] }}</ui-checkbox
            >
          }
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-semibold text-foreground">Cuentas</legend>
          @for (account of reference.accounts(); track account.id) {
            <ui-checkbox
              [checked]="draft().accountIds.includes(account.id)"
              (checkedChange)="toggleId('accountIds', account.id, $event)"
              >{{ account.name }}</ui-checkbox
            >
          }
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-semibold text-foreground">Categorías</legend>
          <div class="flex max-h-56 flex-col gap-2 overflow-y-auto">
            @for (category of reference.categories(); track category.id) {
              <ui-checkbox
                [checked]="draft().categoryIds.includes(category.id)"
                (checkedChange)="toggleId('categoryIds', category.id, $event)"
                >{{ category.label }}</ui-checkbox
              >
            }
          </div>
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-semibold text-foreground">Etiquetas</legend>
          @if (tags().length === 0) {
            <p class="text-sm text-muted-foreground">Aún no tienes etiquetas.</p>
          } @else {
            <ui-segmented
              ariaLabel="Coincidencia de etiquetas"
              onGlass
              [options]="tagModes"
              [value]="draft().tagMode"
              (valueChange)="patch({ tagMode: $event === 'all' ? 'all' : 'any' })"
            />
            <div class="flex max-h-48 flex-col gap-2 overflow-y-auto">
              @for (tag of tags(); track tag.id) {
                <ui-checkbox
                  [checked]="draft().tagIds.includes(tag.id)"
                  (checkedChange)="toggleId('tagIds', tag.id, $event)"
                  >{{ tag.name }}</ui-checkbox
                >
              }
            </div>
          }
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-semibold text-foreground">Origen</legend>
          @for (origin of origins; track origin) {
            <ui-checkbox
              [checked]="draft().origins.includes(origin)"
              (checkedChange)="toggleOrigin(origin, $event)"
              >{{ originLabels[origin] }}</ui-checkbox
            >
          }
        </fieldset>

        <section class="grid grid-cols-2 gap-3">
          <ui-money-input
            label="Importe mínimo"
            [value]="draft().amountMinCents"
            (valueChange)="patch({ amountMinCents: $event })"
          />
          <ui-money-input
            label="Importe máximo"
            [value]="draft().amountMaxCents"
            (valueChange)="patch({ amountMaxCents: $event })"
          />
        </section>

        <ui-select
          label="Justificante"
          [options]="receiptOptions"
          [value]="receiptValue()"
          (valueChange)="
            patch({ hasAttachments: $event === '1' ? true : $event === '0' ? false : null })
          "
        />
      </div>
      <div uiSheetFooter class="flex flex-col gap-2">
        <ui-button [fullWidth]="true" (clicked)="apply()">Aplicar filtros</ui-button>
        <ui-button variant="ghost" [fullWidth]="true" (clicked)="clear()"
          >Limpiar filtros</ui-button
        >
      </div>
    </ui-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionFilterSheet {
  private readonly tagsApi = inject(TagsApi);
  protected readonly reference = inject(LedgerReferenceData);

  readonly open = model(false);
  readonly filters = input.required<TransactionFilters>();
  readonly periods = input<readonly Period[]>([]);
  readonly applied = output<TransactionFilters>();

  protected readonly currentPeriod = CURRENT_PERIOD;
  protected readonly types = TRANSACTION_TYPES;
  protected readonly origins = TRANSACTION_ORIGINS;
  protected readonly typeLabels = TRANSACTION_TYPE_LABELS;
  protected readonly originLabels = TRANSACTION_ORIGIN_LABELS;
  protected readonly dateModes = [
    { value: 'period', label: 'Periodo' },
    { value: 'range', label: 'Rango de fechas' },
  ];
  protected readonly tagModes = [
    { value: 'any', label: 'Cualquiera' },
    { value: 'all', label: 'Todas' },
  ];
  protected readonly receiptOptions = [
    { value: '', label: 'Indiferente' },
    { value: '1', label: 'Con justificante' },
    { value: '0', label: 'Sin justificante' },
  ];

  protected readonly draft = signal<TransactionFilters>(EMPTY_FILTERS);
  protected readonly dateMode = signal<'period' | 'range'>('period');
  protected readonly tags = signal<Tag[]>([]);

  protected readonly periodOptions = computed(() => [
    { value: CURRENT_PERIOD, label: 'Periodo actual' },
    { value: ALL_PERIODS, label: 'Todo el historial' },
    ...[...this.periods()].reverse().map((period) => ({
      value: period.label,
      label: capitalize(formatPeriodLabel(period.label)),
    })),
  ]);
  protected readonly receiptValue = computed(() => {
    const value = this.draft().hasAttachments;
    return value === null ? '' : value ? '1' : '0';
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          const filters = this.filters();
          this.draft.set(filters);
          this.dateMode.set(hasDateRange(filters) ? 'range' : 'period');
          void this.loadTags();
          void this.reference.ensureLoaded().catch(() => undefined);
        });
      }
    });
  }

  protected patch(change: Partial<TransactionFilters>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected toggleType(type: TransactionType, checked: boolean): void {
    this.patch({ types: toggled(this.draft().types, type, checked) });
  }

  protected toggleOrigin(origin: TransactionOrigin, checked: boolean): void {
    this.patch({ origins: toggled(this.draft().origins, origin, checked) });
  }

  protected toggleId(
    key: 'accountIds' | 'categoryIds' | 'tagIds',
    id: number,
    checked: boolean,
  ): void {
    this.patch({ [key]: toggled(this.draft()[key], id, checked) });
  }

  protected apply(): void {
    const draft = this.draft();
    const filters =
      this.dateMode() === 'period'
        ? { ...draft, dateFrom: null, dateTo: null }
        : { ...draft, period: null };
    this.applied.emit(filters);
    this.open.set(false);
  }

  protected clear(): void {
    this.applied.emit({ ...EMPTY_FILTERS, q: this.filters().q });
    this.open.set(false);
  }

  private async loadTags(): Promise<void> {
    try {
      this.tags.set(await firstValueFrom(this.tagsApi.list()));
    } catch {
      this.tags.set([]);
    }
  }
}

function toggled<T>(values: readonly T[], value: T, checked: boolean): T[] {
  const without = values.filter((existing) => existing !== value);
  return checked ? [...without, value] : without;
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('es-ES') + text.slice(1);
}
