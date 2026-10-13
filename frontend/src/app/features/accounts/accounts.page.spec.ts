import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { Account } from '../../core/api/models';
import { AccountsPage } from './accounts.page';
import { anAccount } from './testing/account-fixtures';

const active: Account[] = [
  anAccount({ id: 1, name: 'BBVA', type: 'checking', balance_cents: 234567 }),
  anAccount({ id: 2, name: 'Visa', type: 'credit_card', balance_cents: -4523 }),
  anAccount({
    id: 3,
    name: 'Cartera',
    type: 'cash',
    balance_cents: 2000,
    stale: true,
    last_updated_on: '2026-08-01',
  }),
];
const archived = anAccount({
  id: 4,
  name: 'Antigua',
  type: 'savings_investment',
  archived_at: '2026-09-01T10:00:00+02:00',
});

async function setup(accounts: Account[] = active) {
  const list = vi.fn((includeArchived: boolean) =>
    of(includeArchived ? [...accounts, archived] : accounts),
  );
  await render(AccountsPage, {
    providers: [provideRouter([]), { provide: AccountsApi, useValue: { list } }],
  });
  return { list, user: userEvent.setup() };
}

describe('AccountsPage', () => {
  it('groups accounts by type in a stable order', async () => {
    await setup();

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent?.trim())).toEqual([
      'Cuentas corrientes',
      'Efectivo',
      'Tarjetas de crédito',
    ]);
  });

  it('shows balances, negatives in red, last update and the stale badge', async () => {
    await setup();

    const visa = await screen.findByTestId('account-row-2');
    const balance = within(visa).getByText('-45,23 €');
    expect(balance).toHaveClass('text-destructive');

    const cash = screen.getByTestId('account-row-3');
    expect(within(cash).getByText('Desactualizada')).toBeInTheDocument();
    expect(within(cash).getByText('Actualizada el 1 ago 2026')).toBeInTheDocument();
    expect(within(screen.getByTestId('account-row-1')).getByText('2.345,67 €')).not.toHaveClass(
      'text-destructive',
    );
  });

  it('lists archived accounts only when asked', async () => {
    const { list, user } = await setup();
    expect(await screen.findByText('BBVA')).toBeInTheDocument();
    expect(screen.queryByText('Antigua')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /mostrar archivadas/i }));

    expect(list).toHaveBeenLastCalledWith(true);
    const row = await screen.findByTestId('account-row-4');
    expect(within(row).getByText('Archivada')).toBeInTheDocument();
  });

  it('invites to create the first account when there are none', async () => {
    await setup([]);

    expect(await screen.findByText('Aún no tienes cuentas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear mi primera cuenta' })).toBeInTheDocument();
  });
});
