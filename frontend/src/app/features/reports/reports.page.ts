import { ChangeDetectionStrategy, Component } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideChartPie } from '@ng-icons/lucide';
import { PageHeader } from '../../shared/layout/page-header';
import { UiEmptyState } from '../../shared/ui';

@Component({
  selector: 'app-reports-page',
  imports: [PageHeader, UiEmptyState],
  providers: [provideIcons({ lucideChartPie })],
  template: `
    <app-page-header title="Informes" />
    <ui-empty-state
      title="Próximamente"
      description="Gráficos de gastos, ingresos y presupuestos."
      icon="lucideChartPie"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {}
