import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { PeriodSummary } from '../../core/api/models';
import { PeriodsApi } from '../../core/api/periods.api';
import { ReportsApi } from '../../core/api/reports.api';
import { formatCents } from '../../core/money/format-cents';
import { aBudgetVsActual } from '../budgets/testing/budget-fixtures';
import { aCategory } from '../categories/testing/category-fixtures';
import { referenceDataProviders } from '../transactions/testing/reference-fakes';
import { ReportsPage } from './reports.page';
import { aCaptureMetrics, aPeriod, aSummary, aTrend } from './testing/report-fixtures';

const plain = (text: string) => text.replace(/\s+/g, ' ');

@Component({ template: '' })
class MovementsStub {}

async function setup(
  url = '/informes',
  summary = (period?: string): Observable<PeriodSummary> =>
    of(aSummary({ period: aPeriod(period ?? '2026-10') })),
) {
  const reports = {
    summary: vi.fn(summary),
    trend: vi.fn(() => of(aTrend())),
    captureMetrics: vi.fn(() => of(aCaptureMetrics())),
    budgetVsActual: vi.fn((period?: string) =>
      of(aBudgetVsActual({ period: aPeriod(period ?? '2026-10') })),
    ),
    netWorth: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ReportsApi, useValue: reports },
      { provide: PeriodsApi, useValue: { current: () => of(aPeriod('2026-10')) } },
      ...referenceDataProviders([
        aCategory({
          id: 10,
          name: 'Alimentación',
          color: '#1F8A3B',
          children: [aCategory({ id: 11, name: 'Supermercado', parent_id: 10 })],
        }),
      ]),
      provideRouter([
        { path: 'informes', component: ReportsPage },
        { path: 'movimientos', component: MovementsStub },
      ]),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, ReportsPage);
  harness.detectChanges();
  return { reports, harness, router: TestBed.inject(Router), user: userEvent.setup() };
}

