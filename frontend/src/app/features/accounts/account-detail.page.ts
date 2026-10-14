import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom, skip } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { conflictCode, serverMessage } from '../../core/api/api-error';
import { Account, TransactionListQuery } from '../../core/api/models';
import { EurPipe } from '../../core/money/eur.pipe';
import { UiBadge, UiButton, UiDialog, UiDialogFooter, UiToast } from '../../shared/ui';
import { ACCOUNT_TYPE_LABELS, isArchived, lastUpdatedLabel } from './account-types';
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
    RouterLink,
    SettleCardSheet,
    TransactionFeed,
    UiBadge,
    UiButton,
    UiDialog,
    UiDialogFooter,
  ],
  template: `
    <a routerLink="/cuentas" class="mb-4 inline-block text-sm text-primary-text hover:underline">
      ← Cuentas
    </a>

    @if (loadFailed()) {
      <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        No se pudo cargar la cuenta.
      </p>
    }

    @if (account(); as current) {
      <header class="mb-6">
        <p class="text-sm text-muted-foreground">{{ typeLabel() }}</p>
        <h1 class="flex flex-wrap items-center gap-2 text-2xl font-semibold text-foreground">
          {{ current.name }}
          @if (archived()) {
            <ui-badge tone="neutral">Archivada</ui-badge>
          }
          @if (current.stale) {
            <ui-badge tone="warning">Desactualizada</ui-badge>
          }
        </h1>
      </header>

      <section class="mb-6 rounded-2xl border border-border bg-background p-5">
        <p class="text-sm text-muted-foreground">Saldo</p>
        <p
          class="mt-1 text-3xl font-semibold tabular-nums"
          [class]="current.balance_cents < 0 ? 'text-destructive' : 'text-foreground'"
          data-testid="account-balance"
        >
          {{ current.balance_cents | eur }}
        </p>
        <p class="mt-1 text-sm text-muted-foreground">{{ updatedLabel() }}</p>
        @if (current.stale) {
          <p class="mt-2 text-sm text-warning">
            Hace más de 30 días que no actualizas esta cuenta. Ajusta el saldo para mantenerla al
            día.
          </p>
        }
        @if (current.type === 'credit_card') {
          <dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt class="text-muted-foreground">Día de corte</dt>
              <dd class="text-foreground">{{ current.statement_day ?? 'Sin día de corte' }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Cuenta de pago</dt>
              <dd class="text-foreground">{{ settlementName() }}</dd>
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
          <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ message }}
          </p>
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
    try {
      const account = await firstValueFrom(this.api.get(Number(this.id())));
      this.account.set(account);
      this.loadFailed.set(false);
      await this.loadSettlementName(account);
    } catch {
      this.loadFailed.set(true);
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
