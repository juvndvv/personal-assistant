import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import { of, throwError } from 'rxjs';
import { BudgetVsActual } from '../../core/api/models';
import { ReportsApi } from '../../core/api/reports.api';
import { formatCents } from '../../core/money/format-cents';
import { BudgetVsActualSection } from './budget-vs-actual-section';
import { aBudgetVsActual, anEmptyBudgetVsActual } from './testing/budget-fixtures';

const plain = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

async function setup(report: () => ReturnType<ReportsApi['budgetVsActual']>, period = '2026-10') {
  const reports = { budgetVsActual: vi.fn(report) };
  const view = await render(BudgetVsActualSection, {
    providers: [provideRouter([]), { provide: ReportsApi, useValue: reports }],
    inputs: { period },
  });
  return { reports, view };
}

describe('BudgetVsActualSection', () => {
  it('shows budget vs actual per category with totals for the period', async () => {
    const { reports } = await setup(() => of(aBudgetVsActual()));

    const section = await screen.findByRole('region', { name: 'Presupuesto vs real' });
    expect(reports.budgetVsActual).toHaveBeenCalledWith('2026-10');
    const rows = within(section).getAllByTestId('budget-row');
    expect(rows.map((row) => within(row).getByTestId('budget-name').textContent?.trim())).toEqual([
      'Alimentación',
      'Vivienda',
      'Ocio',
      'Transporte',
    ]);
    expect(within(rows[0] as HTMLElement).getByTestId('budget-status')).toHaveTextContent(
      'Superado',
    );
    expect(within(rows[1] as HTMLElement).getByTestId('budget-status')).toHaveTextContent(
      'Cerca del límite',
    );
    expect(plain(within(section).getByTestId('budget-totals').textContent)).toContain(
      plain(`${formatCents(157500)} de ${formatCents(200000)}`),
    );
    expect(plain(within(section).getByTestId('unbudgeted-actual').textContent)).toContain(
      plain(`Gasto sin presupuesto: ${formatCents(12000)}`),
    );
    expect(within(section).getByRole('link', { name: 'Editar presupuestos' })).toHaveAttribute(
      'href',
      '/mas/presupuestos?period=2026-10',
    );
  });

  it('invites to define budgets when the period has none', async () => {
    await setup(() => of(anEmptyBudgetVsActual()));

    const section = await screen.findByRole('region', { name: 'Presupuesto vs real' });
    expect(section).toHaveTextContent('No tienes presupuestos en este periodo.');
    expect(within(section).getByRole('link', { name: 'Definir presupuestos' })).toHaveAttribute(
      'href',
      '/mas/presupuestos?period=2026-10',
    );
    expect(within(section).queryAllByTestId('budget-row')).toHaveLength(0);
  });

  it('reloads when the period changes', async () => {
    const responses: BudgetVsActual[] = [aBudgetVsActual(), anEmptyBudgetVsActual('2026-09')];
    const { reports, view } = await setup(() => of(responses.shift()!));
    await screen.findAllByTestId('budget-row');

    await view.rerender({ inputs: { period: '2026-09' } });

    await vi.waitFor(() => expect(reports.budgetVsActual).toHaveBeenLastCalledWith('2026-09'));
    expect(await screen.findByText('No tienes presupuestos en este periodo.')).toBeInTheDocument();
  });

  it('reports a failure', async () => {
    await setup(() => throwError(() => new Error('offline')));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar el presupuesto de este periodo.',
    );
  });
});
