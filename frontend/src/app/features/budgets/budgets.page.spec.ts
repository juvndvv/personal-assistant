import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { BudgetsApi } from '../../core/api/budgets.api';
import { Budget, BudgetInput, BudgetVsActual } from '../../core/api/models';
import { PeriodsApi } from '../../core/api/periods.api';
import { ReportsApi } from '../../core/api/reports.api';
import { formatCents } from '../../core/money/format-cents';
import { UiToast } from '../../shared/ui';
import { aCategory } from '../categories/testing/category-fixtures';
import { aPeriod } from '../reports/testing/report-fixtures';
import { referenceDataProviders } from '../transactions/testing/reference-fakes';
import { BudgetsPage } from './budgets.page';
import {
  aBudget,
  aBudgetHistory,
  aBudgetList,
  aBudgetVsActual,
  aCategorySummary,
} from './testing/budget-fixtures';

const plain = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

interface SetupOptions {
  url?: string;
  set?: (categoryId: number, input: BudgetInput) => Observable<Budget>;
  budgetVsActual?: (period?: string) => Observable<BudgetVsActual>;
  clear?: (categoryId: number) => Observable<void>;
  list?: (period?: string) => Observable<Budget[]>;
}

async function setup(options: SetupOptions = {}) {
  const budgets = {
    list: vi.fn(
      options.list ?? ((period?: string) => of(period === undefined ? [] : aBudgetList())),
    ),
    set: vi.fn(
      options.set ??
        ((categoryId: number, input: BudgetInput) =>
          of(
            aBudget({
              category: aCategorySummary({ id: categoryId }),
              amount_cents: input.amount_cents === 0 ? null : input.amount_cents,
              effective_from: input.amount_cents === 0 ? null : (input.effective_from ?? null),
            }),
          )),
    ),
    history: vi.fn(() => of(aBudgetHistory())),
    clear: vi.fn(options.clear ?? (() => of(undefined))),
  };
  const reports = {
    budgetVsActual: vi.fn(
      options.budgetVsActual ??
        ((period?: string) => of(aBudgetVsActual({ period: aPeriod(period ?? '2026-10') }))),
    ),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetsApi, useValue: budgets },
      { provide: ReportsApi, useValue: reports },
      { provide: PeriodsApi, useValue: { current: () => of(aPeriod('2026-10')) } },
      { provide: UiToast, useValue: toast },
      ...referenceDataProviders([aCategory({ id: 10, name: 'Alimentación', color: '#4F46C8' })]),
      provideRouter([{ path: 'mas/presupuestos', component: BudgetsPage }]),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(options.url ?? '/mas/presupuestos', BudgetsPage);
  harness.detectChanges();
  return {
    budgets,
    reports,
    toast,
    harness,
    router: TestBed.inject(Router),
    user: userEvent.setup(),
  };
}

async function row(name: string): Promise<HTMLElement> {
  const rows = await screen.findAllByTestId('budget-category');
  const match = rows.find((candidate) => within(candidate).queryByText(name) !== null);
  if (match === undefined) {
    throw new Error(`No budget row for ${name}`);
  }
  return match;
}

