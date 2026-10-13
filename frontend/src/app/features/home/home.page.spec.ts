import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { AttachmentsApi } from '../../core/api/attachments.api';
import { DraftsApi } from '../../core/api/drafts.api';
import { NetWorth } from '../../core/api/models';
import { PeriodsApi } from '../../core/api/periods.api';
import { RecurringApi } from '../../core/api/recurring.api';
import { ReportsApi } from '../../core/api/reports.api';
import { TransactionsApi } from '../../core/api/transactions.api';
import { formatCents } from '../../core/money/format-cents';
import { quietAttachmentsApi, quietDraftsApi } from '../drafts/testing/draft-fixtures';
import { aForecast, quietRecurringApi } from '../recurring/testing/recurring-fixtures';
import { aNetWorth, aNetWorthAccount, aPeriod, aSummary } from '../reports/testing/report-fixtures';
import { aPage } from '../transactions/testing/feed-fakes';
import { aTransaction, aTransferLeg } from '../transactions/testing/transaction-fixtures';
import { HomePage } from './home.page';

const plain = (text: string) => text.replace(/\s+/g, ' ');

interface SetupOptions {
  netWorth?: NetWorth;
  forecast?: ReturnType<typeof aForecast>;
  url?: string;
  pending?: number;
}

async function setup(options: SetupOptions = {}) {
  const reports = {
    summary: vi.fn((period?: string) => of(aSummary({ period: aPeriod(period ?? '2026-10') }))),
    netWorth: vi.fn(() => of(options.netWorth ?? aNetWorth())),
  };
  const transactions = {
    list: vi.fn(() => of(aPage([aTransaction({ description: 'Pan' }), aTransferLeg()]))),
  };
  const recurring = quietRecurringApi(options.forecast ?? aForecast({ items: [] }));
  const recurringApi = { ...recurring, forecast: vi.fn(recurring.forecast) };
  TestBed.configureTestingModule({
    providers: [
      { provide: DraftsApi, useValue: quietDraftsApi(options.pending ?? 0) },
      { provide: RecurringApi, useValue: recurringApi },
      { provide: AttachmentsApi, useValue: quietAttachmentsApi() },
      { provide: ReportsApi, useValue: reports },
      { provide: TransactionsApi, useValue: transactions },
      { provide: PeriodsApi, useValue: { current: () => of(aPeriod('2026-10')) } },
      provideRouter([{ path: '', component: HomePage }]),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(options.url ?? '/', HomePage);
  harness.detectChanges();
  const router = TestBed.inject(Router);
  return { reports, transactions, recurringApi, harness, router, user: userEvent.setup() };
}

describe('HomePage', () => {
  it('invites to create the first account when there are none', async () => {
    const { router, user } = await setup({
      netWorth: aNetWorth({ accounts: [], total_cents: 0, assets_cents: 0, liabilities_cents: 0 }),
    });
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await user.click(await screen.findByRole('button', { name: 'Crear mi primera cuenta' }));

    expect(navigateByUrl).toHaveBeenCalledWith('/cuentas/nueva');
  });

  it('shows the current period with its date range, income, expense and savings rate', async () => {
    const { reports } = await setup();

    expect(await screen.findByTestId('period-name')).toHaveTextContent('octubre de 2026');
    expect(screen.getByTestId('period-range')).toHaveTextContent('25 sept 2026 – 24 oct 2026');
    expect(reports.summary).toHaveBeenCalledWith('2026-10');
    const overview = screen.getByTestId('period-overview');
    expect(within(overview).getByTestId('home-income')).toHaveTextContent(
      plain(formatCents(210000)),
    );
    expect(within(overview).getByTestId('home-expense')).toHaveTextContent(
      plain(formatCents(157500)),
    );
    expect(within(overview).getByTestId('home-savings-rate')).toHaveTextContent('25 %');
    expect(screen.getByTestId('spent-share')).toHaveTextContent(
      'Has gastado el 75 % de tus ingresos',
    );
    expect(screen.getByRole('button', { name: 'Periodo siguiente' })).toBeDisabled();
  });

  it('moves to the previous period and back through the query string', async () => {
    const { reports, router, harness, user } = await setup();
    await screen.findByTestId('period-overview');

    await user.click(screen.getByRole('button', { name: 'Periodo anterior' }));
    harness.detectChanges();

    await vi.waitFor(() => expect(router.url).toBe('/?period=2026-09'));
    await vi.waitFor(() => expect(reports.summary).toHaveBeenLastCalledWith('2026-09'));
    harness.detectChanges();
    expect(screen.getByTestId('period-range')).toHaveTextContent('25 ago 2026 – 24 sept 2026');

    await user.click(screen.getByRole('button', { name: 'Periodo siguiente' }));
    await vi.waitFor(() => expect(router.url).toBe('/'));
  });

  it('says the savings rate is not available without income', async () => {
    const { reports, router } = await setup();
    reports.summary.mockReturnValue(
      of(aSummary({ income_cents: 0, net_cents: -157500, savings_rate_bp: null })),
    );
    await router.navigateByUrl('/?period=2026-08');

    const tile = await screen.findByTestId('home-savings-rate');
    expect(tile).toHaveTextContent('—');
    expect(tile).toHaveTextContent('Sin ingresos');
    expect(screen.queryByTestId('spent-share')).not.toBeInTheDocument();
  });

  it('shows the net worth with each account last update and stale warnings', async () => {
    await setup();

    expect(await screen.findByTestId('net-worth')).toHaveTextContent(plain(formatCents(1834500)));
    const accounts = screen.getByRole('list', { name: 'Cuentas' });
    const items = within(accounts).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Actualizado el 12 oct 2026');
    expect(items[1]).toHaveTextContent('Desactualizada');
    expect(items[3]).toHaveTextContent('Sin movimientos');
    expect(screen.getByTestId('stale-warning')).toHaveTextContent(
      '2 cuentas llevan más de 30 días sin actualizarse: Hucha, Fondo.',
    );
    expect(screen.getByRole('link', { name: 'Ver cuentas (4)' })).toBeInTheDocument();
  });

  it('hides archived accounts from the list but keeps them in the total', async () => {
    await setup({
      netWorth: aNetWorth({
        total_cents: 105000,
        accounts: [
          aNetWorthAccount({ id: 1, name: 'BBVA', balance_cents: 100000 }),
          aNetWorthAccount({ id: 2, name: 'Vieja', balance_cents: 5000, archived: true }),
        ],
      }),
    });

    const accounts = await screen.findByRole('list', { name: 'Cuentas' });
    expect(accounts).toHaveTextContent('BBVA');
    expect(accounts).not.toHaveTextContent('Vieja');
    expect(screen.getByTestId('net-worth')).toHaveTextContent(plain(formatCents(105000)));
    const note = screen.getByRole('link', { name: 'Incluye 1 cuenta archivada' });
    expect(note).toHaveAttribute('href', '/informes/patrimonio');
  });

  it('does not mention archived accounts without balance', async () => {
    await setup({
      netWorth: aNetWorth({
        total_cents: 100000,
        accounts: [
          aNetWorthAccount({ id: 1, name: 'BBVA', balance_cents: 100000 }),
          aNetWorthAccount({ id: 2, name: 'Vieja', balance_cents: 0, archived: true }),
        ],
      }),
    });

    await screen.findByRole('list', { name: 'Cuentas' });
    expect(screen.queryByTestId('archived-included')).not.toBeInTheDocument();
  });

  it('counts every archived account with balance in the total note', async () => {
    await setup({
      netWorth: aNetWorth({
        accounts: [
          aNetWorthAccount({ id: 1, name: 'BBVA' }),
          aNetWorthAccount({ id: 2, name: 'Vieja', balance_cents: 5000, archived: true }),
          aNetWorthAccount({ id: 5, name: 'Tarjeta', balance_cents: -2000, archived: true }),
        ],
      }),
    });

    expect(await screen.findByTestId('archived-included')).toHaveTextContent(
      'Incluye 2 cuentas archivadas',
    );
  });

  it('shows pending drafts, top categories and the last 10 movements', async () => {
    const { transactions } = await setup({ pending: 3 });

    expect(await screen.findByTestId('pending-drafts')).toHaveTextContent('3');
    const top = screen.getAllByTestId('top-category');
    expect(top.map((row) => row.textContent?.trim().split(/\s/)[0])).toEqual([
      'Vivienda',
      'Alimentación',
      'Ocio',
    ]);
    expect(top[0]).toHaveAttribute('href', '/informes?period=2026-10&category=20');
    expect(transactions.list).toHaveBeenCalledWith({ page: 1, per_page: 10 });
    expect(screen.getByText('Pan')).toBeInTheDocument();
    expect(screen.getByText('BBVA → Ahorro')).toBeInTheDocument();
  });

  it('shows the recurring items still pending in the selected period', async () => {
    const { recurringApi } = await setup({ forecast: aForecast(), url: '/?period=2026-09' });

    const card = await screen.findByRole('region', { name: 'Fijos pendientes este periodo' });
    expect(card).toHaveTextContent('Luz');
    expect(recurringApi.forecast).toHaveBeenCalledWith('2026-09');
  });

  it('reports a failure when the net worth cannot be loaded', async () => {
    TestBed.overrideProvider(ReportsApi, {
      useValue: {
        summary: () => of(aSummary()),
        netWorth: () => throwError(() => new Error('offline')),
      },
    });
    await setup();

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar tu resumen.');
  });

  it('drops the previous period figures when the new period summary fails to load', async () => {
    const { reports, router, harness, user } = await setup();
    const overview = await screen.findByTestId('period-overview');
    expect(within(overview).getByTestId('home-income')).toHaveTextContent(
      plain(formatCents(210000)),
    );
    reports.summary.mockReturnValue(throwError(() => new Error('offline')));

    await user.click(screen.getByRole('button', { name: 'Periodo anterior' }));
    harness.detectChanges();

    await vi.waitFor(() => expect(router.url).toBe('/?period=2026-09'));
    harness.detectChanges();
    expect(await screen.findByTestId('summary-failed')).toHaveTextContent(
      'No se pudo cargar el resumen de este periodo.',
    );
    expect(screen.getByTestId('period-name')).toHaveTextContent('septiembre de 2026');
    expect(screen.queryByTestId('period-overview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-income')).not.toBeInTheDocument();
    expect(screen.queryByTestId('top-category')).not.toBeInTheDocument();
  });
});
