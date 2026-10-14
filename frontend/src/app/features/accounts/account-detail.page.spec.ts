import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { CategoriesApi } from '../../core/api/categories.api';
import { TransactionsApi } from '../../core/api/transactions.api';
import { aPage } from '../transactions/testing/feed-fakes';
import { aTransaction } from '../transactions/testing/transaction-fixtures';
import { Account, Transaction } from '../../core/api/models';
import { todayInMadrid } from '../../core/date/iso-date';
import { UiToast } from '../../shared/ui';
import { AccountDetailPage } from './account-detail.page';
import { anAccount } from './testing/account-fixtures';
import { AttachmentsApi } from '../../core/api/attachments.api';
import { DraftsApi } from '../../core/api/drafts.api';
import { quietAttachmentsApi, quietDraftsApi } from '../drafts/testing/draft-fixtures';

function anAdjustment(signed: number, target: number): Transaction {
  return {
    id: 99,
    type: 'adjustment',
    account: { id: 1, name: 'BBVA', type: 'checking', archived: false },
    amount_cents: Math.abs(signed),
    signed_amount_cents: signed,
    date: todayInMadrid(),
    category: null,
    description: null,
    merchant: null,
    note: null,
    origin: 'manual',
    tags: [],
    transfer: null,
    adjustment_target_cents: target,
    recurring_template_id: null,
    attachments_count: 0,
    created_at: '2026-10-13T10:00:00+02:00',
    updated_at: '2026-10-13T10:00:00+02:00',
  };
}

async function setup(account: Account = anAccount({ id: 1, balance_cents: 100000 })) {
  const api = {
    get: vi.fn(() => of(account)),
    list: vi.fn(() => of([account])),
    settlementSuggestion: vi.fn(),
    archive: vi.fn(() => of({ ...account, archived_at: '2026-10-13T10:00:00+02:00' })),
    unarchive: vi.fn(() => of({ ...account, archived_at: null })),
    delete: vi.fn(),
    adjust: vi.fn(),
  };
  const transactionsApi = {
    list: vi.fn(() => of(aPage([aTransaction({ description: 'Pan del día' })]))),
  };
  const view = await render(AccountDetailPage, {
    providers: [
      { provide: DraftsApi, useValue: quietDraftsApi() },
      { provide: AttachmentsApi, useValue: quietAttachmentsApi() },
      provideRouter([]),
      { provide: AccountsApi, useValue: api },
      { provide: CategoriesApi, useValue: { list: () => of([]) } },
      { provide: TransactionsApi, useValue: transactionsApi },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
    inputs: { id: String(account.id) },
  });
  const router = view.fixture.debugElement.injector.get(Router);
  vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { api, transactionsApi, user: userEvent.setup() };
}

describe('AccountDetailPage', () => {
  it('shows the balance and the last update', async () => {
    await setup(anAccount({ id: 1, balance_cents: -5000, last_updated_on: '2026-10-12' }));

    expect(await screen.findByTestId('account-balance')).toHaveTextContent('-50,00 €');
    expect(screen.getByTestId('account-balance')).toHaveClass('text-danger-text');
    expect(screen.getByText('La cuenta está en descubierto.')).toBeInTheDocument();
    expect(screen.getByText('Actualizada el 12 oct 2026')).toBeInTheDocument();
  });

  it('presents a negative card balance as debt without alarm colours', async () => {
    await setup(anAccount({ id: 1, type: 'credit_card', balance_cents: -12000 }));

    expect(await screen.findByTestId('account-balance')).toHaveClass('text-foreground');
    expect(screen.getByText('Deuda de la tarjeta')).toBeInTheDocument();
    expect(screen.queryByText('La cuenta está en descubierto.')).not.toBeInTheDocument();
  });

  it('links back to the accounts list from the page header', async () => {
    await setup();

    expect(await screen.findByRole('link', { name: 'Cuentas' })).toHaveAttribute(
      'href',
      '/cuentas',
    );
  });

  it('suggests archiving when the account has movements', async () => {
    const { api, user } = await setup();
    api.delete.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: 'Has movements', code: 'account_has_movements' },
          }),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar cuenta' });
    await user.click(
      Array.from(dialog.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Eliminar'),
      ) as HTMLButtonElement,
    );

    expect(await screen.findByText(/archívala para ocultarla/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Archivar', hidden: false }));
    expect(api.archive).toHaveBeenCalledWith(1);
  });

  it('records an adjustment and shows the computed delta', async () => {
    const { api, user } = await setup();
    api.adjust.mockReturnValue(of(anAdjustment(25050, 125050)));

    await user.click(await screen.findByRole('button', { name: 'Ajustar saldo' }));
    await user.type(await screen.findByLabelText(/saldo real/i), '1250,50');
    await user.click(screen.getByRole('button', { name: 'Guardar ajuste' }));

    expect(api.adjust).toHaveBeenCalledWith(1, {
      date: todayInMadrid(),
      target_balance_cents: 125050,
      note: null,
    });
    expect(await screen.findByTestId('adjustment-delta')).toHaveTextContent('+250,50 €');
  });

  it('refuses a target equal to today’s balance without calling the API', async () => {
    const { api, user } = await setup();

    await user.click(await screen.findByRole('button', { name: 'Ajustar saldo' }));
    await user.type(await screen.findByLabelText(/saldo real/i), '1000');
    await user.click(screen.getByRole('button', { name: 'Guardar ajuste' }));

    expect(api.adjust).not.toHaveBeenCalled();
    expect(screen.getByText(/no hay nada que ajustar/i)).toBeInTheDocument();
  });

  it('shows the server message on a 422 zero delta', async () => {
    const { api, user } = await setup();
    api.adjust.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: {
              message: 'El saldo no cambia.',
              errors: { target_balance_cents: ['El saldo objetivo coincide con el saldo actual.'] },
            },
          }),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Ajustar saldo' }));
    await user.type(await screen.findByLabelText(/saldo real/i), '-20');
    await user.click(screen.getByRole('button', { name: 'Guardar ajuste' }));

    expect(
      await screen.findByText('El saldo objetivo coincide con el saldo actual.'),
    ).toBeInTheDocument();
  });

  it('unarchives an archived account and disables adjustments', async () => {
    const { api, user } = await setup(
      anAccount({ id: 1, archived_at: '2026-09-01T10:00:00+02:00' }),
    );

    expect(await screen.findByRole('button', { name: 'Ajustar saldo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Desarchivar' }));

    expect(api.unarchive).toHaveBeenCalledWith(1);
    expect(await screen.findByRole('button', { name: 'Archivar' })).toBeInTheDocument();
  });

  it('lists the account movements with signed amounts', async () => {
    const { transactionsApi } = await setup(anAccount({ id: 4 }));

    expect(await screen.findByText('Pan del día')).toBeInTheDocument();
    expect(transactionsApi.list).toHaveBeenCalledWith({ account_id: [4], page: 1, per_page: 50 });
    expect(screen.getByTestId('transaction-amount')).toHaveTextContent('-23,50 €');
  });

  it('offers card settlement only for credit cards', async () => {
    await setup(anAccount({ id: 1, type: 'checking' }));
    await screen.findByRole('button', { name: 'Ajustar saldo' });
    expect(screen.queryByRole('button', { name: 'Liquidar tarjeta' })).not.toBeInTheDocument();
  });
});
