import { ChangeDetectionStrategy, Component } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';
import { PageHeader } from '../../shared/layout/page-header';
import { UiEmptyState } from '../../shared/ui';

@Component({
  selector: 'app-capture-page',
  imports: [PageHeader, UiEmptyState],
  providers: [provideIcons({ lucidePlus })],
  template: `
    <app-page-header title="Capturar" />
    <ui-empty-state
      title="Próximamente"
      description="Registra un gasto por voz, foto o a mano."
      icon="lucidePlus"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CapturePage {}
