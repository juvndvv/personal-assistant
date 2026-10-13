import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideWallet } from '@ng-icons/lucide';
import { catchError, firstValueFrom, map, of, switchMap } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { Account, Transaction } from '../../core/api/models';
import { TransactionsApi } from '../../core/api/transactions.api';
import { EurPipe } from '../../core/money/eur.pipe';
import { PageHeader } from '../../shared/layout/page-header';
import { UiButton, UiEmptyState } from '../../shared/ui';
import { ForecastCard } from '../recurring/forecast-card';
import { TransactionRow } from '../transactions/list/transaction-row';
import { MovementActions } from '../transactions/movement-actions';
import { MovementSheets } from '../transactions/movement-sheets';

export const RECENT_MOVEMENTS = 10;

@Component({
  selector: 'app-home-page',
  imports: [EurPipe, ForecastCard, PageHeader, RouterLink, TransactionRow, UiButton, UiEmptyState],
  providers: [provideIcons({ lucideWallet })],
  template: `
    <app-page-header title="Inicio" />
    @if (loadFailed()) {
      <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        No se pudo cargar tu resumen. Inténtalo de nuevo.
      </p>
    } @else if (loaded()) {
      @if (accounts().length === 0) {
        <ui-empty-state
          title="Empieza creando tu primera cuenta"
          description="Añade tu cuenta corriente, efectivo, tarjeta o ahorro para registrar movimientos y ver tus saldos."
          icon="lucideWallet"
        >
          <ui-button (clicked)="createFirstAccount()">Crear mi primera cuenta</ui-button>
        </ui-empty-state>
      } @else {
        <section class="rounded-2xl border border-border bg-background p-5">
          <p class="text-sm text-muted-foreground">Patrimonio neto</p>
          <p
            class="mt-1 text-3xl font-semibold tabular-nums"
            [class]="netWorthCents() < 0 ? 'text-destructive' : 'text-foreground'"
            data-testid="net-worth"
          >
            {{ netWorthCents() | eur }}
          </p>
          <ul class="mt-4 divide-y divide-border" aria-label="Cuentas">
            @for (account of activeAccounts(); track account.id) {
              <li>
                <a
                  [routerLink]="['/cuentas', account.id]"
                  class="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary"
                >
                  <span class="truncate text-foreground">{{ account.name }}</span>
                  <span
                    class="tabular-nums"
                    [class]="account.balance_cents < 0 ? 'text-destructive' : 'text-foreground'"
                    >{{ account.balance_cents | eur }}</span
                  >
                </a>
              </li>
            }
          </ul>
          <a routerLink="/cuentas" class="mt-3 inline-block text-sm text-primary hover:underline">
            Ver cuentas ({{ activeCount() }})
          </a>
        </section>

        <div class="mt-6">
          <app-forecast-card />
        </div>

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
  private readonly api = inject(AccountsApi);
  private readonly transactionsApi = inject(TransactionsApi);
  private readonly router = inject(Router);
  protected readonly sheets = inject(MovementSheets);
  protected readonly actions = inject(MovementActions);

  protected readonly accounts = signal<Account[]>([]);
  protected readonly recent = signal<Transaction[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly netWorthCents = computed(() =>
    this.accounts().reduce((total, account) => total + account.balance_cents, 0),
  );
  protected readonly activeAccounts = computed(() =>
    this.accounts().filter((account) => account.archived_at === null),
  );
  protected readonly activeCount = computed(() => this.activeAccounts().length);

  constructor() {
    toObservable(this.sheets.changes)
      .pipe(
        switchMap(() => this.load()),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected createFirstAccount(): void {
    void this.router.navigateByUrl('/cuentas/nueva');
  }

  private async load(): Promise<void> {
    try {
      const [accounts, recent] = await Promise.all([
        firstValueFrom(this.api.list(true)),
        firstValueFrom(
          this.transactionsApi.list({ page: 1, per_page: RECENT_MOVEMENTS }).pipe(
            map((page) => page.data),
            catchError(() => of<Transaction[]>([])),
          ),
        ),
      ]);
      this.accounts.set(accounts);
      this.recent.set(recent);
      this.loaded.set(true);
      this.loadFailed.set(false);
    } catch {
      this.loadFailed.set(true);
    }
  }
}
