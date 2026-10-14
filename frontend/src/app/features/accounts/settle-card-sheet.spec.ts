import { HttpErrorResponse } from '@angular/common/http';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { CategoriesApi } from '../../core/api/categories.api';
import { SettlementSuggestion } from '../../core/api/models';
import { TransfersApi } from '../../core/api/transfers.api';
import { todayInMadrid } from '../../core/date/iso-date';
import { UiToast } from '../../shared/ui';
import { MovementSheets } from '../transactions/movement-sheets';
import { aTransfer } from '../transactions/testing/transaction-fixtures';
import { SettleCardSheet } from './settle-card-sheet';
import { anAccount } from './testing/account-fixtures';

const CARD = anAccount({
  id: 7,
  name: 'Visa',
  type: 'credit_card',
  balance_cents: -45230,
  statement_day: 5,
  settlement_account_id: 3,
});

const SUGGESTION: SettlementSuggestion = {
  card_account_id: 7,
  statement_start: '2026-09-06',
  statement_end: '2026-10-05',
  statement_balance_cents: -45230,
  settled_since_cents: 5230,
  suggested_cents: 40000,
  from_account_id: 9,
};

async function setup(
  suggestion: SettlementSuggestion = SUGGESTION,
  configure: (api: { settlementSuggestion: ReturnType<typeof vi.fn> }) => void = () => undefined,
) {
  const accountsApi = {
    settlementSuggestion: vi.fn(() => of(suggestion)),
    list: vi.fn(() =>
      of([
        anAccount({ id: 3, name: 'BBVA' }),
        anAccount({ id: 9, name: 'Nómina', type: 'checking' }),
        CARD,
      ]),
    ),
  };
  configure(accountsApi);
  const transfersApi = { create: vi.fn(() => of(aTransfer({ kind: 'card_settlement' }))) };
  const toast = { success: vi.fn(), error: vi.fn() };
  const view = await render(SettleCardSheet, {
    providers: [
      { provide: AccountsApi, useValue: accountsApi },
      { provide: CategoriesApi, useValue: { list: () => of([]) } },
      { provide: TransfersApi, useValue: transfersApi },
      { provide: UiToast, useValue: toast },
    ],
    inputs: { card: CARD, open: true },
  });
  const sheets = view.fixture.debugElement.injector.get(MovementSheets);
  return { accountsApi, transfersApi, toast, sheets, user: userEvent.setup() };
}

describe('SettleCardSheet', () => {
  it('prefills the suggestion, the source account and shows the statement window', async () => {
    const { accountsApi } = await setup();

    expect(await screen.findByTestId('suggested-amount')).toHaveTextContent('400,00 €');
    expect(accountsApi.settlementSuggestion).toHaveBeenCalledWith(7, todayInMadrid());
    expect(screen.getByTestId('statement-window')).toHaveTextContent(
      'Extracto del 6 sept 2026 al 5 oct 2026',
    );
    expect(screen.getByTestId('statement-window')).toHaveTextContent('452,30 €');
    expect(screen.getByTestId('statement-window')).toHaveTextContent('52,30 €');
    expect(screen.getByRole('textbox', { name: /importe/i })).toHaveValue('400,00');
    expect(screen.getByRole('combobox', { name: /cuenta de pago/i })).toHaveValue('9');
    expect(screen.queryByRole('option', { name: 'Visa' })).not.toBeInTheDocument();
  });

  it('settles with an edited amount and source as a card_settlement transfer', async () => {
    const { transfersApi, sheets, user } = await setup();
    const amount = await screen.findByRole('textbox', { name: /importe/i });
    await screen.findByTestId('suggested-amount');

    await user.clear(amount);
    await user.type(amount, '150');
    await user.selectOptions(screen.getByRole('combobox', { name: /cuenta de pago/i }), '3');
    await user.click(screen.getByRole('button', { name: 'Liquidar' }));

    expect(transfersApi.create).toHaveBeenCalledWith({
      kind: 'card_settlement',
      from_account_id: 3,
      to_account_id: 7,
      amount_cents: 15000,
      date: todayInMadrid(),
    });
    expect(sheets.changes()).toBe(1);
  });

  it('leaves the amount empty when nothing is owed and explains cards without statement day', async () => {
    await setup({
      ...SUGGESTION,
      statement_start: null,
      statement_end: null,
      suggested_cents: 0,
      from_account_id: null,
    });

    expect(await screen.findByText(/sin día de corte/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /importe/i })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: /cuenta de pago/i })).toHaveValue('3');
  });

  it('shows server validation errors', async () => {
    const { transfersApi, user } = await setup();
    transfersApi.create.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { message: 'x', errors: { date: ['La fecha es anterior a la apertura.'] } },
          }),
      ),
    );
    await screen.findByTestId('suggested-amount');

    await user.click(screen.getByRole('button', { name: 'Liquidar' }));

    expect(await screen.findByText('La fecha es anterior a la apertura.')).toBeInTheDocument();
  });

  it('offers a retry when the suggested amount cannot be loaded', async () => {
    const { accountsApi, user } = await setup(SUGGESTION, (api) =>
      api.settlementSuggestion.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      ),
    );

    expect(await screen.findByText('No se pudo calcular el importe sugerido.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByTestId('suggested-amount')).toHaveTextContent('400,00 €');
    expect(accountsApi.settlementSuggestion).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('No se pudo calcular el importe sugerido.')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /importe/i })).toHaveValue('400,00');
  });
});
