import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { AccountsApi } from '../../../core/api/accounts.api';
import { CategoriesApi } from '../../../core/api/categories.api';
import { Period } from '../../../core/api/models';
import { PeriodsApi } from '../../../core/api/periods.api';
import { TagsApi } from '../../../core/api/tags.api';
import { TransactionsApi } from '../../../core/api/transactions.api';
import { TransfersApi } from '../../../core/api/transfers.api';
import { UiToast } from '../../../shared/ui';
import { anAccount } from '../../accounts/testing/account-fixtures';
import { MovementSheets } from '../movement-sheets';
import { aPage } from '../testing/feed-fakes';
import { aTransaction, aTransferLeg } from '../testing/transaction-fixtures';
import { TransactionsPage } from './transactions.page';
import { AttachmentsApi } from '../../../core/api/attachments.api';
import { DraftsApi } from '../../../core/api/drafts.api';
import { quietAttachmentsApi, quietDraftsApi } from '../../drafts/testing/draft-fixtures';

const PERIODS: Period[] = [
  { label: '2026-09', start: '2026-08-25', end: '2026-09-24', month_start_day: 25 },
  { label: '2026-10', start: '2026-09-25', end: '2026-10-24', month_start_day: 25 },
];

async function setup(url = '/movimientos') {
  const transactionsApi = {
    list: vi.fn(() =>
      of(
        aPage(
          [
            aTransaction({ id: 1, description: 'Café', date: '2026-10-12' }),
            aTransferLeg({ id: 2, date: '2026-10-12' }),
            aTransaction({
              id: 3,
              description: 'Nómina',
              type: 'income',
              date: '2026-10-01',
              signed_amount_cents: 200000,
              amount_cents: 200000,
            }),
          ],
          { totals: { income_cents: 200000, expense_cents: 2350 } },
        ),
      ),
    ),
    delete: vi.fn(() => of(undefined)),
    restore: vi.fn(() => of(aTransaction())),
  };
  const transfersApi = { delete: vi.fn(() => of(undefined)), restore: vi.fn(() => of({})) };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: DraftsApi, useValue: quietDraftsApi() },
      { provide: AttachmentsApi, useValue: quietAttachmentsApi() },
      provideRouter([{ path: 'movimientos', component: TransactionsPage }]),
      { provide: TransactionsApi, useValue: transactionsApi },
      { provide: TransfersApi, useValue: transfersApi },
      { provide: PeriodsApi, useValue: { list: vi.fn(() => of(PERIODS)) } },
      {
        provide: AccountsApi,
        useValue: {
          list: () =>
            of([anAccount({ id: 3, name: 'BBVA' }), anAccount({ id: 9, name: 'Ahorro' })]),
        },
      },
      { provide: CategoriesApi, useValue: { list: () => of([]) } },
      { provide: TagsApi, useValue: { list: () => of([{ id: 5, name: 'roma', usage_count: 2 }]) } },
      { provide: UiToast, useValue: toast },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, TransactionsPage);
  harness.detectChanges();
  const router = TestBed.inject(Router);
  return { transactionsApi, transfersApi, toast, router, harness, user: userEvent.setup() };
}

function lastQuery(list: ReturnType<typeof vi.fn>): unknown {
  return list.mock.calls.at(-1)?.[0];
}

