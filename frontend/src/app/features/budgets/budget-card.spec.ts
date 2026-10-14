import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import { of, throwError } from 'rxjs';
import { ReportsApi } from '../../core/api/reports.api';
import { MovementSheets } from '../transactions/movement-sheets';
import { BudgetCard } from './budget-card';
import { aBudgetVsActual, anEmptyBudgetVsActual } from './testing/budget-fixtures';

async function setup(report: () => ReturnType<ReportsApi['budgetVsActual']>) {
  const reports = { budgetVsActual: vi.fn(report) };
  const view = await render(BudgetCard, {
    providers: [provideRouter([]), { provide: ReportsApi, useValue: reports }],
    inputs: { period: '2026-10' },
  });
  return { reports, view };
}

describe('BudgetCard', () => {
  it('shows the three most used budgets of the period', async () => {
    const { reports } = await setup(() => of(aBudgetVsActual()));

    const card = await screen.findByRole('region', { name: 'Presupuestos' });
    expect(reports.budgetVsActual).toHaveBeenCalledWith('2026-10');
    const rows = within(card).getAllByTestId('budget-row');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => within(row).getByTestId('budget-name').textContent?.trim())).toEqual([
      'Alimentación',
      'Vivienda',
      'Ocio',
    ]);
    expect(within(card).getByRole('link', { name: 'Ver todos' })).toHaveAttribute(
      'href',
      '/informes?period=2026-10',
    );
  });

  it('invites to set budgets when there are none', async () => {
    await setup(() => of(anEmptyBudgetVsActual()));

    const card = await screen.findByRole('region', { name: 'Presupuestos' });
    expect(within(card).queryAllByTestId('budget-row')).toHaveLength(0);
    expect(within(card).getByRole('link', { name: 'Definir presupuestos' })).toHaveAttribute(
      'href',
      '/mas/presupuestos?period=2026-10',
    );
  });

  it('stays out of the way when the report cannot be loaded', async () => {
    const { reports } = await setup(() => throwError(() => new Error('offline')));

    await vi.waitFor(() => expect(reports.budgetVsActual).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Presupuestos' })).not.toBeInTheDocument();
  });

  it('reloads when a movement changes elsewhere', async () => {
    const { reports, view } = await setup(() => of(aBudgetVsActual()));
    await screen.findByRole('region', { name: 'Presupuestos' });

    TestBed.inject(MovementSheets).notifyChanged();
    view.detectChanges();

    await vi.waitFor(() => expect(reports.budgetVsActual).toHaveBeenCalledTimes(2));
  });
});