describe('ReportsPage', () => {
  it('summarises the current period with its date range', async () => {
    const { reports } = await setup();

    expect(await screen.findByTestId('period-name')).toHaveTextContent('octubre de 2026');
    expect(screen.getByTestId('period-range')).toHaveTextContent('25 sept 2026 – 24 oct 2026');
    expect(reports.summary).toHaveBeenCalledWith('2026-10');
    expect(screen.getByTestId('summary-income')).toHaveTextContent(
      plain(formatCents(210000, { signed: true })),
    );
    expect(screen.getByTestId('summary-expense')).toHaveTextContent(plain(formatCents(157500)));
    expect(screen.getByTestId('summary-net')).toHaveTextContent(
      plain(formatCents(52500, { signed: true })),
    );
    expect(screen.getByTestId('summary-savings-rate')).toHaveTextContent('25 %');
  });

  it('colours income with an explicit plus sign and keeps zero income neutral', async () => {
    const { reports, router, harness } = await setup();
    const incomeValue = () =>
      within(screen.getByTestId('summary-income')).getByTestId('stat-value');

    expect(await screen.findByTestId('summary-income')).toBeInTheDocument();
    expect(incomeValue()).toHaveClass('text-success-text');
    expect(incomeValue()).toHaveTextContent(/^\+/);

    reports.summary.mockReturnValue(
      of(aSummary({ period: aPeriod('2026-09'), income_cents: 0, savings_rate_bp: null })),
    );
    await router.navigateByUrl('/informes?period=2026-09');
    harness.detectChanges();

    await vi.waitFor(() => expect(incomeValue()).toHaveTextContent(plain(formatCents(0))));
    expect(incomeValue()).toHaveClass('text-foreground');
  });

  it('switches periods and reloads every section for the new period', async () => {
    const { reports, router, harness, user } = await setup();
    await screen.findByTestId('period-summary');

    await user.click(screen.getByRole('button', { name: 'Periodo anterior' }));
    harness.detectChanges();

    await vi.waitFor(() => expect(router.url).toBe('/informes?period=2026-09'));
    await vi.waitFor(() => expect(reports.summary).toHaveBeenLastCalledWith('2026-09'));
    expect(reports.trend).toHaveBeenLastCalledWith({ periods: 12, until: '2026-09' });
    expect(reports.captureMetrics).toHaveBeenLastCalledWith('2026-09');
    expect(reports.budgetVsActual).toHaveBeenLastCalledWith('2026-09');
    harness.detectChanges();
    expect(screen.getByTestId('period-name')).toHaveTextContent('septiembre de 2026');
    expect(screen.getByRole('button', { name: 'Periodo siguiente' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Ir al actual' }));
    await vi.waitFor(() => expect(router.url).toBe('/informes'));
  });

  it('shows budget vs actual for the selected period', async () => {
    const { reports } = await setup('/informes?period=2026-09');

    const section = await screen.findByRole('region', { name: 'Presupuesto vs real' });
    expect(reports.budgetVsActual).toHaveBeenCalledWith('2026-09');
    expect(within(section).getAllByTestId('budget-row')).toHaveLength(4);
  });

  it('opens a period from the trend chart', async () => {
    const { router, user } = await setup();

    await user.click(await screen.findByRole('button', { name: /^marzo de 2026/ }));

    await vi.waitFor(() => expect(router.url).toBe('/informes?period=2026-03'));
  });

  it('drills down from a parent category to its children and then to the movements', async () => {
    const { router, harness, user } = await setup('/informes?period=2026-10');

    const breakdown = await screen.findByTestId('category-breakdown');
    const rows = within(breakdown).getAllByTestId('breakdown-row');
    expect(rows.map((row) => row.textContent?.trim().split(/\s/)[0])).toEqual([
      'Alimentación',
      'Vivienda',
      'Ocio',
    ]);
    expect(rows[2]).toHaveAttribute('href', '/movimientos?period=2026-10&category=30');

    await user.click(rows[0] as HTMLElement);
    harness.detectChanges();
    await vi.waitFor(() => expect(router.url).toBe('/informes?period=2026-10&category=10'));
    harness.detectChanges();

    expect(screen.getByTestId('drill-heading')).toHaveTextContent('Alimentación');
    const children = within(screen.getByRole('list', { name: 'Subcategorías de Alimentación' }));
    const child = children.getByTestId('breakdown-row');
    expect(child).toHaveTextContent('Supermercado');
    expect(child).toHaveAttribute('href', '/movimientos?period=2026-10&category=11');
    expect(children.getByTestId('breakdown-own-row')).toHaveTextContent(plain(formatCents(2000)));
    expect(
      screen.getByRole('link', { name: 'Ver los movimientos de Alimentación' }),
    ).toHaveAttribute('href', '/movimientos?period=2026-10&category=10');

    await user.click(child);
    await vi.waitFor(() => expect(router.url).toBe('/movimientos?period=2026-10&category=11'));
  });

  it('colours each category with its palette colour, falling back to its series slot', async () => {
    await setup('/informes?period=2026-10');

    const breakdown = await screen.findByTestId('category-breakdown');
    await vi.waitFor(() =>
      expect(within(breakdown).getAllByTestId('donut-arc')[1]?.style.fill).toBe(
        'var(--category-green)',
      ),
    );
    const arcs = within(breakdown).getAllByTestId('donut-arc');
    expect(arcs[0]?.style.fill).toBe('var(--viz-series-1)');

    const [food, home] = within(breakdown).getAllByTestId('breakdown-row');
    expect(within(food as HTMLElement).getByTestId('progress-fill').style.background).toBe(
      'var(--category-green)',
    );
    expect(
      (food as HTMLElement).querySelector('app-category-icon')?.getAttribute('style'),
    ).toContain('--category-color: var(--category-green)');
    expect(within(home as HTMLElement).getByTestId('progress-fill').style.background).toBe(
      'var(--viz-series-1)',
    );
  });

  it('goes back to every category from the breadcrumb', async () => {
    const { router, user } = await setup('/informes?category=10');

    await user.click(await screen.findByRole('link', { name: 'Todas las categorías' }));

    await vi.waitFor(() => expect(router.url).toBe('/informes'));
  });

  it('switches to the income breakdown and clears the drill-down', async () => {
    const { router, harness, user } = await setup('/informes?category=10');
    await screen.findByTestId('drill-heading');

    await user.click(screen.getByRole('radio', { name: 'Ingresos' }));
    harness.detectChanges();

    await vi.waitFor(() => expect(router.url).toBe('/informes?kind=income'));
    harness.detectChanges();
    expect(
      within(screen.getByTestId('category-breakdown')).getAllByTestId('breakdown-row'),
    ).toHaveLength(1);
    expect(screen.getByTestId('category-breakdown')).toHaveTextContent('Nómina');
  });

  it('compares the trend with a category', async () => {
    const { reports, user } = await setup();
    await screen.findByTestId('trend-section');

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Comparar con categoría' }),
      '11',
    );

    await vi.waitFor(() =>
      expect(reports.trend).toHaveBeenLastCalledWith({
        periods: 12,
        until: '2026-10',
        category_id: 11,
      }),
    );
  });

  it('shows the savings rate history with gaps for periods without income', async () => {
    await setup();

    const history = await screen.findByTestId('savings-history');
    expect(
      within(history).getByRole('img', { name: /^noviembre de 2025 .*Tasa de ahorro —$/ }),
    ).toBeInTheDocument();
  });

  it('reports a failure to load the summary', async () => {
    const { reports, router } = await setup();
    reports.summary.mockReturnValue(throwError(() => new Error('offline')));

    await router.navigateByUrl('/informes?period=2026-08');

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el informe.');
  });

  it('drops the previous period figures when the new period summary fails to load', async () => {
    const { reports, router, harness, user } = await setup();
    expect(await screen.findByTestId('summary-income')).toHaveTextContent(
      plain(formatCents(210000, { signed: true })),
    );
    reports.summary.mockReturnValue(throwError(() => new Error('offline')));

    await user.click(screen.getByRole('button', { name: 'Periodo anterior' }));
    harness.detectChanges();

    await vi.waitFor(() => expect(router.url).toBe('/informes?period=2026-09'));
    harness.detectChanges();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el informe.');
    expect(screen.getByTestId('period-name')).toHaveTextContent('septiembre de 2026');
    expect(screen.queryByTestId('period-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-income')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-breakdown')).not.toBeInTheDocument();
  });
  it('shows skeletons while the period summary loads', async () => {
    await setup('/informes', () => NEVER);

    expect(await screen.findByTestId('period-summary-loading')).toHaveTextContent(
      'Cargando resumen del periodo',
    );
    expect(screen.queryByTestId('period-summary')).not.toBeInTheDocument();
  });

  it('retries the summary after a failure', async () => {
    const { reports, router, harness, user } = await setup();
    reports.summary.mockReturnValue(throwError(() => new Error('offline')));
    await router.navigateByUrl('/informes?period=2026-08');
    const alert = await screen.findByRole('alert');

    reports.summary.mockReturnValue(of(aSummary({ period: aPeriod('2026-08') })));
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    harness.detectChanges();

    expect(await screen.findByTestId('period-summary')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lays the sections out in two columns', async () => {
    await setup();

    const columns = await screen.findByTestId('reports-columns');
    expect(columns).toHaveClass('grid-cols-1', 'lg:grid-cols-2');
    expect(within(columns).getByTestId('budget-vs-actual')).toBeInTheDocument();
    expect(within(columns).getByTestId('trend-section')).toBeInTheDocument();
    expect(within(columns).getByTestId('capture-quality')).toBeInTheDocument();
  });

  it('retries the trend when it cannot be loaded', async () => {
    const { reports, harness, user } = await setup();
    reports.trend.mockReturnValue(throwError(() => new Error('offline')));
    await user.click(await screen.findByRole('button', { name: 'Periodo anterior' }));
    harness.detectChanges();

    const trend = screen.getByTestId('trend-section');
    const alert = await within(trend).findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo cargar la evolución.');

    reports.trend.mockReturnValue(of(aTrend()));
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    harness.detectChanges();

    await vi.waitFor(() => expect(within(trend).queryByRole('alert')).not.toBeInTheDocument());
    expect(
      within(trend).getByRole('group', { name: 'Ingresos y gastos por periodo' }),
    ).toBeVisible();
  });
});
