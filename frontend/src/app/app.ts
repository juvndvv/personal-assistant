import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaStatusBanner } from './core/pwa/pwa-status-banner';
import { UiToaster } from './shared/ui/ui-toast';

@Component({
  selector: 'app-root',
  imports: [PwaStatusBanner, RouterOutlet, UiToaster],
  template: `
    <app-pwa-status-banner />
    <router-outlet />
    @defer (on idle) {
      <ui-toaster />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
