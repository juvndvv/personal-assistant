import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { AppUpdates } from './app-updates';
import { ConnectivityStatus } from './connectivity-status';
import { PwaStatusBanner, STATUS_BANNER_HEIGHT } from './pwa-status-banner';

async function setup(
  options: { online?: boolean; updateReady?: boolean; reloadRequired?: boolean } = {},
) {
  const online = signal(options.online ?? true);
  const updateReady = signal(options.updateReady ?? false);
  const reloadRequired = signal(options.reloadRequired ?? false);
  const appUpdates = {
    updateReady,
    reloadRequired,
    applyUpdate: vi.fn(),
    reload: vi.fn(),
    dismiss: vi.fn(),
  };
  const rendered = await render(PwaStatusBanner, {
    providers: [
      { provide: ConnectivityStatus, useValue: { online } },
      { provide: AppUpdates, useValue: appUpdates },
    ],
  });
  return { online, updateReady, appUpdates, rendered, user: userEvent.setup() };
}

describe('PwaStatusBanner', () => {
  it('renders nothing while online and up to date', async () => {
    await setup();

    expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Nueva versión disponible')).not.toBeInTheDocument();
  });

  it('announces when the device goes offline', async () => {
    const { online } = await setup();

    online.set(false);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sin conexión. Finanzas necesita conexión para guardar y consultar datos.',
    );
  });

  it('offers to update when a new version is available', async () => {
    const { appUpdates, user } = await setup({ updateReady: true });

    expect(screen.getByText('Nueva versión disponible')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));

    expect(appUpdates.applyUpdate).toHaveBeenCalledOnce();
  });

  it('lets the user postpone the update', async () => {
    const { appUpdates, user } = await setup({ updateReady: true });

    await user.click(screen.getByRole('button', { name: 'Más tarde' }));

    expect(appUpdates.dismiss).toHaveBeenCalledOnce();
  });

  it('forces a reload without a postpone option when the service worker is broken', async () => {
    const { appUpdates, user } = await setup({ updateReady: true, reloadRequired: true });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Hay que recargar la aplicación para seguir usándola',
    );
    expect(screen.queryByRole('button', { name: 'Más tarde' })).not.toBeInTheDocument();
    expect(screen.queryByText('Nueva versión disponible')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Recargar' }));

    expect(appUpdates.reload).toHaveBeenCalledOnce();
    expect(appUpdates.dismiss).not.toHaveBeenCalled();
  });

  it('clears the status bar area with the topmost notice', async () => {
    const { online } = await setup({ updateReady: true });
    const safeAreaPadding = 'pt-[calc(env(safe-area-inset-top)+0.5rem)]';

    expect(screen.getByTestId('update-banner')).toHaveClass(safeAreaPadding);

    online.set(false);

    expect(await screen.findByTestId('offline-banner')).toHaveClass(safeAreaPadding);
    expect(screen.getByTestId('update-banner')).not.toHaveClass(safeAreaPadding);
  });

  it('publishes its height so sticky bars can sit below it', async () => {
    const { rendered } = await setup({ online: false });
    const rootStyle = document.documentElement.style;

    expect(rootStyle.getPropertyValue(STATUS_BANNER_HEIGHT)).toMatch(/^\d+px$/);

    rendered.fixture.destroy();

    expect(rootStyle.getPropertyValue(STATUS_BANNER_HEIGHT)).toBe('');
  });
});
