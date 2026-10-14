import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { aPeriod } from '../testing/report-fixtures';
import { PeriodSwitcher } from './period-switcher';

async function setup(inputs: Record<string, unknown>) {
  const previous = vi.fn();
  const next = vi.fn();
  const current = vi.fn();
  await render(PeriodSwitcher, { inputs, on: { previous, next, current } });
  return { previous, next, current, user: userEvent.setup() };
}

describe('PeriodSwitcher', () => {
  it('names the period and shows its date range from the server', async () => {
    await setup({
      label: '2026-10',
      period: aPeriod('2026-10'),
      canGoNext: false,
      isCurrent: true,
    });

    expect(screen.getByTestId('period-name')).toHaveTextContent('octubre de 2026');
    expect(screen.getByTestId('period-range')).toHaveTextContent('25 sept 2026 – 24 oct 2026');
    expect(screen.getByRole('button', { name: 'Periodo siguiente' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Ir al actual' })).not.toBeInTheDocument();
  });

  it('hides a stale range while the new period loads', async () => {
    await setup({ label: '2026-09', period: aPeriod('2026-10') });

    expect(screen.getByTestId('period-name')).toHaveTextContent('septiembre de 2026');
    expect(screen.getByTestId('period-range')).not.toHaveTextContent('2026');
  });

  it('emits previous, next and back to current', async () => {
    const { previous, next, current, user } = await setup({
      label: '2026-08',
      period: aPeriod('2026-08', { start: '2026-08-01', end: '2026-08-31', month_start_day: 1 }),
      canGoNext: true,
      isCurrent: false,
    });

    expect(screen.getByTestId('period-range')).toHaveTextContent('1 ago 2026 – 31 ago 2026');
    await user.click(screen.getByRole('button', { name: 'Periodo anterior' }));
    await user.click(screen.getByRole('button', { name: 'Periodo siguiente' }));
    await user.click(screen.getByRole('button', { name: 'Ir al actual' }));
    expect(previous).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(current).toHaveBeenCalledTimes(1);
  });
  it('shows a skeleton until the period is known', async () => {
    await setup({ label: null });

    const name = screen.getByTestId('period-name');
    expect(name).toHaveTextContent('Cargando periodo');
    expect(name.querySelector('ui-skeleton')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Periodo anterior' })).toBeDisabled();
  });
});
