import { ChangeDetectionStrategy, Component } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideHouse } from '@ng-icons/lucide';
import { PageHeader } from '../../shared/layout/page-header';
import { UiEmptyState } from '../../shared/ui';

@Component({
  selector: 'app-home-page',
  imports: [PageHeader, UiEmptyState],
  providers: [provideIcons({ lucideHouse })],
  template: `
    <app-page-header title="Inicio" />
    <ui-empty-state
      title="Próximamente"
      description="Tu resumen del periodo aparecerá aquí."
      icon="lucideHouse"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {}
