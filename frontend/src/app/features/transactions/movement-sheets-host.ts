import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TransferFormSheet } from '../transfers/transfer-form-sheet';
import { TransactionEditSheet } from './edit/transaction-edit-sheet';
import { MovementSheets } from './movement-sheets';
import { QuickAddSheet } from './quick-add/quick-add-sheet';

@Component({
  selector: 'app-movement-sheets-host',
  imports: [QuickAddSheet, TransactionEditSheet, TransferFormSheet],
  template: `
    <app-quick-add-sheet [(open)]="sheets.quickAddOpen" />
    <app-transfer-form-sheet
      [request]="sheets.transferRequest()"
      (closed)="sheets.transferRequest.set(null)"
    />
    <app-transaction-edit-sheet
      [transaction]="sheets.editTarget()"
      (closed)="sheets.editTarget.set(null)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementSheetsHost {
  protected readonly sheets = inject(MovementSheets);
}
