import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Subject, of, throwError } from 'rxjs';
import { RecurringForecast } from '../../core/api/models';
import { RecurringApi } from '../../core/api/recurring.api';
import { MovementSheets } from '../transactions/movement-sheets';
import { ForecastCard } from './forecast-card';
import { aForecast, aForecastItem } from './testing/recurring-fixtures';

async function setup(forecast: () => ReturnType<RecurringApi['forecast']>) {
  const api = { forecast: vi.fn(forecast) };
  const view = await render(ForecastCard, {
    providers: [provideRouter([]), { provide: RecurringApi, useValue: api }],
  });
  return { api, view };
}

const octoberForecast = (): RecurringForecast =>
  aForecast({
    items: [
      aForecastItem({
        template_name: 'Alquiler',
        is_variable: false,
        status: 'posted',
        due_date: '2026-10-01',
        amount_cents: 85000,
        draft_id: null,
        transaction_id: 300,
      }),
      aForecastItem(),
      aForecastItem({
        template_id: 7,
        template_name: 'Gimnasio',
        is_variable: false,
        status: 'upcoming',
        due_date: '2026-10-20',
        amount_cents: 3500,
        draft_id: null,
      }),
      aForecastItem({
        template_id: 8,
        template_name: 'Seguro',
        is_variable: false,
        status: 'skipped',
        due_date: '2026-10-10',
        amount_cents: 2000,
        draft_id: null,
      }),
    ],
    pending_expense_cents: 9500,
    pending_income_cents: 0,
    posted_expense_cents: 85000,
    posted_income_cents: 210000,
  });

describe('ForecastCard', () => {
  it('lists the pending recurring items of the current period with their totals', async () => {
    const { api } = await setup(() => of(octoberForecast()));

    const card = await screen.findByRole('region', { name: 'Fijos pendientes este periodo' });
    expect(api.forecast).toHaveBeenCalledWith();
    expect(card).toHaveTextContent('25 sept 2026 – 24 oct 2026');
    const items = within(card).getAllByTestId('forecast-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Luz');
    expect(items[0]).toHaveTextContent('5 oct 2026');
    expect(items[0]).toHaveTextContent('Falta el importe');
    expect(within(items[0] as HTMLElement).getByRole('link')).toHaveAttribute(
      'href',
      '/pendientes',
    );
    expect(items[1]).toHaveTextContent('Gimnasio');
    expect(items[1]).toHaveTextContent('Próximo');
    expect(items[1]).toHaveTextContent('35,00 €');
    expect(within(card).getByTestId('pending-expense')).toHaveTextContent('95,00 €');
    expect(within(card).getByTestId('pending-income')).toHaveTextContent('0,00 €');
    expect(within(card).getByTestId('posted-totals')).toHaveTextContent(
      'Ya registrados: 850,00 € en gastos y 2.100,00 € en ingresos',
    );
    expect(card).not.toHaveTextContent('Alquiler');
    expect(card).not.toHaveTextContent('Seguro');
  });

  it('says when nothing is left for the period', async () => {
    await setup(() =>
      of(
        aForecast({
          items: [aForecastItem({ status: 'posted', draft_id: null, transaction_id: 300 })],
          pending_expense_cents: 0,
        }),
      ),
    );

    expect(
      await screen.findByText('No quedan fijos pendientes en este periodo.'),
    ).toBeInTheDocument();
  });

  it('invites to set up recurring items when there are none', async () => {
    await setup(() =>
      of(
        aForecast({
          items: [],
          pending_expense_cents: 0,
          posted_expense_cents: 0,
          posted_income_cents: 0,
        }),
      ),
    );

    expect(await screen.findByRole('link', { name: 'Configurar fijos' })).toHaveAttribute(
      'href',
      '/mas/fijos',
    );
  });

  it('offers a retry when the forecast cannot be loaded', async () => {
    const { api, view } = await setup(() => throwError(() => new Error('offline')));
    const user = userEvent.setup();

    const card = await screen.findByRole('region', { name: 'Fijos pendientes este periodo' });
    expect(await within(card).findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar los fijos pendientes.',
    );
    expect(within(card).queryAllByTestId('forecast-item')).toHaveLength(0);

    api.forecast.mockReturnValue(of(octoberForecast()));
    await user.click(within(card).getByRole('button', { name: 'Reintentar' }));
    view.detectChanges();

    expect(await screen.findAllByTestId('forecast-item')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.forecast).toHaveBeenCalledTimes(2);
  });

  it('reloads when a movement changes elsewhere', async () => {
    const responses = [
      octoberForecast(),
      aForecast({
        items: [
          aForecastItem({
            status: 'posted',
            amount_cents: 6437,
            draft_id: null,
            transaction_id: 301,
          }),
        ],
        pending_expense_cents: 0,
        pending_income_cents: 0,
        posted_expense_cents: 6437,
        posted_income_cents: 0,
      }),
    ];
    const { api, view } = await setup(() => of(responses.shift()!));
    const card = await screen.findByRole('region', { name: 'Fijos pendientes este periodo' });
    expect(within(card).getAllByTestId('forecast-item')).toHaveLength(2);

    TestBed.inject(MovementSheets).notifyChanged();
    view.detectChanges();

    await vi.waitFor(() => expect(api.forecast).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(screen.getByText('No quedan fijos pendientes en este periodo.')).toBeInTheDocument(),
    );
    expect(screen.queryAllByTestId('forecast-item')).toHaveLength(0);
    expect(screen.getByTestId('posted-totals')).toHaveTextContent(
      'Ya registrados: 64,37 € en gastos y 0,00 € en ingresos',
    );
  });

  it('shows a skeleton until the forecast arrives', async () => {
    const pending = new Subject<RecurringForecast>();
    await setup(() => pending);

    expect(screen.getByTestId('forecast-loading')).toBeInTheDocument();

    pending.next(octoberForecast());
    pending.complete();

    expect(await screen.findByTestId('recurring-forecast')).toBeInTheDocument();
    expect(screen.queryByTestId('forecast-loading')).not.toBeInTheDocument();
  });
});
