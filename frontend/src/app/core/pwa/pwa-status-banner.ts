import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideRefreshCw, lucideWifiOff } from '@ng-icons/lucide';
import { UiButton } from '../../shared/ui';
import { AppUpdates } from './app-updates';
import { ConnectivityStatus } from './connectivity-status';

export const STATUS_BANNER_HEIGHT = '--status-banner-height';

@Component({
  selector: 'app-pwa-status-banner',
  imports: [NgIcon, UiButton],
  providers: [provideIcons({ lucideRefreshCw, lucideWifiOff })],
  host: { class: 'sticky top-0 z-50 block' },
  template: `
    <div role="status" aria-live="polite">
      @if (!connectivity.online()) {
        <p
          class="flex items-center justify-center gap-2 bg-callout-warning px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 text-sm text-foreground"
          data-testid="offline-banner"
        >
          <ng-icon name="lucideWifiOff" size="16" class="text-warning-text" aria-hidden="true" />
          Sin conexión. Finanzas necesita conexión para guardar y consultar datos.
        </p>
      }
    </div>
    @if (appUpdates.reloadRequired()) {
      <section
        class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-hairline bg-card px-4 pb-2 text-sm text-foreground shadow-card"
        [class]="connectivity.online() ? safeAreaPadding : 'pt-2'"
        role="alert"
        aria-labelledby="pwa-reload-title"
        data-testid="reload-banner"
      >
        <p id="pwa-reload-title" class="flex items-center gap-2 font-medium">
          <ng-icon name="lucideRefreshCw" size="16" aria-hidden="true" />
          Hay que recargar la aplicación para seguir usándola
        </p>
        <ui-button (clicked)="appUpdates.reload()">Recargar</ui-button>
      </section>
    } @else if (appUpdates.updateReady()) {
      <section
        class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-hairline bg-card px-4 pb-2 text-sm text-foreground shadow-card"
        [class]="connectivity.online() ? safeAreaPadding : 'pt-2'"
        aria-labelledby="pwa-update-title"
        data-testid="update-banner"
      >
        <p id="pwa-update-title" class="flex items-center gap-2 font-medium">
          <ng-icon name="lucideRefreshCw" size="16" aria-hidden="true" />
          Nueva versión disponible
        </p>
        <div class="flex items-center gap-2">
          <ui-button variant="ghost" (clicked)="appUpdates.dismiss()">Más tarde</ui-button>
          <ui-button (clicked)="applyUpdate()">Actualizar</ui-button>
        </div>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaStatusBanner {
  protected readonly connectivity = inject(ConnectivityStatus);
  protected readonly appUpdates = inject(AppUpdates);
  protected readonly safeAreaPadding = 'pt-[calc(env(safe-area-inset-top)+0.5rem)]';

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const rootStyle = inject(DOCUMENT).documentElement.style;
    const publishHeight = (height: number) =>
      rootStyle.setProperty(STATUS_BANNER_HEIGHT, `${Math.round(height)}px`);
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => rootStyle.removeProperty(STATUS_BANNER_HEIGHT));
    afterNextRender(() => {
      publishHeight(host.offsetHeight);
      const observer = new ResizeObserver(() => publishHeight(host.offsetHeight));
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected applyUpdate(): void {
    void this.appUpdates.applyUpdate();
  }
}
