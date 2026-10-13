import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { AuthStore } from '../../core/auth/auth.store';
import { LoginPage } from './login.page';

async function setup(returnUrl?: string) {
  const login = vi.fn();
  const view = await render(LoginPage, {
    providers: [provideRouter([]), { provide: AuthStore, useValue: { login } }],
    inputs: { returnUrl },
  });
  const router = view.fixture.debugElement.injector.get(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { login, navigateByUrl, user: userEvent.setup() };
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/correo electrónico/i), 'dani@example.com');
  await user.type(screen.getByLabelText(/contraseña/i, { selector: 'input' }), 'secret-password');
  await user.click(screen.getByRole('button', { name: /entrar/i }));
}

describe('LoginPage', () => {
  it('has "Recordarme" checked by default', async () => {
    await setup();
    expect(screen.getByRole('checkbox', { name: /recordarme/i })).toBeChecked();
  });

  it('logs in with remember on and goes home', async () => {
    const { login, navigateByUrl, user } = await setup();
    login.mockResolvedValue({ id: 1, name: 'Dani', email: 'dani@example.com' });

    await fillAndSubmit(user);

    expect(login).toHaveBeenCalledWith({
      email: 'dani@example.com',
      password: 'secret-password',
      remember: true,
    });
    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('sends remember=false when unchecked and honours a safe returnUrl', async () => {
    const { login, navigateByUrl, user } = await setup('/informes');
    login.mockResolvedValue({ id: 1, name: 'Dani', email: 'dani@example.com' });

    await user.click(screen.getByRole('checkbox', { name: /recordarme/i }));
    await fillAndSubmit(user);

    expect(login).toHaveBeenCalledWith(expect.objectContaining({ remember: false }));
    expect(navigateByUrl).toHaveBeenCalledWith('/informes');
  });

  it('ignores an external returnUrl', async () => {
    const { login, navigateByUrl, user } = await setup('//evil.example.com');
    login.mockResolvedValue({ id: 1, name: 'Dani', email: 'dani@example.com' });

    await fillAndSubmit(user);

    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('asks for both fields before calling the API', async () => {
    const { login, user } = await setup();

    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(login).not.toHaveBeenCalled();
    expect(screen.getByText('Introduce tu correo electrónico')).toBeInTheDocument();
    expect(screen.getByText('Introduce tu contraseña')).toBeInTheDocument();
  });

  it('shows the server message on 422', async () => {
    const { login, navigateByUrl, user } = await setup();
    login.mockRejectedValue(
      new HttpErrorResponse({
        status: 422,
        error: {
          message: 'Credenciales incorrectas',
          errors: { email: ['Credenciales incorrectas'] },
        },
      }),
    );

    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales incorrectas');
    expect(screen.getByLabelText(/correo electrónico/i)).toHaveAttribute('aria-invalid', 'true');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows a throttling message with the retry delay on 429', async () => {
    const { login, user } = await setup();
    login.mockRejectedValue(
      new HttpErrorResponse({
        status: 429,
        headers: new HttpHeaders({ 'Retry-After': '42' }),
        error: { message: 'Too Many Attempts.' },
      }),
    );

    await fillAndSubmit(user);

    expect(
      await screen.findByText('Demasiados intentos. Vuelve a intentarlo en 42 segundos.'),
    ).toBeInTheDocument();
  });

  it('shows a connection message on other failures', async () => {
    const { login, user } = await setup();
    login.mockRejectedValue(new HttpErrorResponse({ status: 0 }));

    await fillAndSubmit(user);

    expect(
      await screen.findByText('No se pudo conectar con el servidor. Inténtalo de nuevo.'),
    ).toBeInTheDocument();
  });
});
