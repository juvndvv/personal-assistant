import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { RecurringTemplate } from '../../core/api/models';
import { RecurringApi } from '../../core/api/recurring.api';
import { UiToast } from '../../shared/ui';
import { RecurringPage } from './recurring.page';
import { aRecurringTemplate } from './testing/recurring-fixtures';

async function setup(templates: RecurringTemplate[]) {
  const api = {
    list: vi.fn(() => of(templates)),
    pause: vi.fn((id: number) =>
      of(aRecurringTemplate({ id, paused_at: '2026-10-13T08:00:00+02:00' })),
    ),
    resume: vi.fn((id: number) => of(aRecurringTemplate({ id, paused_at: null }))),
    delete: vi.fn(() => of(undefined)),
  };
  await render(RecurringPage, {
    providers: [
      provideRouter([]),
      { provide: RecurringApi, useValue: api },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    ],
  });
  return { api, user: userEvent.setup() };
}

describe('RecurringPage', () => {
  it('lists templates with amount, next due date, variable and paused state', async () => {
    const { api } = await setup([
      aRecurringTemplate(),
      aRecurringTemplate({
        id: 5,
        name: 'Nómina',
        type: 'income',
        amount_cents: 210000,
        is_variable: false,
        next_due_date: '2026-10-28',
        day_of_month: 28,
      }),
      aRecurringTemplate({
        id: 6,
        name: 'Gimnasio',
        is_variable: false,
        paused_at: '2026-10-01T10:00:00+02:00',
        next_due_date: null,
      }),
    ]);

    const rows = await screen.findAllByTestId('recurring-row');
    expect(api.list).toHaveBeenCalledWith(true);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Luz');
    expect(rows[0]).toHaveTextContent('60,00 €');
    expect(rows[0]).toHaveTextContent('Variable');
    expect(rows[0]).toHaveTextContent('Próximo: 5 nov 2026');
    expect(rows[0]).toHaveTextContent('Mensual · día 5 · BBVA');
    expect(rows[1]).toHaveTextContent('+2.100,00 €');
    expect(rows[1]).not.toHaveTextContent('Variable');
    expect(rows[2]).toHaveTextContent('Pausado');
    expect(rows[2]).toHaveTextContent('Sin próximas fechas');
    expect(
      within(rows[0] as HTMLElement).getByRole('link', { name: 'Editar Luz' }),
    ).toHaveAttribute('href', '/mas/fijos/4');
  });

  it('pauses and resumes a template', async () => {
    const { api, user } = await setup([aRecurringTemplate()]);

    await user.click(await screen.findByRole('button', { name: 'Pausar Luz' }));

    expect(api.pause).toHaveBeenCalledWith(4);
    expect(await screen.findByText('Pausado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reanudar Luz' }));

    expect(api.resume).toHaveBeenCalledWith(4);
    await vi.waitFor(() => expect(screen.queryByText('Pausado')).not.toBeInTheDocument());
  });

  it('deletes a template only after confirmation', async () => {
    const { api, user } = await setup([aRecurringTemplate()]);

    await user.click(await screen.findByRole('button', { name: 'Eliminar Luz' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar fijo' });
    expect(dialog).toHaveTextContent('Los movimientos ya registrados se mantienen');
    expect(api.delete).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(api.delete).toHaveBeenCalledWith(4);
    await vi.waitFor(() => expect(screen.queryAllByTestId('recurring-row')).toHaveLength(0));
  });

  it('invites to create the first template when there are none', async () => {
    await setup([]);

    expect(await screen.findByText('Aún no tienes fijos')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Nuevo fijo' })[0]).toHaveAttribute(
      'href',
      '/mas/fijos/nuevo',
    );
  });
});
