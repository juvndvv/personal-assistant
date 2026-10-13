import { Injectable, signal } from '@angular/core';
import { Transaction } from '../../core/api/models';

export interface TransferRequest {
  transferId: number | null;
  fromAccountId: number | null;
}

@Injectable({ providedIn: 'root' })
export class MovementSheets {
  readonly quickAddOpen = signal(false);
  readonly transferRequest = signal<TransferRequest | null>(null);
  readonly editTarget = signal<Transaction | null>(null);
  private readonly changeCount = signal(0);

  readonly changes = this.changeCount.asReadonly();

  openQuickAdd(): void {
    this.quickAddOpen.set(true);
  }

  openNewTransfer(fromAccountId: number | null = null): void {
    this.quickAddOpen.set(false);
    this.transferRequest.set({ transferId: null, fromAccountId });
  }

  openEdit(transaction: Transaction): void {
    if (transaction.transfer !== null) {
      this.transferRequest.set({ transferId: transaction.transfer.id, fromAccountId: null });
      return;
    }
    this.editTarget.set(transaction);
  }

  notifyChanged(): void {
    this.changeCount.update((count) => count + 1);
  }
}
