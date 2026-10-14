import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { UiAlert } from './ui-alert';

describe('UiAlert', () => {
  it('announces errors as alerts', async () => {
    await render(`<ui-alert title="Sin conexión">No se pudieron cargar los datos.</ui-alert>`, {
      imports: [UiAlert],
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Sin conexión');
    expect(alert).toHaveTextContent('No se pudieron cargar los datos.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('uses a polite status for informative tones', async () => {
    await render(`<ui-alert tone="info">Hay 2 borradores.</ui-alert>`, { imports: [UiAlert] });

    expect(screen.getByRole('status')).toHaveTextContent('Hay 2 borradores.');
  });

  it('emits retry from the retry action', async () => {
    const retry = vi.fn();
    await render(`<ui-alert retryable (retry)="retry()">Error al cargar.</ui-alert>`, {
      imports: [UiAlert],
      componentProperties: { retry },
    });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('disables the retry action while retrying', async () => {
    await render(`<ui-alert retryable retrying retryLabel="Volver a intentar">Error.</ui-alert>`, {
      imports: [UiAlert],
    });

    expect(screen.getByRole('button', { name: /volver a intentar/i })).toBeDisabled();
  });
});
