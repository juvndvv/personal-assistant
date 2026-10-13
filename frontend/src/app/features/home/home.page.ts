import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideWallet } from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { Account } from '../../core/api/models';
import { EurPipe } from '../../core/money/eur.pipe';
import { PageHeader } from '../../shared/layout/page-header';
import { UiButton, UiEmptyState } from '../../shared/ui';

@Component({
  selector: 'app-home-page',
  imports: [EurPipe, PageHeader, RouterLink, UiButton, UiEmptyState],
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
          <a routerLink="/cuentas" class="mt-3 inline-block text-sm text-primary hover:underline">
            Ver cuentas ({{ activeCount() }})
          </a>
        </section>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly api = inject(AccountsApi);
  private readonly router = inject(Router);

  protected readonly accounts = signal<Account[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly netWorthCents = computed(() =>
    this.accounts().reduce((total, account) => total + account.balance_cents, 0),
  );
  protected readonly activeCount = computed(
    () => this.accounts().filter((account) => account.archived_at === null).length,
  );

  constructor() {
    void this.load();
  }

  protected createFirstAccount(): void {
    void this.router.navigateByUrl('/cuentas/nueva');
  }

  private async load(): Promise<void> {
    try {
      this.accounts.set(await firstValueFrom(this.api.list(true)));
      this.loaded.set(true);
    } catch {
      this.loadFailed.set(true);
    }
  }
}
