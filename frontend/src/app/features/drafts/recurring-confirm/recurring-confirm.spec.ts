import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Observable, of, throwError } from 'rxjs';
import { DraftsApi } from '../../../core/api/drafts.api';
import { Draft, Transaction } from '../../../core/api/models';
import { formatCents } from '../../../core/money/format-cents';
import { TransactionsApi } from '../../../core/api/transactions.api';
import { UiToast } from '../../../shared/ui';
import { aRecurringDraft } from '../../recurring/testing/recurring-fixtures';
import { aTransaction } from '../../transactions/testing/transaction-fixtures';
import { MovementSheets } from '../../transactions/movement-sheets';
import { DraftInboxPage } from '../inbox/draft-inbox.page';
import { aDraft, aDraftPage } from '../testing/draft-fixtures';

async function setup(
  drafts: Draft[],
  create: () => Observable<Transaction> = () => of(aTransaction({ origin: 'recurring' })),
  discard: () => Observable<Draft> = () => of(aRecurringDraft({ status: 'discarded' })),
) {
  let pending = drafts;
  const draftsApi = {
    list: vi.fn(() => of(aDraftPage(pending))),
    get: vi.fn(),
    discard: vi.fn(() => {
      pending = [];
      return discard();
    }),
  };
  const transactionsApi = {
    create: vi.fn(() => {
      pending = [];
      return create();
    }),
  };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  await render(DraftInboxPage, {
    providers: [
      provideRouter([]),
      { provide: DraftsApi, useValue: draftsApi },
      { provide: TransactionsApi, useValue: transactionsApi },
      { provide: UiToast, useValue: toast },
    ],
  });
  const sheets = TestBed.inject(MovementSheets);
  return { draftsApi, transactionsApi, toast, sheets, user: userEvent.setup() };
}

async function openRecurringSheet(user: ReturnType<typeof userEvent.setup>) {
  const row = await screen.findByRole('button', { name: /Luz/ });
  await user.click(row);
  return screen.findByRole('dialog', { name: 'Luz' });
}

describe('Variable recurring drafts', () => {
  it('ask for the real amount in the inbox instead of opening the full review', async () => {
    await setup([aRecurringDraft(), aDraft()]);

    const rows = await screen.findAllByTestId('draft-row');
    expect(rows[0]).toHaveTextContent('Introduce el importe real');
    expect(rows[0]).toHaveTextContent('Estimado 60,00 €');
    expect(rows[0]?.tagName).toBe('BUTTON');
    expect(rows[1]).toHaveAttribute('href', '/pendientes/88');
    expect(within(rows[0] as HTMLElement).getByLabelText('Fijo')).toBeInTheDocument();
  });

  it('confirm with the real amount from a sheet focused on the amount', async () => {
    const { transactionsApi, toast, user } = await setup([aRecurringDraft()]);

    const sheet = await openRecurringSheet(user);
    const amount = within(sheet).getByRole('textbox', { name: /importe real/i });
    await vi.waitFor(() => expect(amount).toHaveFocus());
    expect(sheet).toHaveTextContent('Estimado: 60,00 €');
    expect(within(sheet).getAllByRole('textbox')).toHaveLength(1);

    await user.keyboard('64,37');
    await user.click(within(sheet).getByRole('button', { name: 'Confirmar' }));

    expect(transactionsApi.create).toHaveBeenCalledWith({
      type: 'expense',
      amount_cents: 6437,
      date: '2026-10-05',
      account_id: 3,
      category_id: 21,
      description: 'Iberdrola',
      merchant: 'Iberdrola',
      draft_id: 91,
    });
    expect(toast.success).toHaveBeenCalledWith('Movimiento guardado', {
      description: `Luz · ${formatCents(6437)}`,
    });
    await vi.waitFor(() => expect(screen.queryAllByTestId('draft-row')).toHaveLength(0));
  });

  it('requires an amount before confirming', async () => {
    const { transactionsApi, user } = await setup([aRecurringDraft()]);
    const sheet = await openRecurringSheet(user);

    await user.click(within(sheet).getByRole('button', { name: 'Confirmar' }));

    expect(transactionsApi.create).not.toHaveBeenCalled();
    expect(within(sheet).getByText('Introduce el importe real.')).toBeInTheDocument();
  });

  it('explains when the draft was already resolved elsewhere', async () => {
    const { user } = await setup([aRecurringDraft()], () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: 'Conflict', code: 'draft_not_pending' },
          }),
      ),
    );
    const sheet = await openRecurringSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: /importe real/i }), '64');

    await user.click(within(sheet).getByRole('button', { name: 'Confirmar' }));

    expect(
      await within(sheet).findByText('Este borrador ya se confirmó o se descartó.'),
    ).toBeInTheDocument();
  });

  it('points to the full review when another field is rejected', async () => {
    const { user } = await setup([aRecurringDraft()], () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: {
              message: 'Invalid',
              errors: { category_id: ['La categoría está archivada.'] },
            },
          }),
      ),
    );
    const sheet = await openRecurringSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: /importe real/i }), '64');

    await user.click(within(sheet).getByRole('button', { name: 'Confirmar' }));

    expect(await within(sheet).findByText(/La categoría está archivada/)).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Revisar todos los datos' })).toHaveAttribute(
      'href',
      '/pendientes/91',
    );
  });

  it('skips a month whose bill never arrived by discarding the draft', async () => {
    const { draftsApi, transactionsApi, toast, sheets, user } = await setup([aRecurringDraft()]);
    const changesBefore = sheets.changes();
    const sheet = await openRecurringSheet(user);

    await user.click(within(sheet).getByRole('button', { name: 'Omitir este mes' }));

    expect(draftsApi.discard).toHaveBeenCalledWith(91);
    expect(transactionsApi.create).not.toHaveBeenCalled();
    expect(sheets.changes()).toBe(changesBefore + 1);
    expect(toast.info).toHaveBeenCalledWith('Omitido este mes', { description: 'Luz' });
    await vi.waitFor(() => expect(screen.queryAllByTestId('draft-row')).toHaveLength(0));
    expect(screen.queryByRole('dialog', { name: 'Luz' })).not.toBeInTheDocument();
  });

  it('closes the sheet when skipping a draft that was already resolved elsewhere', async () => {
    const { toast, sheets, user } = await setup([aRecurringDraft()], undefined, () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: 'Conflict', code: 'draft_not_pending' },
          }),
      ),
    );
    const changesBefore = sheets.changes();
    const sheet = await openRecurringSheet(user);

    await user.click(within(sheet).getByRole('button', { name: 'Omitir este mes' }));

    expect(toast.info).toHaveBeenCalledWith('Este borrador ya se confirmó o se descartó.');
    expect(sheets.changes()).toBe(changesBefore + 1);
    await vi.waitFor(() => expect(screen.queryAllByTestId('draft-row')).toHaveLength(0));
  });

  it('keeps the sheet open with an error when skipping fails', async () => {
    const { user } = await setup([aRecurringDraft()], undefined, () =>
      throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Boom' } })),
    );
    const sheet = await openRecurringSheet(user);

    await user.click(within(sheet).getByRole('button', { name: 'Omitir este mes' }));

    expect(await within(sheet).findByRole('alert')).toBeInTheDocument();
    expect(screen.getAllByTestId('draft-row')).toHaveLength(1);
  });
});
