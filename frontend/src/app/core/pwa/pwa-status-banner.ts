import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideRefreshCw, lucideWifiOff } from '@ng-icons/lucide';
import { AppUpdates } from './app-updates';
import { ConnectivityStatus } from './connectivity-status';

@Component({
  selector: 'app-pwa-status-banner',
  imports: [NgIcon],
  providers: [provideIcons({ lucideRefreshCw, lucideWifiOff })],
  host: { class: 'sticky top-0 z-50 block' },
  template: `
    <div role="status" aria-live="polite">
      @if (!connectivity.online()) {
        <p
          class="flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-sm text-foreground"
          data-testid="offline-banner"
        >
          <ng-icon name="lucideWifiOff" size="16" aria-hidden="true" />
          Sin conexión. Finanzas necesita conexión para guardar y consultar datos.
        </p>
      }
    </div>
    @if (appUpdates.reloadRequired()) {
      <section
        class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2 text-sm text-foreground shadow-xs"
        role="alert"
        aria-labelledby="pwa-reload-title"
        data-testid="reload-banner"
      >
        <p id="pwa-reload-title" class="flex items-center gap-2 font-medium">
          <ng-icon name="lucideRefreshCw" size="16" aria-hidden="true" />
          Hay que recargar la aplicación para seguir usándola
        </p>
        <button
          type="button"
          class="min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90"
          (click)="appUpdates.reload()"
        >
          Recargar
        </button>
      </section>
    } @else if (appUpdates.updateReady()) {
      <section
        class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2 text-sm text-foreground shadow-xs"
        aria-labelledby="pwa-update-title"
        data-testid="update-banner"
      >
        <p id="pwa-update-title" class="flex items-center gap-2 font-medium">
          <ng-icon name="lucideRefreshCw" size="16" aria-hidden="true" />
          Nueva versión disponible
        </p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="min-h-11 rounded-xl px-3 font-medium text-muted-foreground hover:bg-muted"
            (click)="appUpdates.dismiss()"
          >
            Más tarde
          </button>
          <button
            type="button"
            class="min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90"
            (click)="applyUpdate()"
          >
            Actualizar
          </button>
        </div>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaStatusBanner {
  protected readonly connectivity = inject(ConnectivityStatus);
  protected readonly appUpdates = inject(AppUpdates);

  protected applyUpdate(): void {
    void this.appUpdates.applyUpdate();
  }
}
