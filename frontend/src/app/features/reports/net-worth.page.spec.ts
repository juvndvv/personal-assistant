import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import { of, throwError } from 'rxjs';
import { ReportsApi } from '../../core/api/reports.api';
import { formatCents } from '../../core/money/format-cents';
import { NetWorthPage } from './net-worth.page';
import { aNetWorth, aNetWorthAccount } from './testing/report-fixtures';

const plain = (text: string) => text.replace(/\s+/g, ' ');

async function setup(netWorth = () => of(aNetWorth())) {
  await render(NetWorthPage, {
    providers: [provideRouter([]), { provide: ReportsApi, useValue: { netWorth } }],
  });
}

describe('NetWorthPage', () => {
  it('shows the total with assets and debts', async () => {
    await setup();

    expect(await screen.findByTestId('net-worth-total')).toHaveTextContent(
      plain(formatCents(1834500)),
    );
    expect(
      screen.getByRole('heading', { name: 'Patrimonio neto a 13 de octubre de 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('net-worth-assets')).toHaveTextContent(plain(formatCents(1879730)));
    expect(screen.getByTestId('net-worth-liabilities')).toHaveTextContent(
      plain(formatCents(-45230)),
    );
  });

  it('labels liabilities as debts of any account type, not only cards', async () => {
    await setup(() =>
      of(
        aNetWorth({
          liabilities_cents: -15000,
          accounts: [
            aNetWorthAccount({
              id: 3,
              name: 'Cuenta corriente',
              type: 'checking',
              balance_cents: -15000,
            }),
          ],
        }),
      ),
    );

    const tile = await screen.findByTestId('net-worth-liabilities');
    expect(tile).toHaveTextContent('Deudas');
    expect(tile).not.toHaveTextContent('tarjetas');
    expect(tile).toHaveTextContent(plain(formatCents(-15000)));
  });

  it('lists every account with its last update and stale badge', async () => {
    await setup();

    const list = await screen.findByRole('list', { name: 'Saldo por cuenta' });
    const rows = within(list).getAllByTestId('net-worth-account');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Cuenta corriente · Actualizado el 12 oct 2026');
    expect(rows[0]).not.toHaveTextContent('Desactualizada');
    expect(rows[0]).toHaveAttribute('href', '/cuentas/3');
    expect(rows[1]).toHaveTextContent('Efectivo · Actualizado el 1 ago 2026');
    expect(rows[1]).toHaveTextContent('Desactualizada');
    expect(rows[2]).toHaveTextContent(plain(formatCents(-45230)));
    expect(rows[3]).toHaveTextContent('Sin movimientos');
    expect(screen.getByTestId('stale-warning')).toHaveTextContent(
      '2 cuentas llevan más de 30 días sin actualizarse: Hucha, Fondo.',
    );
  });

  it('does not flag archived accounts as stale', async () => {
    await setup(() =>
      of(
        aNetWorth({
          accounts: [
            aNetWorthAccount({
              id: 7,
              name: 'Hucha vieja',
              type: 'cash',
              archived: true,
              balance_cents: 3000,
              last_updated_on: '2026-05-01',
              stale: true,
            }),
          ],
        }),
      ),
    );

    const list = await screen.findByRole('list', { name: 'Saldo por cuenta' });
    const [row] = within(list).getAllByTestId('net-worth-account');
    expect(row).toHaveTextContent('Archivada');
    expect(row).not.toHaveTextContent('Desactualizada');
    expect(screen.queryByTestId('stale-warning')).not.toBeInTheDocument();
  });

  it('reports a failure', async () => {
    await setup(() => throwError(() => new Error('offline')));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el patrimonio.');
  });
});
