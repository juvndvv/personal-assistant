import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideWallet } from '@ng-icons/lucide';
import { catchError, combineLatest, filter, firstValueFrom, map, of, switchMap } from 'rxjs';
import { NetWorth, PeriodLabel, PeriodSummary, Transaction } from '../../core/api/models';
import { ReportsApi } from '../../core/api/reports.api';
import { TransactionsApi } from '../../core/api/transactions.api';
import { EurPipe } from '../../core/money/eur.pipe';
import { formatCents } from '../../core/money/format-cents';
import { ProgressBar, StatTile, formatBasisPoints } from '../../shared/charts';
import { PageHeader } from '../../shared/layout/page-header';
import { UiBadge, UiButton, UiEmptyState } from '../../shared/ui';
import { PendingDrafts } from '../drafts/pending-drafts';
import { ForecastCard } from '../recurring/forecast-card';
import { netWorthUpdatedLabel, staleAccountsMessage } from '../reports/net-worth-display';
import { PeriodNavigator } from '../reports/period/period-navigator';
import { PeriodSwitcher } from '../reports/period/period-switcher';
import { savingsTone } from '../reports/reports-display';
import { TransactionRow } from '../transactions/list/transaction-row';
import { MovementActions } from '../transactions/movement-actions';
import { MovementSheets } from '../transactions/movement-sheets';

export const RECENT_MOVEMENTS = 10;
export const TOP_CATEGORIES = 5;

@Component({
  selector: 'app-home-page',
  imports: [
    EurPipe,
    ForecastCard,
    PageHeader,
    PeriodSwitcher,
    ProgressBar,
    RouterLink,
    StatTile,
    TransactionRow,
    UiBadge,
    UiButton,
    UiEmptyState,
  ],
  providers: [provideIcons({ lucideWallet }), PeriodNavigator],
  template: `
    <app-page-header title="Inicio" />
    @if (loadFailed()) {
      <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        No se pudo cargar tu resumen. Inténtalo de nuevo.
      </p>
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

        @if (summaryFailed()) {
          <p
            role="alert"
            class="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            data-testid="summary-failed"
          >
            No se pudo cargar el resumen de este periodo. Inténtalo de nuevo.
          </p>
        }

        @if (summary(); as data) {
          <section
            class="mt-4 rounded-2xl border border-border bg-background p-5 transition-opacity"
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
                class="text-sm text-primary hover:underline"
                >Ver informe</a
              >
            </div>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <app-stat-tile
                data-testid="home-income"
                label="Ingresos"
                [value]="eur(data.income_cents)"
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
                <p class="mb-1.5 text-xs text-muted-foreground" data-testid="spent-share">
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
        }

        <section
          class="mt-6 rounded-2xl border border-border bg-background p-5"
          aria-labelledby="net-worth-heading"
        >
          <div class="flex items-baseline justify-between gap-2">
            <h2 id="net-worth-heading" class="text-sm text-muted-foreground">Patrimonio neto</h2>
            <a routerLink="/informes/patrimonio" class="text-sm text-primary hover:underline">
              Detalle
            </a>
          </div>
          <p
            class="mt-1 text-3xl font-semibold"
            [class]="worth.total_cents < 0 ? 'text-destructive' : 'text-foreground'"
            data-testid="net-worth"
          >
            {{ worth.total_cents | eur }}
          </p>
          @if (archivedWithBalanceCount() > 0) {
            <a
              routerLink="/informes/patrimonio"
              class="mt-1 inline-block text-xs text-muted-foreground hover:text-primary hover:underline"
              data-testid="archived-included"
            >
              {{ archivedIncludedLabel() }}
            </a>
          }
          @if (staleMessage(); as message) {
            <p
              class="mt-3 rounded-lg bg-warning/15 px-3 py-2 text-xs text-foreground"
              data-testid="stale-warning"
            >
              {{ message }}
            </p>
          }
          <ul class="mt-4 divide-y divide-border" aria-label="Cuentas">
            @for (account of activeAccounts(); track account.id) {
              <li>
                <a
                  [routerLink]="['/cuentas', account.id]"
                  class="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary"
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
                    class="shrink-0 tabular-nums"
                    [class]="account.balance_cents < 0 ? 'text-destructive' : 'text-foreground'"
                    >{{ account.balance_cents | eur }}</span
                  >
                </a>
              </li>
            }
          </ul>
          <a routerLink="/cuentas" class="mt-3 inline-block text-sm text-primary hover:underline">
            Ver cuentas ({{ activeAccounts().length }})
          </a>
        </section>

        <a
          routerLink="/pendientes"
          class="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-5 py-4 hover:bg-muted/60"
          data-testid="pending-drafts"
        >
          <span class="text-sm text-foreground">Borradores pendientes de revisar</span>
          <span class="text-lg font-semibold text-foreground">{{ pendingCount() }}</span>
        </a>

        <div class="mt-6">
          <app-forecast-card [period]="navigator.label() ?? undefined" />
        </div>

        @if (topCategories().length > 0) {
          <section
            class="mt-6 rounded-2xl border border-border bg-background p-5"
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
                    class="flex flex-col gap-1.5 hover:text-primary"
                    data-testid="top-category"
                  >
                    <span class="flex items-baseline justify-between gap-3 text-sm">
                      <span class="truncate text-foreground">{{ category.name }}</span>
                      <span class="tabular-nums text-foreground">
                        {{ category.amount_cents | eur }}
                        <span class="ms-1 text-xs text-muted-foreground">{{
                          rate(category.share_bp)
                        }}</span>
                      </span>
                    </span>
                    <app-progress-bar
                      [value]="category.share_bp"
                      [label]="'Peso de ' + category.name"
                      [valueText]="rate(category.share_bp)"
                    />
                  </a>
                </li>
              }
            </ul>
          </section>
        }

        <section class="mt-6" aria-labelledby="recent-heading">
          <div class="mb-3 flex items-baseline justify-between">
            <h2 id="recent-heading" class="text-lg font-semibold text-foreground">
              Actividad reciente
            </h2>
            <a routerLink="/movimientos" class="text-sm text-primary hover:underline">Ver todos</a>
          </div>
          @if (recent().length === 0) {
            <p class="text-sm text-muted-foreground">Aún no has registrado movimientos.</p>
          } @else {
            <ul
              class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background"
              aria-label="Actividad reciente"
            >
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
      }
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
  protected readonly pendingCount = this.pendingDrafts.count;

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
  protected readonly topCategories = computed(() =>
    [...(this.summary()?.by_category.expense ?? [])]
      .sort((left, right) => right.amount_cents - left.amount_cents)
      .slice(0, TOP_CATEGORIES),
  );

  constructor() {
    const changes$ = toObservable(this.sheets.changes);

    changes$
      .pipe(
        switchMap(() => this.loadBasics()),
        takeUntilDestroyed(),
      )
      .subscribe();

    combineLatest([toObservable(this.navigator.label), changes$])
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

  protected eur(cents: number): string {
    return formatCents(cents);
  }

  protected rate(basisPoints: number | null): string {
    return formatBasisPoints(basisPoints);
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
