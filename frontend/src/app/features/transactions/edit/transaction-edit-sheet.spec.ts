import { HttpErrorResponse } from '@angular/common/http';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { AccountsApi } from '../../../core/api/accounts.api';
import { CategoriesApi } from '../../../core/api/categories.api';
import { Category, Transaction } from '../../../core/api/models';
import { TagsApi } from '../../../core/api/tags.api';
import { TransactionsApi } from '../../../core/api/transactions.api';
import { UiToast } from '../../../shared/ui';
import { anAccount } from '../../accounts/testing/account-fixtures';
import { aTransaction } from '../testing/transaction-fixtures';
import { TransactionEditSheet } from './transaction-edit-sheet';

const TREE: Category[] = [
  {
    id: 10,
    kind: 'expense',
    name: 'Alimentación',
    parent_id: null,
    icon: null,
    color: null,
    sort_order: 0,
    archived_at: null,
    children: [
      {
        id: 11,
        kind: 'expense',
        name: 'Supermercado',
        parent_id: 10,
        icon: null,
        color: null,
        sort_order: 0,
        archived_at: null,
        children: [],
      },
    ],
  },
  {
    id: 50,
    kind: 'income',
    name: 'Reembolsos',
    parent_id: null,
    icon: null,
    color: null,
    sort_order: 0,
    archived_at: null,
    children: [],
  },
];

async function setup(transaction: Transaction) {
  const api = {
    update: vi.fn(() => of(transaction)),
    delete: vi.fn(() => of(undefined)),
    restore: vi.fn(),
  };
  const view = await render(TransactionEditSheet, {
    providers: [
      { provide: TransactionsApi, useValue: api },
      { provide: AccountsApi, useValue: { list: () => of([anAccount({ id: 3, name: 'BBVA' })]) } },
      { provide: CategoriesApi, useValue: { list: () => of(TREE) } },
      { provide: TagsApi, useValue: { list: () => of([]) } },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    ],
    inputs: { transaction },
  });
  const closed = vi.fn();
  view.fixture.componentInstance.closed.subscribe(closed);
  return { api, closed, user: userEvent.setup() };
}

describe('TransactionEditSheet', () => {
  it('edits an expense, switching it to income with tags', async () => {
    const { api, closed, user } = await setup(aTransaction({ tags: [{ id: 1, name: 'casa' }] }));
    await screen.findByRole('dialog', { name: 'Editar movimiento' });
    expect(screen.getByRole('textbox', { name: /importe/i })).toHaveValue('23,50');
    expect(screen.getByRole('button', { name: 'Quitar etiqueta casa' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Ingreso' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: /categoría/i }), '50');
    await user.type(screen.getByRole('combobox', { name: 'Etiquetas' }), 'devolución{Enter}');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(api.update).toHaveBeenCalledWith(120, {
      type: 'income',
      amount_cents: 2350,
      date: '2026-10-12',
      account_id: 3,
      category_id: 50,
      description: 'Compra semanal',
      merchant: 'Mercadona',
      note: null,
      tags: ['casa', 'devolución'],
    });
    expect(closed).toHaveBeenCalled();
  });

  it('edits the target balance and date of an adjustment', async () => {
    const { api, user } = await setup(
      aTransaction({
        id: 77,
        type: 'adjustment',
        category: null,
        description: null,
        merchant: null,
        signed_amount_cents: 5000,
        amount_cents: 5000,
        adjustment_target_cents: 125000,
      }),
    );
    await screen.findByRole('dialog', { name: 'Editar ajuste de saldo' });
    const target = screen.getByRole('textbox', { name: /saldo real/i });
    expect(target).toHaveValue('1250,00');
    expect(screen.queryByRole('textbox', { name: 'Descripción' })).not.toBeInTheDocument();

    await user.clear(target);
    await user.type(target, '-10');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(api.update).toHaveBeenCalledWith(77, {
      date: '2026-10-12',
      target_balance_cents: -1000,
      note: null,
    });
  });

  it('shows a 409 transfer leg conflict message', async () => {
    const { api, user } = await setup(aTransaction());
    api.update.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: 'Edita la transferencia.', code: 'transfer_leg_immutable' },
          }),
      ),
    );
    await screen.findByRole('dialog', { name: 'Editar movimiento' });

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Edita la transferencia.')).toBeInTheDocument();
  });

  it('deletes the movement', async () => {
    const { api, closed, user } = await setup(aTransaction());
    await screen.findByRole('dialog', { name: 'Editar movimiento' });

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(api.delete).toHaveBeenCalledWith(120);
    expect(closed).toHaveBeenCalled();
  });
});
