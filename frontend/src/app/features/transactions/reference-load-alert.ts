import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UiAlert } from '../../shared/ui';
import { LedgerReferenceData } from './reference-data';

export const REFERENCE_LOAD_FAILED_MESSAGE = 'No se pudieron cargar tus cuentas y categorías.';

@Component({
  selector: 'app-reference-load-alert',
  imports: [UiAlert],
  host: { class: 'contents' },
  template: `
    @if (reference.failed()) {
      <ui-alert
        retryable
        data-testid="reference-load-failed"
        [retrying]="reference.refreshing()"
        (retry)="reference.retry()"
        >{{ message }}</ui-alert
      >
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReferenceLoadAlert {
  protected readonly reference = inject(LedgerReferenceData);
  protected readonly message = REFERENCE_LOAD_FAILED_MESSAGE;
}
