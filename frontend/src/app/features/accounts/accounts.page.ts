import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideWallet } from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { Account } from '../../core/api/models';
import { EurPipe } from '../../core/money/eur.pipe';
import { PageHeader } from '../../shared/layout/page-header';
import { UiBadge, UiButton, UiCheckbox, UiEmptyState } from '../../shared/ui';
import { groupAccountsByType, isArchived, lastUpdatedLabel } from './account-types';

@Component({
  selector: 'app-accounts-page',
  imports: [EurPipe, PageHeader, RouterLink, UiBadge, UiButton, UiCheckbox, UiEmptyState],
  providers: [provideIcons({ lucideWallet })],
  template: `
    <app-page-header title="Cuentas" subtitle="Saldos calculados a partir de tus movimientos." />

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
      <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        No se pudieron cargar las cuentas. Inténtalo de nuevo.
      </p>
    } @else if (loaded() && accounts().length === 0) {
      <ui-empty-state
        title="Aún no tienes cuentas"
        description="Crea tu primera cuenta para empezar a registrar movimientos."
        icon="lucideWallet"
      >
        <ui-button (clicked)="createAccount()">Crear mi primera cuenta</ui-button>
      </ui-empty-state>
    } @else {
      <div class="flex flex-col gap-6">
        @for (group of groups(); track group.type) {
          <section [attr.aria-labelledby]="'group-' + group.type">
            <div class="mb-2 flex items-baseline justify-between px-1">
              <h2 [id]="'group-' + group.type" class="text-sm font-semibold text-muted-foreground">
                {{ group.label }}
              </h2>
              <span
                class="text-sm tabular-nums"
                [class]="group.totalCents < 0 ? 'text-destructive' : 'text-muted-foreground'"
              >
                {{ group.totalCents | eur }}
              </span>
            </div>
            <ul
              class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background"
            >
              @for (account of group.accounts; track account.id) {
                <li>
                  <a
                    [routerLink]="['/cuentas', account.id]"
                    class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/60"
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
                    <span
                      class="shrink-0 font-semibold tabular-nums"
                      [class]="account.balance_cents < 0 ? 'text-destructive' : 'text-foreground'"
                    >
                      {{ account.balance_cents | eur }}
                    </span>
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
  protected readonly loadFailed = signal(false);
  protected readonly groups = computed(() => groupAccountsByType(this.accounts()));
  protected readonly archived = isArchived;

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

  private async load(): Promise<void> {
    try {
      this.accounts.set(await firstValueFrom(this.api.list(this.includeArchived())));
      this.loadFailed.set(false);
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loaded.set(true);
    }
  }
}
