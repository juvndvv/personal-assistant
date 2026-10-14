import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideWallet } from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { Account } from '../../core/api/models';
import { EurPipe } from '../../core/money/eur.pipe';
import { PageHeader } from '../../shared/layout/page-header';
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiCheckbox,
  UiEmptyState,
  UiSkeletonList,
} from '../../shared/ui';
import {
  balanceToneClass,
  groupAccountsByType,
  groupTotalToneClass,
  isArchived,
  isCardDebt,
  lastUpdatedLabel,
} from './account-types';

@Component({
  selector: 'app-accounts-page',
  imports: [
    EurPipe,
    PageHeader,
    RouterLink,
    UiAlert,
    UiBadge,
    UiButton,
    UiCard,
    UiCheckbox,
    UiEmptyState,
    UiSkeletonList,
  ],
  providers: [provideIcons({ lucideWallet })],
  template: `
    <app-page-header
      title="Cuentas"
      subtitle="Saldos calculados a partir de tus movimientos."
      backLink="/mas"
      backLabel="Más"
    />

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <ui-checkbox
        name="include_archived"
        [checked]="includeArchived()"
        (checkedChange)="toggleArchived($event)"
      >
        Mostrar archivadas
      </ui-checkbox>
      <ui-button (clicked)="createAccount()">Nueva cuenta</ui-button>
    </div>

    @if (loadFailed()) {
      <ui-alert retryable [retrying]="loading()" (retry)="reload()">
        No se pudieron cargar las cuentas.
      </ui-alert>
    } @else if (!loaded()) {
      <ui-card padding="none">
        <ui-skeleton-list label="Cargando cuentas" [rows]="4" />
      </ui-card>
    } @else if (accounts().length === 0) {
      <ui-empty-state
        title="Aún no tienes cuentas"
        description="Crea tu primera cuenta para empezar a registrar movimientos."
        icon="lucideWallet"
      >
        <ui-button (clicked)="createAccount()">Crear mi primera cuenta</ui-button>
      </ui-empty-state>
    } @else {
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        @for (group of groups(); track group.type) {
          <section [attr.aria-labelledby]="'group-' + group.type">
            <div class="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h2 [id]="'group-' + group.type" class="text-sm font-semibold text-muted-foreground">
                {{ group.label }}
              </h2>
              <span class="amount text-sm" [class]="groupTone(group)">
                {{ group.totalCents | eur }}
              </span>
            </div>
            <ul uiCard divided>
              @for (account of group.accounts; track account.id) {
                <li>
                  <a
                    [routerLink]="['/cuentas', account.id]"
                    class="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-hover active:bg-pressed"
                    [attr.data-testid]="'account-row-' + account.id"
                  >
                    <div class="min-w-0">
                      <p class="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        <span class="truncate">{{ account.name }}</span>
                        @if (archived(account)) {
                          <ui-badge tone="neutral">Archivada</ui-badge>
                        }
                        @if (account.stale) {
                          <ui-badge tone="warning">Desactualizada</ui-badge>
                        }
                      </p>
                      <p class="text-xs text-muted-foreground">{{ lastUpdated(account) }}</p>
                    </div>
                    <div class="flex shrink-0 flex-col items-end">
                      <span class="amount text-lg" [class]="balanceTone(account)">
                        {{ account.balance_cents | eur }}
                      </span>
                      @if (cardDebt(account)) {
                        <span class="text-xs text-muted-foreground">Deuda</span>
                      }
                    </div>
                  </a>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountsPage {
  private readonly api = inject(AccountsApi);
  private readonly router = inject(Router);

  protected readonly accounts = signal<Account[]>([]);
  protected readonly includeArchived = signal(false);
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly groups = computed(() => groupAccountsByType(this.accounts()));
  protected readonly archived = isArchived;
  protected readonly cardDebt = isCardDebt;
  protected readonly balanceTone = balanceToneClass;
  protected readonly groupTone = groupTotalToneClass;

  constructor() {
    void this.load();
  }

  protected toggleArchived(include: boolean): void {
    this.includeArchived.set(include);
    void this.load();
  }

  protected createAccount(): void {
    void this.router.navigateByUrl('/cuentas/nueva');
  }

  protected lastUpdated(account: Account): string {
    return lastUpdatedLabel(account);
  }

  protected reload(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.accounts.set(await firstValueFrom(this.api.list(this.includeArchived())));
      this.loadFailed.set(false);
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loaded.set(true);
      this.loading.set(false);
    }
  }
}
