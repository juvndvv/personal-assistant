import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom, skip } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { conflictCode, serverMessage } from '../../core/api/api-error';
import { Account, TransactionListQuery } from '../../core/api/models';
import { EurPipe } from '../../core/money/eur.pipe';
import { PageHeader } from '../../shared/layout/page-header';
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiDialog,
  UiDialogFooter,
  UiSkeleton,
  UiToast,
} from '../../shared/ui';
import {
  ACCOUNT_TYPE_LABELS,
  balanceLabel,
  balanceToneClass,
  isArchived,
  isOverdrawn,
  lastUpdatedLabel,
} from './account-types';
import { TransactionFeed } from '../transactions/list/transaction-feed';
import { MovementSheets } from '../transactions/movement-sheets';
import { AdjustBalanceSheet } from './adjust-balance-sheet';
import { SettleCardSheet } from './settle-card-sheet';

const HAS_MOVEMENTS_MESSAGE =
  'Esta cuenta tiene movimientos y no se puede eliminar. Archívala para ocultarla sin perder su historial.';

@Component({
  selector: 'app-account-detail-page',
  imports: [
    AdjustBalanceSheet,
    EurPipe,
    PageHeader,
    SettleCardSheet,
    TransactionFeed,
    UiAlert,
    UiBadge,
    UiButton,
    UiCard,
    UiDialog,
    UiDialogFooter,
    UiSkeleton,
  ],
  template: `
    <app-page-header
      [title]="account()?.name ?? 'Cuenta'"
      [subtitle]="typeLabel()"
      backLink="/cuentas"
      backLabel="Cuentas"
    />

    @if (loadFailed()) {
      <ui-alert class="mb-6" retryable [retrying]="loading()" (retry)="reload()">
        No se pudo cargar la cuenta.
      </ui-alert>
    } @else if (account() === null) {
      <ui-card class="mb-6" padding="lg">
        <div role="status" aria-live="polite">
          <span class="sr-only">Cargando cuenta</span>
          <ui-skeleton width="4rem" />
          <ui-skeleton shape="amount" class="mt-3" width="10rem" />
          <ui-skeleton class="mt-3" width="40%" />
          <div class="mt-5 flex flex-wrap gap-2">
            <ui-skeleton shape="pill" width="8rem" />
            <ui-skeleton shape="pill" />
            <ui-skeleton shape="pill" />
          </div>
        </div>
      </ui-card>
    }

    @if (account(); as current) {
      @if (archived() || current.stale) {
        <div class="-mt-3 mb-4 flex flex-wrap gap-2" data-testid="account-status">
          @if (archived()) {
            <ui-badge tone="neutral">Archivada</ui-badge>
          }
          @if (current.stale) {
            <ui-badge tone="warning">Desactualizada</ui-badge>
          }
        </div>
      }

      <section uiCard padding="lg" class="mb-6" aria-label="Saldo de la cuenta">
        <p class="text-sm text-muted-foreground">{{ balanceLabel() }}</p>
        <p class="amount mt-1 text-4xl" [class]="balanceTone()" data-testid="account-balance">
          {{ current.balance_cents | eur }}
        </p>
        <p class="mt-1 text-sm text-muted-foreground">{{ updatedLabel() }}</p>
        @if (overdrawn()) {
          <p class="mt-2 text-sm text-danger-text">La cuenta está en descubierto.</p>
        }
        @if (current.stale) {
          <ui-alert tone="warning" class="mt-4">
            Hace más de 30 días que no actualizas esta cuenta. Ajusta el saldo para mantenerla al
            día.
          </ui-alert>
        }
        @if (current.type === 'credit_card') {
          <dl class="mt-4 grid grid-cols-2 gap-3 rounded-menu-item bg-fill-on-card p-3 text-sm">
            <div>
              <dt class="text-muted-foreground">Día de corte</dt>
              <dd class="font-medium text-foreground">
                {{ current.statement_day ?? 'Sin día de corte' }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Cuenta de pago</dt>
              <dd class="font-medium text-foreground">{{ settlementName() }}</dd>
            </div>
          </dl>
        }
        <div class="mt-5 flex flex-wrap gap-2">
          @if (current.type === 'credit_card') {
            <ui-button [disabled]="archived()" (clicked)="settleOpen.set(true)">
              Liquidar tarjeta
            </ui-button>
          }
          <ui-button
            [variant]="current.type === 'credit_card' ? 'outline' : 'primary'"
            [disabled]="archived()"
            (clicked)="adjustOpen.set(true)"
          >
            Ajustar saldo
          </ui-button>
          <ui-button
            variant="outline"
            [disabled]="archived()"
            (clicked)="sheets.openNewTransfer(current.id)"
          >
            Transferir
          </ui-button>
          <ui-button variant="outline" (clicked)="edit()">Editar</ui-button>
          @if (archived()) {
            <ui-button variant="outline" [loading]="busy()" (clicked)="unarchive()">
              Desarchivar
            </ui-button>
          } @else {
            <ui-button variant="outline" [loading]="busy()" (clicked)="archive()">
              Archivar
            </ui-button>
          }
          <ui-button variant="ghost" (clicked)="openDelete()">Eliminar</ui-button>
        </div>
      </section>

      <section aria-labelledby="account-movements-heading" class="mb-6">
        <h2 id="account-movements-heading" class="mb-3 text-lg font-semibold text-foreground">
          Movimientos
        </h2>
        <app-transaction-feed
          [query]="movementsQuery()"
          [accountScoped]="true"
          emptyDescription="Esta cuenta aún no tiene movimientos."
        />
      </section>

      <app-adjust-balance-sheet
        [(open)]="adjustOpen"
        [account]="current"
        (adjusted)="sheets.notifyChanged()"
      />
      @if (current.type === 'credit_card') {
        <app-settle-card-sheet [(open)]="settleOpen" [card]="current" />
      }

      <ui-dialog
        [(open)]="deleteOpen"
        title="Eliminar cuenta"
        [description]="'¿Seguro que quieres eliminar ' + current.name + '?'"
      >
        @if (deleteError(); as message) {
          <ui-alert>{{ message }}</ui-alert>
        }
        <div uiDialogFooter class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ui-button variant="outline" (clicked)="deleteOpen.set(false)">Cancelar</ui-button>
          @if (hasMovements()) {
            <ui-button [loading]="busy()" (clicked)="archiveInstead()">Archivar</ui-button>
          } @else {
            <ui-button variant="danger" [loading]="busy()" (clicked)="remove()">
              Eliminar
            </ui-button>
          }
        </div>
      </ui-dialog>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDetailPage implements OnInit {
  private readonly api = inject(AccountsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(UiToast);

  readonly id = input.required<string>();

  protected readonly account = signal<Account | null>(null);
  protected readonly settlementName = signal('Sin cuenta de pago');
  protected readonly loadFailed = signal(false);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly sheets = inject(MovementSheets);
  protected readonly adjustOpen = signal(false);
  protected readonly settleOpen = signal(false);
  protected readonly movementsQuery = computed<TransactionListQuery>(() => ({
    account_id: [Number(this.id())],
  }));
  protected readonly deleteOpen = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly hasMovements = signal(false);

  protected readonly archived = computed(() => {
    const account = this.account();
    return account !== null && isArchived(account);
  });
  protected readonly typeLabel = computed(() => {
    const account = this.account();
    return account === null ? '' : ACCOUNT_TYPE_LABELS[account.type];
  });
  protected readonly balanceLabel = computed(() => {
    const account = this.account();
    return account === null ? 'Saldo' : balanceLabel(account);
  });
  protected readonly balanceTone = computed(() => {
    const account = this.account();
    return account === null ? 'text-foreground' : balanceToneClass(account);
  });
  protected readonly overdrawn = computed(() => {
    const account = this.account();
    return account !== null && isOverdrawn(account);
  });
  protected readonly updatedLabel = computed(() => {
    const account = this.account();
    return account === null ? '' : lastUpdatedLabel(account);
  });

  constructor() {
    toObservable(this.sheets.changes)
      .pipe(skip(1), takeUntilDestroyed())
      .subscribe(() => void this.reload());
  }

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const account = await firstValueFrom(this.api.get(Number(this.id())));
      this.account.set(account);
      this.loadFailed.set(false);
      await this.loadSettlementName(account);
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected edit(): void {
    void this.router.navigate(['/cuentas', this.id(), 'editar']);
  }

  protected async archive(): Promise<void> {
    await this.run(async (id) => {
      this.account.set(await firstValueFrom(this.api.archive(id)));
      this.toast.success('Cuenta archivada');
    });
  }

  protected async unarchive(): Promise<void> {
    await this.run(async (id) => {
      this.account.set(await firstValueFrom(this.api.unarchive(id)));
      this.toast.success('Cuenta desarchivada');
    });
  }

  protected openDelete(): void {
    this.deleteError.set(null);
    this.hasMovements.set(false);
    this.deleteOpen.set(true);
  }

  protected async remove(): Promise<void> {
    const account = this.account();
    if (account === null) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.delete(account.id));
      this.deleteOpen.set(false);
      this.toast.success('Cuenta eliminada');
      await this.router.navigateByUrl('/cuentas');
    } catch (error: unknown) {
      if (conflictCode(error) === 'account_has_movements') {
        this.hasMovements.set(true);
        this.deleteError.set(HAS_MOVEMENTS_MESSAGE);
      } else {
        this.deleteError.set(serverMessage(error) ?? 'No se pudo eliminar la cuenta.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async archiveInstead(): Promise<void> {
    await this.archive();
    this.deleteOpen.set(false);
  }

  private async run(action: (id: number) => Promise<void>): Promise<void> {
    const account = this.account();
    if (account === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await action(account.id);
    } catch (error: unknown) {
      this.toast.error(serverMessage(error) ?? 'No se pudo completar la acción.');
    } finally {
      this.busy.set(false);
    }
  }

  private async loadSettlementName(account: Account): Promise<void> {
    if (account.settlement_account_id === null) {
      this.settlementName.set('Sin cuenta de pago');
      return;
    }
    try {
      const settlement = await firstValueFrom(this.api.get(account.settlement_account_id));
      this.settlementName.set(settlement.name);
    } catch {
      this.settlementName.set('No disponible');
    }
  }
}
