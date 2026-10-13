import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { safeReturnUrl } from '../../core/auth/login-url';
import { UiButton, UiCheckbox, UiInput } from '../../shared/ui';
import { describeLoginFailure } from './login-error';

@Component({
  selector: 'app-login-page',
  imports: [UiButton, UiCheckbox, UiInput],
  host: { class: 'block min-h-dvh bg-muted/40' },
  template: `
    <main class="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <header class="mb-8 text-center">
        <p class="text-sm font-semibold tracking-wide text-primary">Finanzas</p>
        <h1 class="mt-2 text-2xl font-semibold text-foreground">Inicia sesión</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Accede para registrar y revisar tus movimientos.
        </p>
      </header>

      <form
        class="flex flex-col gap-5 rounded-2xl border border-border bg-background p-6 shadow-xs"
        novalidate
        (submit)="submit($event)"
      >
        @if (failure(); as message) {
          <p
            role="alert"
            class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {{ message }}
          </p>
        }

        <ui-input
          label="Correo electrónico"
          type="email"
          name="email"
          autocomplete="username"
          inputmode="email"
          [required]="true"
          [(value)]="email"
          [state]="emailError() ? 'error' : 'default'"
          [hint]="emailError() ?? undefined"
        />

        <ui-input
          label="Contraseña"
          type="password"
          name="password"
          autocomplete="current-password"
          [required]="true"
          [(value)]="password"
          [state]="passwordError() ? 'error' : 'default'"
          [hint]="passwordError() ?? undefined"
        />

        <ui-checkbox name="remember" [(checked)]="remember">Recordarme</ui-checkbox>

        <ui-button type="submit" size="lg" [fullWidth]="true" [loading]="submitting()">
          Entrar
        </ui-button>
      </form>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  readonly returnUrl = input<string | undefined>();

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly remember = signal(true);
  protected readonly submitting = signal(false);
  protected readonly failure = signal<string | null>(null);
  private readonly serverEmailError = signal<string | null>(null);
  private readonly attempted = signal(false);

  protected readonly emailError = computed(() => {
    if (this.attempted() && this.email().trim() === '') {
      return 'Introduce tu correo electrónico';
    }
    return this.serverEmailError();
  });
  protected readonly passwordError = computed(() =>
    this.attempted() && this.password() === '' ? 'Introduce tu contraseña' : null,
  );

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.submitting()) {
      return;
    }
    this.attempted.set(true);
    this.failure.set(null);
    this.serverEmailError.set(null);
    if (this.emailError() !== null || this.passwordError() !== null) {
      return;
    }

    this.submitting.set(true);
    try {
      await this.authStore.login({
        email: this.email().trim(),
        password: this.password(),
        remember: this.remember(),
      });
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (error: unknown) {
      const failure = describeLoginFailure(error);
      this.failure.set(failure.message);
      this.serverEmailError.set(failure.emailError);
    } finally {
      this.submitting.set(false);
    }
  }
}