describe('TransactionsPage', () => {
  it('lists the current period grouped by date with its totals', async () => {
    const { transactionsApi } = await setup();

    expect(await screen.findByText('Café')).toBeInTheDocument();
    expect(lastQuery(transactionsApi.list)).toEqual({ period: '2026-10', page: 1, per_page: 50 });
    expect(screen.getByTestId('total-income')).toHaveTextContent('2.000,00 €');
    expect(screen.getByTestId('total-expense')).toHaveTextContent('23,50 €');
    expect(screen.getByTestId('list-scope')).toHaveTextContent(
      'Periodo octubre de 2026: del 25 sept 2026 al 24 oct 2026',
    );
    expect(
      screen
        .getAllByTestId('date-header')
        .map((header) => header.querySelector('span')?.textContent?.trim()),
    ).toEqual(['12 de octubre de 2026', '1 de octubre de 2026']);
    expect(screen.getByText('BBVA → Ahorro')).toBeInTheDocument();
  });

  it('reads every filter from the URL', async () => {
    const { transactionsApi } = await setup(
      '/movimientos?q=cafe&from=2026-01-01&type=expense&account=3&tag=5&tag=6&tag_mode=all&receipt=1',
    );

    await screen.findByText('Café');
    expect(lastQuery(transactionsApi.list)).toEqual({
      q: 'cafe',
      date_from: '2026-01-01',
      type: ['expense'],
      account_id: [3],
      tag_id: [5, 6],
      tag_mode: 'all',
      has_attachments: true,
      page: 1,
      per_page: 50,
    });
    expect(screen.getByRole('button', { name: 'Filtros (5)' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('cafe');
  });

  it('writes the debounced search to the URL', async () => {
    const { router, user } = await setup();
    await screen.findByText('Café');

    await user.type(screen.getByRole('textbox', { name: 'Buscar' }), 'mercadona');

    expect(router.url).toBe('/movimientos');
    await vi.waitFor(() => expect(router.url).toBe('/movimientos?q=mercadona'), { timeout: 2000 });
  });

  it('applies the filter sheet to the URL', async () => {
    const { router, user } = await setup();
    await screen.findByText('Café');

    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filtros' });
    await user.click(within(sheet).getByRole('checkbox', { name: 'Gasto' }));
    await user.click(within(sheet).getByRole('checkbox', { name: 'Transferencia' }));
    await user.click(await within(sheet).findByRole('checkbox', { name: 'roma' }));
    await user.click(within(sheet).getByRole('radio', { name: 'Todas' }));
    await user.selectOptions(within(sheet).getByRole('combobox', { name: 'Periodo' }), '2026-09');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await vi.waitFor(() =>
      expect(router.url).toBe(
        '/movimientos?period=2026-09&type=expense&type=transfer&tag=5&tag_mode=all',
      ),
    );
  });

  it('deletes a movement and restores it with undo', async () => {
    const { transactionsApi, toast, user } = await setup();
    await screen.findByText('Café');
    const calls = transactionsApi.list.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Acciones de Café' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Eliminar' }));

    expect(transactionsApi.delete).toHaveBeenCalledWith(1);
    expect(transactionsApi.list.mock.calls.length).toBe(calls + 1);
    const [message, options] = toast.success.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe('Movimiento eliminado');
    expect(options.action.label).toBe('Deshacer');
    options.action.onClick();
    await vi.waitFor(() => expect(transactionsApi.restore).toHaveBeenCalledWith(1));
  });

  it('deletes transfers through the transfer endpoint', async () => {
    const { transfersApi, transactionsApi, toast, user } = await setup();
    await screen.findByText('Café');

    await user.click(screen.getByRole('button', { name: 'Acciones de BBVA → Ahorro' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Eliminar' }));

    expect(transfersApi.delete).toHaveBeenCalledWith(44);
    expect(transactionsApi.delete).not.toHaveBeenCalled();
    const [, options] = toast.success.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(options.action.label).toBe('Deshacer');
    options.action.onClick();
    await vi.waitFor(() => expect(transfersApi.restore).toHaveBeenCalledWith(44));
    expect(transactionsApi.restore).not.toHaveBeenCalled();
  });

  it('opens the editor for movements and the transfer form for transfers', async () => {
    const { user } = await setup();
    const sheets = TestBed.inject(MovementSheets);
    await screen.findByText('Café');

    await user.click(screen.getByRole('button', { name: 'Editar Café' }));
    expect(sheets.editTarget()?.id).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Editar BBVA → Ahorro' }));
    expect(sheets.transferRequest()).toEqual({ transferId: 44, fromAccountId: null });
  });

  it('exports the current period as CSV from a same-origin download link', async () => {
    await setup();

    await screen.findByText('Café');
    const link = screen.getByRole('link', { name: 'Exportar CSV' });
    expect(link).toHaveAttribute(
      'href',
      '/api/v1/exports/transactions.csv?period=2026-10&delimiter=semicolon',
    );
    expect(link).toHaveAttribute('download');
  });

  it('exports exactly the filtered list', async () => {
    await setup('/movimientos?q=cafe&period=2026-09&type=expense&account=3&tag=5&receipt=0');

    await screen.findByText('Café');
    const href = screen.getByRole('link', { name: 'Exportar CSV' }).getAttribute('href') ?? '';
    const [path, query] = href.split('?');
    const params = new URLSearchParams(query);
    expect(path).toBe('/api/v1/exports/transactions.csv');
    expect(Object.fromEntries(params)).toEqual({
      q: 'cafe',
      period: '2026-09',
      'type[]': 'expense',
      'account_id[]': '3',
      'tag_id[]': '5',
      has_attachments: '0',
      delimiter: 'semicolon',
    });
  });
});
