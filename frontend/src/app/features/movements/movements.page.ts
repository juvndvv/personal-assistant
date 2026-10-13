import { ChangeDetectionStrategy, Component } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowLeftRight } from '@ng-icons/lucide';
import { PageHeader } from '../../shared/layout/page-header';
import { UiEmptyState } from '../../shared/ui';

@Component({
  selector: 'app-movements-page',
  imports: [PageHeader, UiEmptyState],
  providers: [provideIcons({ lucideArrowLeftRight })],
  template: `
    <app-page-header title="Movimientos" />
    <ui-empty-state
      title="Próximamente"
      description="Aquí verás tus gastos, ingresos y transferencias."
      icon="lucideArrowLeftRight"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementsPage {}
