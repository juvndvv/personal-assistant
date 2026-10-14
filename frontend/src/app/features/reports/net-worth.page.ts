import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NetWorth } from '../../core/api/models';
import { ReportsApi } from '../../core/api/reports.api';
import { formatDate } from '../../core/date/iso-date';
import { EurPipe } from '../../core/money/eur.pipe';
import { formatCents } from '../../core/money/format-cents';
import { StatTile } from '../../shared/charts';
import { PageHeader } from '../../shared/layout/page-header';
import { UiAlert, UiBadge, UiCard, UiSkeleton, UiSkeletonList } from '../../shared/ui';
import { ACCOUNT_TYPE_LABELS } from '../accounts/account-types';
import { ReportsNav } from './reports-nav';
import { netWorthUpdatedLabel, staleAccountsMessage } from './net-worth-display';

@Component({
  selector: 'app-net-worth-page',
  imports: [
    EurPipe,
    PageHeader,
    ReportsNav,
    RouterLink,
    StatTile,
    UiAlert,
    UiBadge,
    UiCard,
    UiSkeleton,
    UiSkeletonList,
  ],
  template: `
    <app-page-header title="Informes" />
    <app-reports-nav class="mb-4 block" />

    @if (failed()) {
      <ui-alert retryable [retrying]="loading()" (retry)="load()">
        No se pudo cargar el patrimonio. Inténtalo de nuevo.
      </ui-alert>
    } @else if (netWorth(); as data) {
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <section uiCard padding="lg" aria-labelledby="net-worth-heading">
          <h2 id="net-worth-heading" class="text-sm text-muted-foreground">
            Patrimonio neto a {{ dateLabel() }}
          </h2>
          <p
            class="amount mt-1 text-4xl"
            [class]="data.total_cents < 0 ? 'text-danger-text' : 'text-foreground'"
            data-testid="net-worth-total"
          >
            {{ data.total_cents | eur }}
          </p>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <app-stat-tile
              data-testid="net-worth-assets"
              label="Activos"
              variant="card"
              [value]="eur(data.assets_cents)"
            />
            <app-stat-tile
              data-testid="net-worth-liabilities"
              label="Deudas"
              variant="card"
              [value]="eur(data.liabilities_cents)"
              [tone]="data.liabilities_cents < 0 ? 'negative' : 'neutral'"
            />
          </div>
          @if (staleMessage(); as message) {
            <ui-alert
              class="mt-4"
              tone="warning"
              title="Saldos desactualizados"
              data-testid="stale-warning"
            >
              {{ message }}
            </ui-alert>
          }
        </section>

        <section aria-labelledby="net-worth-accounts-heading">
          <h2
            id="net-worth-accounts-heading"
            class="mb-2 px-1 text-sm font-semibold text-muted-foreground"
          >
            Saldo por cuenta
          </h2>
          <ul uiCard divided aria-label="Saldo por cuenta">
            @for (account of data.accounts; track account.id) {
              <li>
                <a
                  [routerLink]="['/cuentas', account.id]"
                  class="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-hover active:bg-pressed"
                  data-testid="net-worth-account"
                >
                  <div class="min-w-0">
                    <p class="flex flex-wrap items-center gap-2 font-medium text-foreground">
                      <span class="truncate">{{ account.name }}</span>
                      @if (account.archived) {
                        <ui-badge tone="neutral">Archivada</ui-badge>
                      }
                      @if (account.stale && !account.archived) {
                        <ui-badge tone="warning">Desactualizada</ui-badge>
                      }
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {{ typeLabel[account.type] }} · {{ updatedLabel(account.last_updated_on) }}
                    </p>
                  </div>
                  <span class="amount shrink-0 text-foreground">{{
                    account.balance_cents | eur
                  }}</span>
                </a>
              </li>
            }
          </ul>
          <p class="mt-2 px-1 text-xs text-muted-foreground">
            Las tarjetas restan su deuda. El efectivo y el ahorro se marcan como desactualizados si
            no se actualizan en 30 días.
          </p>
        </section>
      </div>
    } @else {
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <ui-card padding="lg" role="status" aria-live="polite">
          <span class="sr-only">Cargando patrimonio</span>
          <ui-skeleton width="45%" />
          <ui-skeleton shape="amount" width="12rem" height="2.5rem" class="mt-3" />
          <div class="mt-4 grid grid-cols-2 gap-3">
            <ui-skeleton shape="block" height="4.5rem" />
            <ui-skeleton shape="block" height="4.5rem" />
          </div>
        </ui-card>
        <ui-card padding="none">
          <ui-skeleton-list label="Cargando cuentas" [rows]="4" />
        </ui-card>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetWorthPage {
  private readonly api = inject(ReportsApi);

  protected readonly typeLabel = ACCOUNT_TYPE_LABELS;
  protected readonly netWorth = signal<NetWorth | null>(null);
  protected readonly failed = signal(false);
  protected readonly loading = signal(false);
  protected readonly dateLabel = computed(() => {
    const date = this.netWorth()?.date;
    return date === undefined ? '' : formatDate(date, 'long');
  });
  protected readonly staleMessage = computed(() =>
    staleAccountsMessage(this.netWorth()?.accounts ?? []),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.netWorth().subscribe({
      next: (netWorth) => {
        this.netWorth.set(netWorth);
        this.failed.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected updatedLabel(date: string | null): string {
    return netWorthUpdatedLabel(date);
  }

  protected eur(cents: number): string {
    return formatCents(cents);
  }
}
