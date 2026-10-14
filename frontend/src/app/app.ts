import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter, first, map } from 'rxjs';
import { BootSplash } from './core/boot/boot-splash';
import { PwaStatusBanner } from './core/pwa/pwa-status-banner';
import { UiToaster } from './shared/ui/ui-toast';

@Component({
  selector: 'app-root',
  imports: [BootSplash, PwaStatusBanner, RouterOutlet, UiToaster],
  template: `
    @defer (on idle) {
      <app-pwa-status-banner />
    }
    @if (booting()) {
      <app-boot-splash />
    }
    <router-outlet />
    @defer (on idle) {
      <ui-toaster />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly booting = toSignal(
    inject(Router).events.pipe(
      filter(
        (event) =>
          event instanceof NavigationEnd ||
          (event instanceof NavigationCancel &&
            event.code !== NavigationCancellationCode.Redirect) ||
          event instanceof NavigationError ||
          event instanceof NavigationSkipped,
      ),
      first(),
      map(() => false),
    ),
    { initialValue: true },
  );
}
