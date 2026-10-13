import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTriangleAlert } from '@ng-icons/lucide';
import { NetWorth } from '../../core/api/models';
import { ReportsApi } from '../../core/api/reports.api';
import { formatDate } from '../../core/date/iso-date';
import { EurPipe } from '../../core/money/eur.pipe';
import { formatCents } from '../../core/money/format-cents';
import { StatTile } from '../../shared/charts';
import { PageHeader } from '../../shared/layout/page-header';
import { UiBadge } from '../../shared/ui';
import { ACCOUNT_TYPE_LABELS } from '../accounts/account-types';
import { ReportsNav } from './reports-nav';
import { netWorthUpdatedLabel, staleAccountsMessage } from './net-worth-display';

@Component({
  selector: 'app-net-worth-page',
  imports: [EurPipe, NgIcon, PageHeader, ReportsNav, RouterLink, StatTile, UiBadge],
  providers: [provideIcons({ lucideTriangleAlert })],
  template: `
    <app-page-header title="Informes" />
    <app-reports-nav class="mb-4 block" />

    @if (failed()) {
      <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        No se pudo cargar el patrimonio. Inténtalo de nuevo.
      </p>
    } @else if (netWorth(); as data) {
      <section
        class="rounded-2xl border border-border bg-background p-5"
        aria-labelledby="net-worth-heading"
      >
        <h2 id="net-worth-heading" class="text-sm text-muted-foreground">
          Patrimonio neto a {{ dateLabel() }}
        </h2>
        <p
          class="mt-1 text-4xl font-semibold"
          [class]="data.total_cents < 0 ? 'text-destructive' : 'text-foreground'"
          data-testid="net-worth-total"
        >
          {{ data.total_cents | eur }}
        </p>
        <div class="mt-4 grid grid-cols-2 gap-3">
          <app-stat-tile
            data-testid="net-worth-assets"
            label="Activos"
            [value]="eur(data.assets_cents)"
          />
          <app-stat-tile
            data-testid="net-worth-liabilities"
            label="Deudas"
            [value]="eur(data.liabilities_cents)"
            [tone]="data.liabilities_cents < 0 ? 'negative' : 'neutral'"
          />
        </div>
        @if (staleMessage(); as message) {
          <p
            class="mt-4 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-foreground"
            data-testid="stale-warning"
          >
            <ng-icon
              name="lucideTriangleAlert"
              size="16"
              aria-hidden="true"
              class="mt-0.5 shrink-0"
              style="color: var(--viz-status-warning)"
            />
            {{ message }}
          </p>
        }
      </section>

      <section class="mt-6" aria-labelledby="net-worth-accounts-heading">
        <h2
          id="net-worth-accounts-heading"
          class="mb-2 px-1 text-sm font-semibold text-muted-foreground"
        >
          Saldo por cuenta
        </h2>
        <ul
          class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background"
          aria-label="Saldo por cuenta"
        >
          @for (account of data.accounts; track account.id) {
            <li>
              <a
                [routerLink]="['/cuentas', account.id]"
                class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/60"
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
                <span
                  class="shrink-0 tabular-nums"
                  [class]="account.balance_cents < 0 ? 'text-destructive' : 'text-foreground'"
                  >{{ account.balance_cents | eur }}</span
                >
              </a>
            </li>
          }
        </ul>
        <p class="mt-2 px-1 text-xs text-muted-foreground">
          Las tarjetas restan su deuda. El efectivo y el ahorro se marcan como desactualizados si no
          se actualizan en 30 días.
        </p>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetWorthPage {
  private readonly api = inject(ReportsApi);

  protected readonly typeLabel = ACCOUNT_TYPE_LABELS;
  protected readonly netWorth = signal<NetWorth | null>(null);
  protected readonly failed = signal(false);
  protected readonly dateLabel = computed(() => {
    const date = this.netWorth()?.date;
    return date === undefined ? '' : formatDate(date, 'long');
  });
  protected readonly staleMessage = computed(() =>
    staleAccountsMessage(this.netWorth()?.accounts ?? []),
  );

  constructor() {
    this.api.netWorth().subscribe({
      next: (netWorth) => this.netWorth.set(netWorth),
      error: () => this.failed.set(true),
    });
  }

  protected updatedLabel(date: string | null): string {
    return netWorthUpdatedLabel(date);
  }

  protected eur(cents: number): string {
    return formatCents(cents);
  }
}
