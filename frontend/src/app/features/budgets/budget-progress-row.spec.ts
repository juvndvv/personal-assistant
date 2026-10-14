import { render, screen } from '@testing-library/angular';
import { aCategory } from '../categories/testing/category-fixtures';
import { LedgerReferenceData } from '../transactions/reference-data';
import { referenceDataProviders } from '../transactions/testing/reference-fakes';
import { BudgetStatus } from '../../core/api/models';
import { formatCents } from '../../core/money/format-cents';
import { BudgetProgressRow } from './budget-progress-row';
import { aBudgetItem } from './testing/budget-fixtures';

const plain = (text: string) => text.replace(/\s+/g, ' ');

async function renderRow(usedBp: number, status: BudgetStatus, actual: number) {
  const view = await render(BudgetProgressRow, {
    providers: referenceDataProviders([
      aCategory({ id: 10, name: 'Alimentación', color: '#C4520A' }),
    ]),
    inputs: {
      item: aBudgetItem({
        budget_cents: 10000,
        actual_cents: actual,
        remaining_cents: 10000 - actual,
        used_bp: usedBp,
        status,
      }),
    },
  });
  await view.fixture.debugElement.injector.get(LedgerReferenceData).ensureLoaded();
  view.fixture.detectChanges();
  return screen.getByRole('progressbar', { name: 'Presupuesto de Alimentación' });
}

describe('BudgetProgressRow', () => {
  it.each([
    { usedBp: 0, status: 'ok', actual: 0, fill: 'var(--viz-status-good)', label: 'En presupuesto' },
    {
      usedBp: 7999,
      status: 'ok',
      actual: 7999,
      fill: 'var(--viz-status-good)',
      label: 'En presupuesto',
    },
    {
      usedBp: 8000,
      status: 'warning',
      actual: 8000,
      fill: 'var(--viz-status-warning)',
      label: 'Cerca del límite',
    },
    {
      usedBp: 10000,
      status: 'warning',
      actual: 10000,
      fill: 'var(--viz-status-warning)',
      label: 'Cerca del límite',
    },
    {
      usedBp: 10001,
      status: 'over',
      actual: 10001,
      fill: 'var(--viz-status-critical)',
      label: 'Superado',
    },
  ] as const)(
    'colours $usedBp basis points as $status',
    async ({ usedBp, status, actual, fill, label }) => {
      const bar = await renderRow(usedBp, status, actual);

      expect(screen.getByTestId('progress-fill').style.background).toBe(fill);
      expect(screen.getByTestId('budget-status')).toHaveTextContent(label);
      expect(bar).toHaveAttribute('aria-valuenow', String(Math.min(usedBp, 10000)));
      expect(bar).toHaveAttribute('aria-valuemax', '10000');
    },
  );

  it('tints the category icon with its palette colour', async () => {
    await renderRow(4000, 'ok', 4000);

    expect(
      screen.getByTestId('budget-row').querySelector('app-category-icon')?.getAttribute('style'),
    ).toContain('--category-color: var(--category-orange)');
  });

  it('shows spent against budget and what is left', async () => {
    await renderRow(9100, 'warning', 9100);

    expect(screen.getByTestId('budget-row')).toHaveTextContent('Alimentación');
    expect(plain(screen.getByTestId('budget-spent').textContent ?? '')).toContain(
      plain(`${formatCents(9100)} de ${formatCents(10000)}`),
    );
    expect(screen.getByTestId('budget-usage')).toHaveTextContent('91 %');
    expect(plain(screen.getByTestId('budget-remaining').textContent ?? '')).toContain(
      plain(`Quedan ${formatCents(900)}`),
    );
  });

  it('caps the bar when the budget is exceeded but keeps the real usage in the text', async () => {
    const bar = await renderRow(15000, 'over', 15000);

    expect(screen.getByTestId('progress-fill').style.width).toBe('100%');
    expect(plain(bar.getAttribute('aria-valuetext') ?? '')).toBe('150 % usado');
    expect(bar).toHaveAttribute('aria-valuenow', '10000');
    expect(plain(screen.getByTestId('budget-remaining').textContent ?? '')).toContain(
      plain(`Te has pasado ${formatCents(5000)}`),
    );
  });
});
