import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCloudOff, lucideWifiOff } from '@ng-icons/lucide';
import { safeReturnUrl } from '../../core/auth/login-url';
import { ConnectivityStatus } from '../../core/pwa/connectivity-status';
import { UiButton } from '../../shared/ui';

@Component({
  selector: 'app-unavailable-page',
  imports: [NgIcon, UiButton],
  providers: [provideIcons({ lucideCloudOff, lucideWifiOff })],
  host: { class: 'block min-h-dvh bg-muted/40' },
  template: `
    <main
      class="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      <ng-icon
        [name]="connectivity.online() ? 'lucideCloudOff' : 'lucideWifiOff'"
        size="40"
        class="text-muted-foreground"
        aria-hidden="true"
      />
      <h1 class="text-2xl font-semibold text-foreground">{{ heading() }}</h1>
      <p role="status" class="text-sm text-muted-foreground">{{ explanation() }}</p>
      <ui-button size="lg" [fullWidth]="true" [loading]="retrying()" (clicked)="retry()">
        Reintentar
      </ui-button>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnavailablePage {
  protected readonly connectivity = inject(ConnectivityStatus);
  private readonly router = inject(Router);

  readonly returnUrl = input<string | undefined>();

  protected readonly retrying = signal(false);
  protected readonly heading = computed(() =>
    this.connectivity.online() ? 'Servidor no disponible' : 'Sin conexión',
  );
  protected readonly explanation = computed(() =>
    this.connectivity.online()
      ? 'No se ha podido contactar con Finanzas. Inténtalo de nuevo en unos instantes.'
      : 'Finanzas necesita conexión para guardar y consultar datos. Conéctate y vuelve a intentarlo.',
  );

  protected async retry(): Promise<void> {
    if (this.retrying()) {
      return;
    }
    this.retrying.set(true);
    try {
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } finally {
      this.retrying.set(false);
    }
  }
}
