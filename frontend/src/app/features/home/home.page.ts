import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideReceipt, lucideWallet } from '@ng-icons/lucide';
import { catchError, combineLatest, filter, firstValueFrom, map, of, switchMap } from 'rxjs';
import { NetWorth, PeriodLabel, PeriodSummary, Transaction } from '../../core/api/models';
import { ReportsApi } from '../../core/api/reports.api';
import { TransactionsApi } from '../../core/api/transactions.api';
import { EurPipe } from '../../core/money/eur.pipe';
import { formatCents } from '../../core/money/format-cents';
import { ProgressBar, StatTile, formatBasisPoints } from '../../shared/charts';
import { PageHeader } from '../../shared/layout/page-header';
import { UiAlert, UiBadge, UiButton, UiCard, UiEmptyState, UiSkeleton } from '../../shared/ui';
import { BudgetCard } from '../budgets/budget-card';
import { categoryColorVar } from '../categories/category-appearance';
import { CategoryIcon } from '../categories/category-icon';
import { PendingDrafts } from '../drafts/pending-drafts';
import { ForecastCard } from '../recurring/forecast-card';
import { netWorthUpdatedLabel, staleAccountsMessage } from '../reports/net-worth-display';
import { PeriodNavigator } from '../reports/period/period-navigator';
import { PeriodSwitcher } from '../reports/period/period-switcher';
import { savingsTone } from '../reports/reports-display';
import { TransactionRow } from '../transactions/list/transaction-row';
import { CategoryVisual, LedgerReferenceData } from '../transactions/reference-data';
import { MovementActions } from '../transactions/movement-actions';
import { MovementSheets } from '../transactions/movement-sheets';

export const RECENT_MOVEMENTS = 10;
export const TOP_CATEGORIES = 5;
const SKELETON_ROWS = [0, 1, 2, 3];

