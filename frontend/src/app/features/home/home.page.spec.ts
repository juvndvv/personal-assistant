import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { Account } from '../../core/api/models';
import { TransactionsApi } from '../../core/api/transactions.api';
import { aPage } from '../transactions/testing/feed-fakes';
import { aTransaction, aTransferLeg } from '../transactions/testing/transaction-fixtures';
import { anAccount } from '../accounts/testing/account-fixtures';
import { HomePage } from './home.page';
import { AttachmentsApi } from '../../core/api/attachments.api';
import { DraftsApi } from '../../core/api/drafts.api';
import { quietAttachmentsApi, quietDraftsApi } from '../drafts/testing/draft-fixtures';

async function setup(accounts: Account[]) {
  const list = vi.fn(() => of(accounts));
  const transactions = {
    list: vi.fn(() => of(aPage([aTransaction({ description: 'Pan' }), aTransferLeg()]))),
  };
  const view = await render(HomePage, {
    providers: [
      { provide: DraftsApi, useValue: quietDraftsApi() },
      { provide: AttachmentsApi, useValue: quietAttachmentsApi() },
      provideRouter([]),
      { provide: AccountsApi, useValue: { list } },
      { provide: TransactionsApi, useValue: transactions },
    ],
  });
  const router = view.fixture.debugElement.injector.get(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { list, transactions, navigateByUrl, user: userEvent.setup() };
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

  it('lists active accounts and the last 10 movements', async () => {
    const { transactions } = await setup([
      anAccount({ id: 1, name: 'BBVA', balance_cents: 100000 }),
      anAccount({ id: 3, name: 'Vieja', archived_at: '2026-09-01T10:00:00+02:00' }),
    ]);

    const accounts = await screen.findByRole('list', { name: 'Cuentas' });
    expect(accounts).toHaveTextContent('BBVA');
    expect(accounts).not.toHaveTextContent('Vieja');
    expect(transactions.list).toHaveBeenCalledWith({ page: 1, per_page: 10 });
    expect(screen.getByText('Pan')).toBeInTheDocument();
    expect(screen.getByText('BBVA → Ahorro')).toBeInTheDocument();
  });
});
