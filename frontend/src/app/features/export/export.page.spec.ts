import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ExportPage } from './export.page';

describe('ExportPage', () => {
  it('downloads the full archive with or without receipts from a plain same-origin link', async () => {
    const user = userEvent.setup();
    await render(ExportPage, { providers: [provideRouter([])] });

    const archive = screen.getByRole('link', { name: 'Descargar exportación completa (ZIP)' });
    expect(archive).toHaveAttribute('href', '/api/v1/exports/full.zip');
    expect(archive).toHaveAttribute('download');

    await user.click(screen.getByRole('checkbox', { name: /incluir justificantes/i }));
    expect(archive).toHaveAttribute('href', '/api/v1/exports/full.zip?include_receipts=1');
  });

  it('downloads every movement as CSV with the chosen delimiter', async () => {
    const user = userEvent.setup();
    await render(ExportPage, { providers: [provideRouter([])] });

    const csv = screen.getByRole('link', { name: 'Descargar movimientos (CSV)' });
    expect(csv).toHaveAttribute('href', '/api/v1/exports/transactions.csv?delimiter=semicolon');

    await user.click(screen.getByRole('radio', { name: 'Coma' }));
    expect(csv).toHaveAttribute('href', '/api/v1/exports/transactions.csv?delimiter=comma');
  });

  it('keeps the delimiter labels short and explains which one suits Excel', async () => {
    await render(ExportPage, { providers: [provideRouter([])] });

    expect(screen.getByRole('radio', { name: 'Punto y coma' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('delimiter-hint')).toHaveTextContent('Excel');
  });
});
