import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { serverMessage, validationErrors } from '../../core/api/api-error';
import { Account, Period, Settings } from '../../core/api/models';
import { PeriodsApi } from '../../core/api/periods.api';
import { SettingsApi } from '../../core/api/settings.api';
import { formatDate } from '../../core/date/iso-date';
import { formatPeriodLabel } from '../../core/date/period-label';
import { ThemeService, isThemePreference } from '../../core/theme/theme.service';
import { PageHeader } from '../../shared/layout/page-header';
import {
  UiAlert,
  UiButton,
  UiCard,
  UiInput,
  UiSegmentOption,
  UiSegmented,
  UiSelect,
  UiSelectOption,
  UiSkeleton,
  UiSwitch,
  UiToast,
} from '../../shared/ui';

const MONTH_START_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);
const TTL_MIN_DAYS = 1;
const TTL_MAX_DAYS = 90;
const SKELETON_FIELDS = [0, 1, 2];
const THEME_OPTIONS: readonly UiSegmentOption[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
];

interface SettingsErrors {
  month_start_day?: string;
  default_account_id?: string;
  orphan_draft_ttl_days?: string;
}

@Component({
  selector: 'app-settings-page',
  imports: [
    PageHeader,
    UiAlert,
    UiButton,
    UiCard,
    UiInput,
    UiSegmented,
    UiSelect,
    UiSkeleton,
    UiSwitch,
  ],
  template: `
    <app-page-header title="Ajustes" backLink="/mas" backLabel="Más" />

    <section uiCard class="mb-6 flex flex-col gap-4" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" class="text-lg font-semibold text-foreground">Apariencia</h2>
      <div class="flex flex-col gap-2">
        <p id="theme-label" class="text-sm font-medium text-foreground">Tema</p>
        <ui-segmented
          ariaLabel="Tema"
          [options]="themeOptions"
          [value]="theme.preference()"
          (valueChange)="onThemeChange($event)"
        />
      </div>
      <ui-switch
        [checked]="theme.reducedTransparency()"
        (checkedChange)="theme.setReducedTransparency($event)"
        description="Usa superficies opacas en barras, paneles y menús."
        >Reducir transparencia</ui-switch
      >
    </section>

    @if (loadFailed()) {
      <ui-alert retryable [retrying]="loading()" (retry)="load()">
        No se pudieron cargar los ajustes.
      </ui-alert>
    } @else if (loaded()) {
      @if (failure(); as message) {
        <ui-alert class="mb-4">{{ message }}</ui-alert>
      }
      <form uiCard padding="lg" class="flex flex-col gap-6" novalidate (submit)="save($event)">
        <section class="flex flex-col gap-3">
          <ui-select
            label="Día de inicio del mes"
            name="month_start_day"
            [required]="true"
            [options]="dayOptions"
            [value]="monthStartDay()"
            (valueChange)="onMonthStartDayChange($event)"
            [state]="errors().month_start_day ? 'error' : 'default'"
            [hint]="
              errors().month_start_day ??
              'Usa 1 para el mes natural o el día en que cobras (por ejemplo, 25).'
            "
          />
          <div
            uiCard
            variant="grouped"
            padding="sm"
            class="text-sm"
            aria-live="polite"
            data-testid="period-preview"
          >
            @if (preview(); as period) {
              <p class="font-medium text-foreground">Periodo actual: {{ periodName(period) }}</p>
              <p class="text-muted-foreground">
                Del {{ longDate(period.start) }} al {{ longDate(period.end) }}
              </p>
            } @else if (previewFailed()) {
              <ui-alert retryable (retry)="retryPreview()"
                >No se pudo calcular el periodo.</ui-alert
              >
            } @else {
              <span class="sr-only">Calculando periodo</span>
              <ui-skeleton width="55%" />
              <ui-skeleton class="mt-2" width="70%" />
            }
          </div>
        </section>

        <ui-select
          label="Cuenta por defecto"
          name="default_account_id"
          placeholder="Sin cuenta por defecto"
          [options]="accountOptions()"
          [(value)]="defaultAccountId"
          [state]="errors().default_account_id ? 'error' : 'default'"
          [hint]="
            errors().default_account_id ??
            'Se propone al registrar un movimiento si no has usado otra recientemente.'
          "
        />

        <ui-input
          label="Días para descartar borradores sin confirmar"
          name="orphan_draft_ttl_days"
          inputmode="numeric"
          [required]="true"
          [(value)]="ttlDays"
          [state]="errors().orphan_draft_ttl_days ? 'error' : 'default'"
          [hint]="
            errors().orphan_draft_ttl_days ??
            'Los borradores de voz o foto sin confirmar se eliminan pasado este plazo (1 a 90).'
          "
        />

        <div class="flex justify-end">
          <ui-button type="submit" [loading]="saving()">Guardar ajustes</ui-button>
        </div>
      </form>
    } @else {
      <div uiCard padding="lg" role="status" aria-live="polite" data-testid="settings-loading">
        <span class="sr-only">Cargando ajustes</span>
        <div class="flex flex-col gap-6">
          @for (field of skeletonFields; track field) {
            <div class="flex flex-col gap-2">
              <ui-skeleton width="40%" />
              <ui-skeleton shape="block" height="2.75rem" />
            </div>
          }
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  private readonly settingsApi = inject(SettingsApi);
  private readonly periodsApi = inject(PeriodsApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly toast = inject(UiToast);
  protected readonly theme = inject(ThemeService);
  protected readonly themeOptions = THEME_OPTIONS;

  protected readonly dayOptions: UiSelectOption[] = MONTH_START_DAYS.map((day) => ({
    value: String(day),
    label: day === 1 ? '1 (mes natural)' : String(day),
  }));

  protected readonly skeletonFields = SKELETON_FIELDS;
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly monthStartDay = signal<string>('1');
  protected readonly defaultAccountId = signal<string | null>(null);
  protected readonly ttlDays = signal('7');
  protected readonly preview = signal<Period | null>(null);
  protected readonly previewFailed = signal(false);
  private readonly serverErrors = signal<SettingsErrors>({});
  private latestPreview = 0;

  protected readonly accountOptions = computed<UiSelectOption[]>(() =>
    this.accounts().map((account) => ({ value: String(account.id), label: account.name })),
  );

  private readonly clientErrors = computed<SettingsErrors>(() => {
    const ttl = this.ttlDays().trim();
    const days = Number(ttl);
    return /^\d+$/.test(ttl) && days >= TTL_MIN_DAYS && days <= TTL_MAX_DAYS
      ? {}
      : {
          orphan_draft_ttl_days: `Indica un número de días entre ${TTL_MIN_DAYS} y ${TTL_MAX_DAYS}.`,
        };
  });

  protected readonly errors = computed<SettingsErrors>(() => ({
    ...this.serverErrors(),
    ...this.clientErrors(),
  }));

  constructor() {
    void this.load();
  }

  protected periodName(period: Period): string {
    return formatPeriodLabel(period.label);
  }

  protected longDate(date: string): string {
    return formatDate(date, 'medium');
  }

  protected onThemeChange(value: string): void {
    if (isThemePreference(value)) {
      this.theme.setPreference(value);
    }
  }

  protected onMonthStartDayChange(value: string | null): void {
    if (value === null) {
      return;
    }
    this.monthStartDay.set(value);
    void this.loadPreview(Number(value));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving() || Object.keys(this.clientErrors()).length > 0) {
      return;
    }
    this.saving.set(true);
    this.serverErrors.set({});
    this.failure.set(null);
    try {
      const defaultAccountId = this.defaultAccountId();
      const settings = await firstValueFrom(
        this.settingsApi.update({
          month_start_day: Number(this.monthStartDay()),
          default_account_id: defaultAccountId === null ? null : Number(defaultAccountId),
          orphan_draft_ttl_days: Number(this.ttlDays().trim()),
        }),
      );
      this.apply(settings);
      this.toast.success('Ajustes guardados');
    } catch (error: unknown) {
      const fields = validationErrors(error);
      if (fields === null) {
        this.failure.set(serverMessage(error) ?? 'No se pudieron guardar los ajustes.');
      } else {
        this.serverErrors.set(fields);
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async load(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    try {
      const [settings, accounts] = await Promise.all([
        firstValueFrom(this.settingsApi.get()),
        firstValueFrom(this.accountsApi.list()),
      ]);
      this.accounts.set(accounts);
      this.apply(settings);
      this.loaded.set(true);
      this.loadFailed.set(false);
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private apply(settings: Settings): void {
    this.monthStartDay.set(String(settings.month_start_day));
    this.defaultAccountId.set(
      settings.default_account_id === null ? null : String(settings.default_account_id),
    );
    this.ttlDays.set(String(settings.orphan_draft_ttl_days));
    this.preview.set(settings.current_period);
    this.previewFailed.set(false);
  }

  protected retryPreview(): void {
    void this.loadPreview(Number(this.monthStartDay()));
  }

  private async loadPreview(monthStartDay: number): Promise<void> {
    const request = ++this.latestPreview;
    this.preview.set(null);
    this.previewFailed.set(false);
    try {
      const period = await firstValueFrom(this.periodsApi.current(monthStartDay));
      if (request === this.latestPreview) {
        this.preview.set(period);
      }
    } catch {
      if (request === this.latestPreview) {
        this.previewFailed.set(true);
      }
    }
  }
}
