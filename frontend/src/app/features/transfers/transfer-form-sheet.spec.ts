import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, Observable, of } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { CategoriesApi } from '../../core/api/categories.api';
import { Account, Transfer } from '../../core/api/models';
import { TransfersApi } from '../../core/api/transfers.api';
import { todayInMadrid } from '../../core/date/iso-date';
import { UiToast } from '../../shared/ui';
import { anAccount } from '../accounts/testing/account-fixtures';
import { TransferRequest } from '../transactions/movement-sheets';
import { aTransfer } from '../transactions/testing/transaction-fixtures';
import { TransferFormSheet } from './transfer-form-sheet';

const knownAccounts = (): Observable<Account[]> =>
  of([
    anAccount({ id: 3, name: 'BBVA' }),
    anAccount({ id: 9, name: 'Ahorro', type: 'savings_investment' }),
    anAccount({ id: 21, name: 'Visa', type: 'credit_card' }),
    anAccount({ id: 22, name: 'Amex', type: 'credit_card' }),
    anAccount({ id: 12, name: 'Vieja', archived_at: '2026-01-01T00:00:00+01:00' }),
  ]);

async function setup(
  request: TransferRequest,
  existing: Transfer = aTransfer({ note: 'Hucha' }),
  listAccounts: () => Observable<Account[]> = knownAccounts,
) {
  const api = {
    get: vi.fn(() => of(existing)),
    create: vi.fn(() => of(aTransfer())),
    update: vi.fn(() => of(aTransfer())),
    delete: vi.fn(() => of(undefined)),
    restore: vi.fn(),
  };
  const view = await render(TransferFormSheet, {
    providers: [
      { provide: TransfersApi, useValue: api },
      {
        provide: AccountsApi,
        useValue: { list: listAccounts },
      },
      { provide: CategoriesApi, useValue: { list: () => of([]) } },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    ],
    inputs: { request },
  });
  const closed = vi.fn();
  view.fixture.componentInstance.closed.subscribe(closed);
  return { api, closed, user: userEvent.setup() };
}

