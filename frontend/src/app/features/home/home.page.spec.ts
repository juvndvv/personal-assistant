import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { Account } from '../../core/api/models';
import { anAccount } from '../accounts/testing/account-fixtures';
import { HomePage } from './home.page';

async function setup(accounts: Account[]) {
  const list = vi.fn(() => of(accounts));
  const view = await render(HomePage, {
    providers: [provideRouter([]), { provide: AccountsApi, useValue: { list } }],
  });
  const router = view.fixture.debugElement.injector.get(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { list, navigateByUrl, user: userEvent.setup() };
}

describe('HomePage', () => {
  it('invites to create the first account when there are none', async () => {
    const { navigateByUrl, user } = await setup([]);

    await user.click(await screen.findByRole('button', { name: 'Crear mi primera cuenta' }));

    expect(navigateByUrl).toHaveBeenCalledWith('/cuentas/nueva');
  });

  it('shows the net worth including archived accounts', async () => {
    const { list } = await setup([
      anAccount({ id: 1, balance_cents: 100000 }),
      anAccount({ id: 2, balance_cents: -25000, type: 'credit_card' }),
      anAccount({ id: 3, balance_cents: 5000, archived_at: '2026-09-01T10:00:00+02:00' }),
    ]);

    expect(list).toHaveBeenCalledWith(true);
    expect(await screen.findByTestId('net-worth')).toHaveTextContent('800,00 €');
    expect(screen.getByRole('link', { name: 'Ver cuentas (2)' })).toBeInTheDocument();
  });
});