@Component({
  selector: 'app-home-page',
  imports: [
    BudgetCard,
    CategoryIcon,
    EurPipe,
    ForecastCard,
    PageHeader,
    PeriodSwitcher,
    ProgressBar,
    RouterLink,
    StatTile,
    TransactionRow,
    UiAlert,
    UiBadge,
    UiButton,
    UiCard,
    UiEmptyState,
    UiSkeleton,
  ],
  providers: [provideIcons({ lucideReceipt, lucideWallet }), PeriodNavigator],
  template: `
    <app-page-header title="Inicio" />
    @if (loadFailed()) {
      <ui-alert retryable [retrying]="basicsRetrying()" (retry)="retryBasics()">
        No se pudo cargar tu resumen. Inténtalo de nuevo.
      </ui-alert>
    } @else if (netWorth(); as worth) {
      @if (worth.accounts.length === 0) {
        <ui-empty-state
          title="Empieza creando tu primera cuenta"
          description="Añade tu cuenta corriente, efectivo, tarjeta o ahorro para registrar movimientos y ver tus saldos."
          icon="lucideWallet"
        >
          <ui-button (clicked)="createFirstAccount()">Crear mi primera cuenta</ui-button>
        </ui-empty-state>
      } @else {
        <app-period-switcher
          [label]="navigator.label()"
          [period]="summary()?.period ?? null"
          [canGoNext]="navigator.canGoNext()"
          [isCurrent]="navigator.isCurrent()"
          (previous)="navigator.previous()"
          (next)="navigator.next()"
          (current)="navigator.goToCurrent()"
        />

        <div
          class="mt-4 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[repeat(4,auto)_1fr] lg:items-start"
          data-testid="home-grid"
        >
          <div class="lg:col-start-1 lg:row-start-1">
            @if (summaryFailed()) {
              <ui-alert
                retryable
                [retrying]="summaryBusy()"
                (retry)="retrySummary()"
                data-testid="summary-failed"
              >
                No se pudo cargar el resumen de este periodo. Inténtalo de nuevo.
              </ui-alert>
            } @else if (summary(); as data) {
              <section
                uiCard
                class="transition-opacity duration-150"
                [class.opacity-60]="summaryBusy()"
                aria-labelledby="period-heading"
                data-testid="period-overview"
              >
                <div class="mb-3 flex items-baseline justify-between gap-2">
                  <h2 id="period-heading" class="text-lg font-semibold text-foreground">
                    Ingresos y gastos
                  </h2>
                  <a
                    routerLink="/informes"
                    [queryParams]="{ period: data.period.label }"
                    class="text-sm text-link hover:underline"
                    >Ver informe</a
                  >
                </div>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <app-stat-tile
                    data-testid="home-income"
                    label="Ingresos"
                    [value]="incomeLabel(data.income_cents)"
                    [tone]="data.income_cents > 0 ? 'positive' : 'neutral'"
                  />
                  <app-stat-tile
                    data-testid="home-expense"
                    label="Gastos"
                    [value]="eur(data.expense_cents)"
                  />
                  <app-stat-tile
                    class="col-span-2 sm:col-span-1"
                    data-testid="home-savings-rate"
                    label="Tasa de ahorro"
                    [value]="rate(data.savings_rate_bp)"
                    [tone]="rateTone()"
                    [hint]="data.savings_rate_bp === null ? 'Sin ingresos' : null"
                  />
                </div>
                @if (data.income_cents > 0) {
                  <div class="mt-4">
                    <p class="mb-1.5 text-sm text-muted-foreground" data-testid="spent-share">
                      Has gastado el {{ spentShareLabel() }} de tus ingresos
                    </p>
                    <app-progress-bar
                      [value]="data.expense_cents"
                      [max]="data.income_cents"
                      label="Gastos sobre ingresos"
                      [valueText]="spentShareLabel()"
                      [tone]="data.expense_cents > data.income_cents ? 'over' : 'neutral'"
                    />
                  </div>
                }
              </section>
            } @else {
              <div uiCard role="status" aria-live="polite" data-testid="period-overview-loading">
                <span class="sr-only">Cargando resumen del periodo</span>
                <ui-skeleton shape="title" />
                <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <ui-skeleton shape="block" height="4.5rem" />
                  <ui-skeleton shape="block" height="4.5rem" />
                  <ui-skeleton class="col-span-2 sm:col-span-1" shape="block" height="4.5rem" />
                </div>
                <ui-skeleton class="mt-4" width="60%" />
              </div>
            }
          </div>

          <section uiCard class="lg:col-start-2 lg:row-start-1" aria-labelledby="net-worth-heading">
            <div class="flex items-baseline justify-between gap-2">
              <h2 id="net-worth-heading" class="text-sm text-muted-foreground">Patrimonio neto</h2>
              <a routerLink="/informes/patrimonio" class="text-sm text-link hover:underline">
                Detalle
              </a>
            </div>
            <p
              class="amount mt-1 text-4xl"
              [class]="worth.total_cents < 0 ? 'text-danger-text' : 'text-foreground'"
              data-testid="net-worth"
            >
              {{ worth.total_cents | eur }}
            </p>
            @if (archivedWithBalanceCount() > 0) {
              <a
                routerLink="/informes/patrimonio"
                class="mt-1 inline-block text-xs text-muted-foreground hover:text-link hover:underline"
                data-testid="archived-included"
              >
                {{ archivedIncludedLabel() }}
              </a>
            }
            @if (staleMessage(); as message) {
              <ui-alert tone="warning" class="mt-3" data-testid="stale-warning">
                {{ message }}
              </ui-alert>
            }
            <ul class="mt-4 divide-y divide-border" aria-label="Cuentas">
              @for (account of activeAccounts(); track account.id) {
                <li>
                  <a
                    [routerLink]="['/cuentas', account.id]"
                    class="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-menu-item px-2 py-2 transition-colors duration-150 hover:bg-hover active:bg-pressed"
                  >
                    <span class="min-w-0">
                      <span class="flex items-center gap-2">
                        <span class="truncate text-foreground">{{ account.name }}</span>
                        @if (account.stale) {
                          <ui-badge tone="warning">Desactualizada</ui-badge>
                        }
                      </span>
                      <span class="block text-xs text-muted-foreground">
                        {{ updatedLabel(account.last_updated_on) }}
                      </span>
                    </span>
                    <span
                      class="amount shrink-0"
                      [class]="account.balance_cents < 0 ? 'text-danger-text' : 'text-foreground'"
                      >{{ account.balance_cents | eur }}</span
                    >
                  </a>
                </li>
              }
            </ul>
            <a routerLink="/cuentas" class="mt-3 inline-block text-sm text-link hover:underline">
              Ver cuentas ({{ activeAccounts().length }})
            </a>
          </section>

          <a
            uiCard
            interactive
            padding="none"
            routerLink="/pendientes"
            class="flex items-center justify-between gap-3 px-5 py-4 lg:col-start-2 lg:row-start-2"
            data-testid="pending-drafts"
          >
            <span class="text-foreground">Borradores pendientes de revisar</span>
            <span class="amount text-xl text-foreground">{{ pendingCount() }}</span>
          </a>

          <app-forecast-card
            class="lg:col-start-2 lg:row-start-3"
            [period]="navigator.label() ?? undefined"
          />

          <app-budget-card class="lg:col-start-2 lg:row-start-4" [period]="navigator.label()" />

          @if (topCategories().length > 0) {
            <section
              uiCard
              class="lg:col-start-1 lg:row-[2/4]"
              aria-labelledby="top-categories-heading"
            >
              <h2 id="top-categories-heading" class="mb-3 text-lg font-semibold text-foreground">
                Dónde más gastas
              </h2>
              <ul class="flex flex-col gap-3" aria-label="Categorías con más gasto">
                @for (category of topCategories(); track category.category_id) {
                  <li>
                    <a
                      routerLink="/informes"
                      [queryParams]="{
                        period: summary()?.period?.label,
                        category: category.category_id,
                      }"
                      class="-mx-2 flex items-center gap-3 rounded-menu-item px-2 py-1 transition-colors duration-150 hover:bg-hover active:bg-pressed"
                      data-testid="top-category"
                    >
                      <app-category-icon
                        size="sm"
                        [icon]="visualOf(category.category_id).icon"
                        [color]="visualOf(category.category_id).color"
                      />
                      <span class="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span class="flex items-baseline justify-between gap-3">
                          <span class="truncate text-foreground" data-testid="top-category-name">{{
                            category.name
                          }}</span>
                          <span class="flex shrink-0 items-baseline gap-1.5">
                            <span class="amount text-foreground">{{
                              category.amount_cents | eur
                            }}</span>
                            <span class="text-xs text-muted-foreground tabular-nums">{{
                              rate(category.share_bp)
                            }}</span>
                          </span>
                        </span>
                        <app-progress-bar
                          [value]="category.share_bp"
                          [color]="paletteColorOf(category.category_id)"
                          [label]="'Peso de ' + category.name"
                          [valueText]="rate(category.share_bp)"
                        />
                      </span>
                    </a>
                  </li>
                }
              </ul>
            </section>
          }

          <section
            class="lg:col-start-1 lg:row-end-[-1]"
            [class]="topCategories().length > 0 ? 'lg:row-start-4' : 'lg:row-start-2'"
            aria-labelledby="recent-heading"
          >
            <div class="mb-3 flex items-baseline justify-between">
              <h2 id="recent-heading" class="text-lg font-semibold text-foreground">
                Actividad reciente
              </h2>
              <a routerLink="/movimientos" class="text-sm text-link hover:underline">Ver todos</a>
            </div>
            @if (recent().length === 0) {
              <ui-card padding="none" data-testid="recent-empty">
                <ui-empty-state
                  title="Aún no has registrado movimientos"
                  description="Tus últimos gastos, ingresos y transferencias aparecerán aquí."
                  icon="lucideReceipt"
                >
                  <ui-button variant="secondary" (clicked)="sheets.openQuickAdd()"
                    >Añadir movimiento</ui-button
                  >
                </ui-empty-state>
              </ui-card>
            } @else {
              <ul uiCard divided aria-label="Actividad reciente">
                @for (transaction of recent(); track transaction.id) {
                  <li>
                    <app-transaction-row
                      [transaction]="transaction"
                      (edit)="sheets.openEdit($event)"
                      (remove)="actions.delete($event)"
                    />
                  </li>
                }
              </ul>
            }
          </section>
        </div>
      }
    } @else {
      <div role="status" aria-live="polite" data-testid="home-loading">
        <span class="sr-only">Cargando tu resumen</span>
        <ui-skeleton shape="pill" width="14rem" />
        <div
          class="mt-4 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start"
        >
          <div class="flex flex-col gap-6">
            <ui-card>
              <ui-skeleton shape="title" />
              <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <ui-skeleton shape="block" height="4.5rem" />
                <ui-skeleton shape="block" height="4.5rem" />
                <ui-skeleton class="col-span-2 sm:col-span-1" shape="block" height="4.5rem" />
              </div>
            </ui-card>
            <ui-card divided>
              @for (row of skeletonRows; track row) {
                <div class="flex items-center gap-3 px-4 py-3">
                  <ui-skeleton shape="circle" />
                  <div class="flex min-w-0 flex-1 flex-col gap-2">
                    <ui-skeleton width="55%" />
                    <ui-skeleton width="35%" />
                  </div>
                  <ui-skeleton width="4.5rem" height="1.125rem" />
                </div>
              }
            </ui-card>
          </div>
          <ui-card>
            <ui-skeleton width="40%" />
            <ui-skeleton shape="amount" class="mt-3" width="12rem" height="2.25rem" />
            <ui-skeleton class="mt-5" [lines]="4" />
          </ui-card>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly reportsApi = inject(ReportsApi);
  private readonly transactionsApi = inject(TransactionsApi);
  private readonly pendingDrafts = inject(PendingDrafts);
  private readonly router = inject(Router);
  protected readonly navigator = inject(PeriodNavigator);
  protected readonly sheets = inject(MovementSheets);
  protected readonly actions = inject(MovementActions);

  protected readonly netWorth = signal<NetWorth | null>(null);
  protected readonly summary = signal<PeriodSummary | null>(null);
  protected readonly summaryBusy = signal(false);
  protected readonly summaryFailed = signal(false);
  protected readonly recent = signal<Transaction[]>([]);
  protected readonly loadFailed = signal(false);
  protected readonly basicsRetrying = signal(false);
  private readonly summaryAttempt = signal(0);
  protected readonly pendingCount = this.pendingDrafts.count;
  protected readonly skeletonRows = SKELETON_ROWS;

  protected readonly activeAccounts = computed(() =>
    (this.netWorth()?.accounts ?? []).filter((account) => !account.archived),
  );
  protected readonly archivedWithBalanceCount = computed(
    () =>
      (this.netWorth()?.accounts ?? []).filter(
        (account) => account.archived && account.balance_cents !== 0,
      ).length,
  );
  protected readonly archivedIncludedLabel = computed(() => {
    const count = this.archivedWithBalanceCount();
    return count === 1 ? 'Incluye 1 cuenta archivada' : `Incluye ${count} cuentas archivadas`;
  });
  protected readonly staleMessage = computed(() =>
    staleAccountsMessage(this.netWorth()?.accounts ?? []),
  );
  protected readonly rateTone = computed(() =>
    savingsTone(this.summary()?.savings_rate_bp ?? null),
  );
  protected readonly spentShareLabel = computed(() => {
    const data = this.summary();
    if (data === null || data.income_cents === 0) {
      return '';
    }
    return formatBasisPoints(Math.round((data.expense_cents * 10_000) / data.income_cents));
  });
  private readonly reference = inject(LedgerReferenceData);

  protected readonly topCategories = computed(() =>
    [...(this.summary()?.by_category.expense ?? [])]
      .sort((left, right) => right.amount_cents - left.amount_cents)
      .slice(0, TOP_CATEGORIES),
  );

  constructor() {
    void this.reference.ensureLoaded().catch(() => undefined);
    const changes$ = toObservable(this.sheets.changes);

    changes$
      .pipe(
        switchMap(() => this.loadBasics()),
        takeUntilDestroyed(),
      )
      .subscribe();

    combineLatest([toObservable(this.navigator.label), changes$, toObservable(this.summaryAttempt)])
      .pipe(
        map(([label]) => label),
        filter((label): label is PeriodLabel => label !== null),
        switchMap((label) => {
          this.summaryBusy.set(true);
          return this.reportsApi.summary(label).pipe(
            map((summary) => ({ summary, failed: false })),
            catchError(() => of({ summary: null, failed: true })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ summary, failed }) => {
        this.summary.set(summary);
        this.summaryFailed.set(failed);
        this.summaryBusy.set(false);
      });
  }

  protected createFirstAccount(): void {
    void this.router.navigateByUrl('/cuentas/nueva');
  }

  protected async retryBasics(): Promise<void> {
    if (this.basicsRetrying()) {
      return;
    }
    this.basicsRetrying.set(true);
    try {
      await this.loadBasics();
    } finally {
      this.basicsRetrying.set(false);
    }
  }

  protected retrySummary(): void {
    this.summaryAttempt.update((attempt) => attempt + 1);
  }

  protected incomeLabel(cents: number): string {
    return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);
  }

  protected eur(cents: number): string {
    return formatCents(cents);
  }

  protected rate(basisPoints: number | null): string {
    return formatBasisPoints(basisPoints);
  }

  protected visualOf(categoryId: number): CategoryVisual {
    return this.reference.visualOf(categoryId);
  }

  protected paletteColorOf(categoryId: number): string | null {
    return categoryColorVar(this.reference.visualOf(categoryId).color);
  }

  protected updatedLabel(date: string | null): string {
    return netWorthUpdatedLabel(date);
  }

  private async loadBasics(): Promise<void> {
    void this.pendingDrafts.refresh();
    try {
      const [netWorth, recent] = await Promise.all([
        firstValueFrom(this.reportsApi.netWorth()),
        firstValueFrom(
          this.transactionsApi.list({ page: 1, per_page: RECENT_MOVEMENTS }).pipe(
            map((page) => page.data),
            catchError(() => of<Transaction[]>([])),
          ),
        ),
      ]);
      this.netWorth.set(netWorth);
      this.recent.set(recent);
      this.loadFailed.set(false);
    } catch {
      this.loadFailed.set(true);
    }
  }
}