describe('TransferFormSheet', () => {
  it('creates a transfer between two distinct writable accounts', async () => {
    const { api, closed, user } = await setup({ transferId: null, fromAccountId: 3 });
    await screen.findByRole('dialog', { name: 'Nueva transferencia' });
    const from = screen.getByRole('combobox', { name: /desde/i });
    expect(from).toHaveValue('3');
    const to = screen.getByRole('combobox', { name: /hacia/i });
    expect(
      Array.from((to as HTMLSelectElement).options).map((option) => option.textContent?.trim()),
    ).toEqual(['Cuenta de destino', 'Ahorro', 'Visa', 'Amex']);

    await user.selectOptions(to, '9');
    await user.type(screen.getByRole('textbox', { name: /importe/i }), '100');
    await user.click(screen.getByRole('button', { name: 'Guardar transferencia' }));

    expect(api.create).toHaveBeenCalledWith({
      from_account_id: 3,
      to_account_id: 9,
      amount_cents: 10000,
      date: todayInMadrid(),
      note: null,
    });
    expect(closed).toHaveBeenCalled();
  });

  it('records paying a card from a non-card account as a card settlement', async () => {
    const { api, user } = await setup({ transferId: null, fromAccountId: 3 });
    await screen.findByRole('dialog', { name: 'Nueva transferencia' });

    await user.selectOptions(screen.getByRole('combobox', { name: /hacia/i }), '21');
    await user.type(screen.getByRole('textbox', { name: /importe/i }), '300');
    await user.click(screen.getByRole('button', { name: 'Guardar transferencia' }));

    expect(api.create).toHaveBeenCalledWith({
      kind: 'card_settlement',
      from_account_id: 3,
      to_account_id: 21,
      amount_cents: 30000,
      date: todayInMadrid(),
      note: null,
    });
  });

  it('keeps a card-to-card movement as a plain transfer', async () => {
    const { api, user } = await setup({ transferId: null, fromAccountId: 21 });
    await screen.findByRole('dialog', { name: 'Nueva transferencia' });

    await user.selectOptions(screen.getByRole('combobox', { name: /hacia/i }), '22');
    await user.type(screen.getByRole('textbox', { name: /importe/i }), '50');
    await user.click(screen.getByRole('button', { name: 'Guardar transferencia' }));

    expect(api.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ kind: expect.anything() }),
    );
  });

  it('loads and rewrites an existing transfer', async () => {
    const { api, user } = await setup({ transferId: 44, fromAccountId: null });
    await screen.findByRole('dialog', { name: 'Editar transferencia' });
    const amount = await screen.findByRole('textbox', { name: /importe/i });
    await vi.waitFor(() => expect(amount).toHaveValue('100,00'));

    await user.clear(amount);
    await user.type(amount, '80');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(api.get).toHaveBeenCalledWith(44);
    expect(api.update).toHaveBeenCalledWith(44, {
      kind: 'transfer',
      from_account_id: 3,
      to_account_id: 9,
      amount_cents: 8000,
      date: '2026-10-01',
      note: 'Hucha',
    });
  });

  it('reclassifies an edited transfer that now pays off a card as a card settlement', async () => {
    const { api, user } = await setup({ transferId: 44, fromAccountId: null });
    await screen.findByRole('dialog', { name: 'Editar transferencia' });
    const to = screen.getByRole('combobox', { name: /hacia/i });
    await vi.waitFor(() => expect(to).toHaveValue('9'));

    await user.selectOptions(to, '21');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(api.update).toHaveBeenCalledWith(
      44,
      expect.objectContaining({ kind: 'card_settlement', from_account_id: 3, to_account_id: 21 }),
    );
  });

  it('reclassifies an edited card settlement that no longer targets a card as a transfer', async () => {
    const { api, user } = await setup(
      { transferId: 44, fromAccountId: null },
      aTransfer({
        kind: 'card_settlement',
        to_account: { id: 21, name: 'Visa', type: 'credit_card', archived: false },
      }),
    );
    await screen.findByRole('dialog', { name: 'Editar transferencia' });
    const to = screen.getByRole('combobox', { name: /hacia/i });
    await vi.waitFor(() => expect(to).toHaveValue('21'));

    await user.selectOptions(to, '9');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(api.update).toHaveBeenCalledWith(
      44,
      expect.objectContaining({ kind: 'transfer', from_account_id: 3, to_account_id: 9 }),
    );
  });

  it('keeps an edited card settlement as a settlement while accounts are still loading', async () => {
    const { api, user } = await setup(
      { transferId: 44, fromAccountId: null },
      aTransfer({
        kind: 'card_settlement',
        note: 'Visa octubre',
        to_account: { id: 21, name: 'Visa', type: 'credit_card', archived: false },
      }),
      () => NEVER,
    );
    await screen.findByRole('dialog', { name: 'Editar liquidación de tarjeta' });
    const note = await screen.findByRole('textbox', { name: /nota/i });
    await vi.waitFor(() => expect(note).toHaveValue('Visa octubre'));

    await user.clear(note);
    await user.type(note, 'Visa septiembre');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(api.update).toHaveBeenCalledWith(
      44,
      expect.objectContaining({ kind: 'card_settlement', note: 'Visa septiembre' }),
    );
  });

  it('validates the destination before calling the API', async () => {
    const { api, user } = await setup({ transferId: null, fromAccountId: null });
    await screen.findByRole('dialog', { name: 'Nueva transferencia' });

    await user.click(screen.getByRole('button', { name: 'Guardar transferencia' }));

    expect(api.create).not.toHaveBeenCalled();
    expect(screen.getByText('Elige la cuenta de destino.')).toBeInTheDocument();
  });

  it('deletes an existing transfer with both legs', async () => {
    const { api, closed, user } = await setup({ transferId: 44, fromAccountId: null });
    await screen.findByRole('dialog', { name: 'Editar transferencia' });

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(api.delete).toHaveBeenCalledWith(44);
    expect(closed).toHaveBeenCalled();
  });
});
