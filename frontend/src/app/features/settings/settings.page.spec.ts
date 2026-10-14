import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { Period, Settings } from '../../core/api/models';
import { PeriodsApi } from '../../core/api/periods.api';
import { SettingsApi } from '../../core/api/settings.api';
import { UiToast } from '../../shared/ui';
import { anAccount } from '../accounts/testing/account-fixtures';
import { SettingsPage } from './settings.page';

const calendarOctober: Period = {
  label: '2026-10',
  start: '2026-10-01',
  end: '2026-10-31',
  month_start_day: 1,
};
const paydayOctober: Period = {
  label: '2026-10',
  start: '2026-09-25',
  end: '2026-10-24',
  month_start_day: 25,
};
const settings: Settings = {
  month_start_day: 1,
  default_account_id: null,
  last_used_account_id: null,
  orphan_draft_ttl_days: 7,
  current_period: calendarOctober,
};

async function setup() {
  const settingsApi = {
    get: vi.fn(() => of(settings)),
    update: vi.fn((patch: Partial<Settings>) =>
      of({ ...settings, ...patch, current_period: paydayOctober }),
    ),
  };
  const periodsApi = {
    current: vi.fn((day?: number) => of(day === 25 ? paydayOctober : calendarOctober)),
  };
  const accountsApi = {
    list: vi.fn(() => of([anAccount({ id: 3, name: 'BBVA' }), anAccount({ id: 7, name: 'Visa' })])),
  };
  await render(SettingsPage, {
    providers: [
      provideRouter([]),
      { provide: SettingsApi, useValue: settingsApi },
      { provide: PeriodsApi, useValue: periodsApi },
      { provide: AccountsApi, useValue: accountsApi },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  await screen.findByLabelText(/día de inicio del mes/i);
  return { settingsApi, periodsApi, user: userEvent.setup() };
}

describe('SettingsPage', () => {
  it('shows the current period from the settings', async () => {
    await setup();

    const preview = screen.getByTestId('period-preview');
    expect(preview).toHaveTextContent('Periodo actual: octubre de 2026');
    expect(preview).toHaveTextContent('Del 1 oct 2026 al 31 oct 2026');
  });

  it('previews the period for another start day without saving', async () => {
    const { settingsApi, periodsApi, user } = await setup();

    await user.selectOptions(screen.getByLabelText(/día de inicio del mes/i), '25');

    expect(periodsApi.current).toHaveBeenCalledWith(25);
    expect(await screen.findByText('Del 25 sept 2026 al 24 oct 2026')).toBeInTheDocument();
    expect(settingsApi.update).not.toHaveBeenCalled();
  });

  it('offers start days 1 to 28 only', async () => {
    await setup();

    const options = Array.from(
      (screen.getByLabelText(/día de inicio del mes/i) as HTMLSelectElement).options,
    ).map((option) => option.value);

    expect(options).toEqual(Array.from({ length: 28 }, (_, index) => String(index + 1)));
  });

  it('saves start day, default account and draft TTL', async () => {
    const { settingsApi, user } = await setup();

    await user.selectOptions(screen.getByLabelText(/día de inicio del mes/i), '25');
    await user.selectOptions(screen.getByLabelText(/cuenta por defecto/i), '3');
    const ttl = screen.getByLabelText(/borradores/i);
    await user.clear(ttl);
    await user.type(ttl, '14');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(settingsApi.update).toHaveBeenCalledWith({
      month_start_day: 25,
      default_account_id: 3,
      orphan_draft_ttl_days: 14,
    });
  });

  it('rejects a TTL outside 1..90', async () => {
    const { settingsApi, user } = await setup();

    const ttl = screen.getByLabelText(/borradores/i);
    await user.clear(ttl);
    await user.type(ttl, '120');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(settingsApi.update).not.toHaveBeenCalled();
    expect(screen.getByText('Indica un número de días entre 1 y 90.')).toBeInTheDocument();
  });
});

describe('SettingsPage appearance', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-transparency');
  });

  it('switches the theme and reduced transparency', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('radio', { name: 'Oscuro' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await user.click(screen.getByRole('switch', { name: /reducir transparencia/i }));
    expect(document.documentElement.getAttribute('data-transparency')).toBe('reduced');
  });
});
