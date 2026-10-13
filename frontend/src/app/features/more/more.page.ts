import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { PageHeader } from '../../shared/layout/page-header';
import { UiButton } from '../../shared/ui';

@Component({
  selector: 'app-more-page',
  imports: [PageHeader, UiButton],
  template: `
    <app-page-header title="Más" subtitle="Cuentas, categorías, ajustes y sesión." />
    <section class="rounded-2xl border border-border bg-background p-4">
      <p class="text-sm text-muted-foreground">Sesión iniciada como</p>
      <p class="font-medium text-foreground">{{ authStore.user()?.email }}</p>
      <div class="mt-4">
        <ui-button variant="outline" (clicked)="logout()">Cerrar sesión</ui-button>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MorePage {
  protected readonly authStore = inject(AuthStore);

  protected logout(): void {
    void this.authStore.logout();
  }
}
