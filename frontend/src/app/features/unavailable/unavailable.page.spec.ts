import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ConnectivityStatus } from '../../core/pwa/connectivity-status';
import { UnavailablePage } from './unavailable.page';

async function setup(options: { online: boolean; returnUrl?: string }) {
  const view = await render(UnavailablePage, {
    providers: [
      provideRouter([]),
      { provide: ConnectivityStatus, useValue: { online: signal(options.online).asReadonly() } },
    ],
    inputs: { returnUrl: options.returnUrl },
  });
  const router = view.fixture.debugElement.injector.get(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { navigateByUrl, user: userEvent.setup() };
}

describe('UnavailablePage', () => {
  it('explains that the app needs a connection when offline', async () => {
    await setup({ online: false });

    expect(screen.getByRole('heading', { name: 'Sin conexión' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Finanzas necesita conexión');
  });

  it('explains that the server is unreachable when online', async () => {
    await setup({ online: true });

    expect(screen.getByRole('heading', { name: 'Servidor no disponible' })).toBeInTheDocument();
  });

  it('retries the original destination', async () => {
    const { navigateByUrl, user } = await setup({
      online: true,
      returnUrl: '/informes?period=2026-10',
    });

    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(navigateByUrl).toHaveBeenCalledWith('/informes?period=2026-10');
  });

  it('retries home when the destination is not a safe local url', async () => {
    const { navigateByUrl, user } = await setup({ online: true, returnUrl: '//evil.example.com' });

    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });
});
