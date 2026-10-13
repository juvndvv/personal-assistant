import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { serverMessage } from '../../core/api/api-error';
import { Transaction } from '../../core/api/models';
import { TransactionsApi } from '../../core/api/transactions.api';
import { TransfersApi } from '../../core/api/transfers.api';
import { UiToast } from '../../shared/ui';
import { MovementSheets } from './movement-sheets';

@Injectable({ providedIn: 'root' })
export class MovementActions {
  private readonly transactions = inject(TransactionsApi);
  private readonly transfers = inject(TransfersApi);
  private readonly sheets = inject(MovementSheets);
  private readonly toast = inject(UiToast);

  delete(transaction: Transaction): Promise<boolean> {
    return transaction.transfer === null
      ? this.remove(this.transactions.delete(transaction.id), 'Movimiento eliminado', () =>
          this.transactions.restore(transaction.id),
        )
      : this.deleteTransfer(transaction.transfer.id);
  }

  deleteTransfer(transferId: number): Promise<boolean> {
    return this.remove(this.transfers.delete(transferId), 'Transferencia eliminada', () =>
      this.transfers.restore(transferId),
    );
  }

  announceCreated(message: string, created: Transaction, description: string): void {
    this.toast.success(message, {
      description,
      action: { label: 'Deshacer', onClick: () => void this.undoCreate(created.id) },
    });
  }

  async undoCreate(transactionId: number): Promise<void> {
    try {
      await firstValueFrom(this.transactions.delete(transactionId), { defaultValue: undefined });
      this.sheets.notifyChanged();
      this.toast.info('Movimiento deshecho');
    } catch (error: unknown) {
      this.toast.error(serverMessage(error) ?? 'No se pudo deshacer.');
    }
  }

  private async remove(
    removal: Observable<void>,
    message: string,
    restoration: () => Observable<unknown>,
  ): Promise<boolean> {
    try {
      await firstValueFrom(removal, { defaultValue: undefined });
    } catch (error: unknown) {
      this.toast.error(serverMessage(error) ?? 'No se pudo eliminar el movimiento.');
      return false;
    }
    this.sheets.notifyChanged();
    this.toast.success(message, {
      action: { label: 'Deshacer', onClick: () => void this.restore(restoration) },
    });
    return true;
  }

  private async restore(restoration: () => Observable<unknown>): Promise<void> {
    try {
      await firstValueFrom(restoration());
      this.sheets.notifyChanged();
      this.toast.info('Movimiento restaurado');
    } catch (error: unknown) {
      this.toast.error(serverMessage(error) ?? 'No se pudo restaurar el movimiento.');
    }
  }
}