describe('BudgetsPage', () => {
  it('lists every top-level expense category with its effective budget for the period', async () => {
    const { budgets } = await setup();

    expect(await screen.findByTestId('period-name')).toHaveTextContent('octubre de 2026');
    expect(screen.getByTestId('period-range')).toHaveTextContent('25 sept 2026 – 24 oct 2026');
    expect(budgets.list).toHaveBeenCalledWith('2026-10');

    const food = await row('Alimentación');
    expect(plain(within(food).getByTestId('budget-amount').textContent)).toBe(
      plain(formatCents(40000)),
    );
    expect(food).toHaveTextContent('Desde julio de 2026');
    expect(plain(within(food).getByTestId('budget-actual').textContent)).toContain(
      plain(`Gastado ${formatCents(42000)}`),
    );

    const leisure = await row('Ocio');
    expect(within(leisure).getByTestId('budget-amount')).toHaveTextContent('Sin presupuesto');
    expect(within(leisure).queryByTestId('budget-actual')).not.toBeInTheDocument();
    expect(within(leisure).getByText('Ocio')).not.toHaveClass('truncate');
    await vi.waitFor(() =>
      expect(food.querySelector('app-category-icon')?.getAttribute('style')).toContain(
        '--category-color: var(--category-indigo)',
      ),
    );

    expect(plain(screen.getByTestId('budget-total').textContent)).toContain(
      plain(formatCents(130000)),
    );
  });

  it('edits a budget inline and applies it from the selected period', async () => {
    const { budgets, toast, user } = await setup();
    const food = await row('Alimentación');

    await user.click(
      within(food).getByRole('button', { name: 'Editar presupuesto de Alimentación' }),
    );
    const amount = within(food).getByRole('textbox', {
      name: /Presupuesto mensual de Alimentación/,
    });
    expect(amount).toHaveValue('400,00');
    expect(food).toHaveTextContent('Se aplica desde este periodo (octubre de 2026)');

    await user.clear(amount);
    await user.type(amount, '450');
    await user.click(within(food).getByRole('button', { name: 'Guardar' }));

    expect(budgets.set).toHaveBeenCalledWith(10, {
      amount_cents: 45000,
      effective_from: '2026-10',
    });
    await vi.waitFor(() =>
      expect(plain(within(food).getByTestId('budget-amount').textContent)).toBe(
        plain(formatCents(45000)),
      ),
    );
    expect(food).toHaveTextContent('Desde octubre de 2026');
    expect(within(food).queryByRole('textbox')).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Presupuesto de Alimentación guardado');
  });

  it('sets a budget on a category without one and reloads budget vs actual', async () => {
    const withLeisure = aBudgetVsActual();
    const withoutLeisure = aBudgetVsActual({
      items: withLeisure.items.filter((item) => item.category.id !== 30),
    });
    const responses = [withoutLeisure, withLeisure];
    const { budgets, reports, user } = await setup({
      budgetVsActual: () => of(responses.shift() ?? withLeisure),
    });
    const leisure = await row('Ocio');
    expect(reports.budgetVsActual).toHaveBeenCalledTimes(1);

    await user.click(within(leisure).getByRole('button', { name: 'Editar presupuesto de Ocio' }));
    const amount = within(leisure).getByRole('textbox', { name: /Presupuesto mensual de Ocio/ });
    expect(amount).toHaveValue('');
    await user.type(amount, '120,50{Enter}');

    expect(budgets.set).toHaveBeenCalledWith(30, {
      amount_cents: 12050,
      effective_from: '2026-10',
    });
    await vi.waitFor(() => expect(reports.budgetVsActual).toHaveBeenCalledTimes(2));
    expect(await within(leisure).findByTestId('budget-actual')).toBeInTheDocument();
  });

  it('allows planning up to 11 periods ahead of the current one', async () => {
    await setup({ url: '/mas/presupuestos?period=2027-09' });

    expect(await screen.findByTestId('period-name')).toHaveTextContent('septiembre de 2027');
    expect(screen.getByRole('button', { name: 'Periodo siguiente' })).toBeEnabled();
  });

  it('stops moving forward 12 periods ahead of the current one', async () => {
    await setup({ url: '/mas/presupuestos?period=2027-10' });

    expect(await screen.findByTestId('period-name')).toHaveTextContent('octubre de 2027');
    expect(screen.getByRole('button', { name: 'Periodo siguiente' })).toBeDisabled();
  });

  it('clears the budget from this period on when saving 0', async () => {
    const { budgets, toast, user } = await setup();
    const food = await row('Alimentación');

    await user.click(
      within(food).getByRole('button', { name: 'Editar presupuesto de Alimentación' }),
    );
    expect(food).toHaveTextContent('Pon 0 para dejar de presupuestar');
    const amount = within(food).getByRole('textbox', {
      name: /Presupuesto mensual de Alimentación/,
    });
    await user.clear(amount);
    await user.type(amount, '0');
    await user.click(within(food).getByRole('button', { name: 'Guardar' }));

    expect(budgets.set).toHaveBeenCalledWith(10, { amount_cents: 0, effective_from: '2026-10' });
    await vi.waitFor(() =>
      expect(within(food).getByTestId('budget-amount')).toHaveTextContent('Sin presupuesto'),
    );
    expect(toast.success).toHaveBeenCalledWith(
      'Alimentación ya no tiene presupuesto desde octubre de 2026',
    );
  });

  it('requires an amount before saving', async () => {
    const { budgets, user } = await setup();
    const food = await row('Alimentación');

    await user.click(
      within(food).getByRole('button', { name: 'Editar presupuesto de Alimentación' }),
    );
    await user.clear(within(food).getByRole('textbox'));
    await user.click(within(food).getByRole('button', { name: 'Guardar' }));

    expect(budgets.set).not.toHaveBeenCalled();
    expect(food).toHaveTextContent('Introduce un importe. Pon 0 para quitar el presupuesto.');
  });

  it('shows the server validation error and keeps the editor open', async () => {
    const { user } = await setup({
      set: () =>
        throwError(
          () =>
            new HttpErrorResponse({
              status: 422,
              error: {
                message: 'Invalid',
                errors: { category_id: ['Solo las categorías de gasto principales.'] },
              },
            }),
        ),
    });
    const food = await row('Alimentación');

    await user.click(
      within(food).getByRole('button', { name: 'Editar presupuesto de Alimentación' }),
    );
    await user.click(within(food).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(food).findByText('Solo las categorías de gasto principales.'),
    ).toBeVisible();
    expect(within(food).getByRole('textbox')).toBeInTheDocument();
  });

  it('reports an unexpected failure without losing the typed amount', async () => {
    const { toast, user } = await setup({ set: () => throwError(() => new Error('offline')) });
    const food = await row('Alimentación');

    await user.click(
      within(food).getByRole('button', { name: 'Editar presupuesto de Alimentación' }),
    );
    const amount = within(food).getByRole('textbox');
    await user.clear(amount);
    await user.type(amount, '480');
    await user.click(within(food).getByRole('button', { name: 'Guardar' }));

    expect(toast.error).toHaveBeenCalledWith(
      'No se pudo guardar el presupuesto. Inténtalo de nuevo.',
    );
    expect(within(food).getByRole('textbox')).toHaveValue('480,00');
  });

  it('cancels the edit and keeps a single editor open', async () => {
    const { budgets, user } = await setup();
    const food = await row('Alimentación');
    const housing = await row('Vivienda');

    await user.click(
      within(food).getByRole('button', { name: 'Editar presupuesto de Alimentación' }),
    );
    await user.click(
      within(housing).getByRole('button', { name: 'Editar presupuesto de Vivienda' }),
    );
    expect(within(food).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(housing).getByRole('textbox')).toHaveValue('900,00');

    await user.click(within(housing).getByRole('button', { name: 'Cancelar' }));
    expect(within(housing).queryByRole('textbox')).not.toBeInTheDocument();
    expect(budgets.set).not.toHaveBeenCalled();
  });

  it('moves to future periods and applies edits from the selected one', async () => {
    const { budgets, reports, router, harness, user } = await setup();
    await row('Alimentación');

    const next = screen.getByRole('button', { name: 'Periodo siguiente' });
    expect(next).toBeEnabled();
    await user.click(next);
    harness.detectChanges();

    await vi.waitFor(() => expect(router.url).toBe('/mas/presupuestos?period=2026-11'));
    await vi.waitFor(() => expect(budgets.list).toHaveBeenLastCalledWith('2026-11'));
    expect(reports.budgetVsActual).toHaveBeenLastCalledWith('2026-11');

    const food = await row('Alimentación');
    await user.click(
      within(food).getByRole('button', { name: 'Editar presupuesto de Alimentación' }),
    );
    expect(food).toHaveTextContent('Se aplica desde este periodo (noviembre de 2026)');
    await user.click(within(food).getByRole('button', { name: 'Guardar' }));
    expect(budgets.set).toHaveBeenCalledWith(10, {
      amount_cents: 40000,
      effective_from: '2026-11',
    });
  });

  it('opens the history of a category, newest first', async () => {
    const { budgets, user } = await setup();
    const food = await row('Alimentación');

    await user.click(within(food).getByRole('button', { name: 'Historial de Alimentación' }));

    const sheet = await screen.findByRole('dialog', { name: 'Historial de Alimentación' });
    expect(budgets.history).toHaveBeenCalledWith(10);
    const entries = await within(sheet).findAllByTestId('budget-history-entry');
    expect(entries).toHaveLength(3);
    expect(entries[0]).toHaveTextContent('Desde noviembre de 2026');
    expect(entries[0]).toHaveTextContent('Sin presupuesto');
    expect(entries[1]).toHaveTextContent('Desde septiembre de 2026');
    expect(plain(entries[1]?.textContent ?? '')).toContain(plain(formatCents(45000)));
    expect(entries[2]).toHaveTextContent('Desde julio de 2026');
  });

  it('clears the budget and its whole history after confirmation, then reloads', async () => {
    const { budgets, reports, toast, user } = await setup();
    const food = await row('Alimentación');
    const listCalls = budgets.list.mock.calls.length;
    const reportCalls = reports.budgetVsActual.mock.calls.length;

    await user.click(within(food).getByRole('button', { name: 'Historial de Alimentación' }));
    const sheet = await screen.findByRole('dialog', { name: 'Historial de Alimentación' });
    await within(sheet).findAllByTestId('budget-history-entry');

    await user.click(
      within(sheet).getByRole('button', { name: 'Eliminar presupuesto e historial' }),
    );
    const confirmation = within(sheet).getByRole('group', {
      name: 'Confirmar eliminación del presupuesto',
    });
    expect(budgets.clear).not.toHaveBeenCalled();
    expect(confirmation).toHaveTextContent('Después podrás convertirla en subcategoría.');

    await user.click(within(confirmation).getByRole('button', { name: 'Eliminar' }));

    expect(budgets.clear).toHaveBeenCalledWith(10);
    await vi.waitFor(() => expect(budgets.list.mock.calls.length).toBe(listCalls + 1));
    expect(budgets.list).toHaveBeenLastCalledWith('2026-10');
    expect(reports.budgetVsActual.mock.calls.length).toBe(reportCalls + 1);
    expect(toast.success).toHaveBeenCalledWith('Presupuesto de Alimentación eliminado');
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Historial de Alimentación' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('keeps the budget when the clear confirmation is cancelled', async () => {
    const { budgets, user } = await setup();
    const food = await row('Alimentación');

    await user.click(within(food).getByRole('button', { name: 'Historial de Alimentación' }));
    const sheet = await screen.findByRole('dialog', { name: 'Historial de Alimentación' });
    await within(sheet).findAllByTestId('budget-history-entry');
    await user.click(
      within(sheet).getByRole('button', { name: 'Eliminar presupuesto e historial' }),
    );
    await user.click(within(sheet).getByRole('button', { name: 'Cancelar' }));

    expect(budgets.clear).not.toHaveBeenCalled();
    expect(
      within(sheet).getByRole('button', { name: 'Eliminar presupuesto e historial' }),
    ).toBeInTheDocument();
  });

  it('reports a failed clear and keeps the history', async () => {
    const { budgets, toast, user } = await setup({
      clear: () => throwError(() => new Error('offline')),
    });
    const food = await row('Alimentación');
    const listCalls = budgets.list.mock.calls.length;

    await user.click(within(food).getByRole('button', { name: 'Historial de Alimentación' }));
    const sheet = await screen.findByRole('dialog', { name: 'Historial de Alimentación' });
    await within(sheet).findAllByTestId('budget-history-entry');
    await user.click(
      within(sheet).getByRole('button', { name: 'Eliminar presupuesto e historial' }),
    );
    await user.click(within(sheet).getByRole('button', { name: 'Eliminar' }));

    expect(toast.error).toHaveBeenCalledWith('No se pudo eliminar el presupuesto.');
    expect(within(sheet).getAllByTestId('budget-history-entry')).toHaveLength(3);
    expect(budgets.list.mock.calls.length).toBe(listCalls);
  });

  it('explains when a category has no history yet', async () => {
    const { budgets, user } = await setup();
    budgets.history.mockReturnValue(of([]));
    const leisure = await row('Ocio');

    await user.click(within(leisure).getByRole('button', { name: 'Historial de Ocio' }));

    const sheet = await screen.findByRole('dialog', { name: 'Historial de Ocio' });
    expect(
      await within(sheet).findByText('Aún no has definido un presupuesto para esta categoría.'),
    ).toBeInTheDocument();
  });

  it('shows an error when the budgets cannot be loaded', async () => {
    const { budgets, harness } = await setup();
    budgets.list.mockReturnValue(throwError(() => new Error('offline')));

    await harness.navigateByUrl('/mas/presupuestos?period=2026-09', BudgetsPage);
    harness.detectChanges();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar los presupuestos.',
    );
  });
  it('flags budgets near or over their limit with an icon and a label, not only colour', async () => {
    await setup();

    const food = await row('Alimentación');
    expect(food).toHaveAttribute('data-status', 'over');
    expect(within(within(food).getByTestId('budget-actual')).getByText('Superado')).toBeVisible();
    const housing = await row('Vivienda');
    expect(housing).toHaveAttribute('data-status', 'warning');
    expect(within(housing).getByText('Cerca del límite')).toBeInTheDocument();

    const attention = screen.getByTestId('budget-attention');
    expect(plain(attention.textContent)).toContain('Superado en 1 categoría');
    expect(plain(attention.textContent)).toContain('Cerca del límite en 1 categoría');
  });

  it('shows a skeleton until the budgets arrive', async () => {
    await setup({ list: () => NEVER });

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando presupuestos');
    expect(screen.queryAllByTestId('budget-category')).toHaveLength(0);
  });

  it('retries loading the budgets after a failure', async () => {
    const { budgets, harness, user } = await setup();
    budgets.list.mockReturnValue(throwError(() => new Error('offline')));
    await harness.navigateByUrl('/mas/presupuestos?period=2026-09', BudgetsPage);
    harness.detectChanges();
    await screen.findByRole('alert');

    budgets.list.mockReturnValue(of(aBudgetList()));
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    harness.detectChanges();

    expect(await row('Alimentación')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries the budget history when it cannot be loaded', async () => {
    const { budgets, user } = await setup();
    budgets.history.mockReturnValue(throwError(() => new Error('offline')));
    const food = await row('Alimentación');

    await user.click(within(food).getByRole('button', { name: 'Historial de Alimentación' }));
    const sheet = await screen.findByRole('dialog', { name: 'Historial de Alimentación' });
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'No se pudo cargar el historial.',
    );

    budgets.history.mockReturnValue(of(aBudgetHistory()));
    await user.click(within(sheet).getByRole('button', { name: 'Reintentar' }));

    expect(await within(sheet).findAllByTestId('budget-history-entry')).toHaveLength(3);
  });
});
