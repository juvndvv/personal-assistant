import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { formatCents } from '../../core/money/format-cents';
import { BarChart } from './bar-chart';
import { formatBasisPoints, shortPeriodLabel } from './chart-format';
import { foldSegments } from './chart-geometry';
import { ChartCategory, ChartSeries } from './chart-types';
import { DonutChart } from './donut-chart';
import { LineChart } from './line-chart';
import { ProgressBar } from './progress-bar';
import { StatTile } from './stat-tile';

const plain = (text: string) => text.replace(/\s+/g, ' ');

const categories: ChartCategory[] = ['2026-08', '2026-09', '2026-10'].map((label) => ({
  key: label,
  label: shortPeriodLabel(label),
  description: `Periodo ${label}`,
}));

const incomeExpense: ChartSeries[] = [
  { key: 'income', label: 'Ingresos', slot: 1, values: [200000, 0, 210000] },
  { key: 'expense', label: 'Gastos', slot: 2, values: [150000, 90000, 157500] },
];

describe('BarChart', () => {
  async function renderBars(extra: Record<string, unknown> = {}) {
    const selected = vi.fn();
    const view = await render(BarChart, {
      inputs: {
        categories,
        series: incomeExpense,
        ariaLabel: 'Ingresos y gastos',
        ...extra,
      },
      on: { selectCategory: selected },
    });
    return { view, selected, user: userEvent.setup() };
  }

  it('draws one column per non-zero value with a legend for two series', async () => {
    await renderBars();

    expect(screen.getByRole('group', { name: 'Ingresos y gastos' })).toBeInTheDocument();
    expect(screen.getAllByTestId('bar')).toHaveLength(5);
    const legend = screen.getByRole('list', { name: 'Leyenda' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['Ingresos', 'Gastos']);
    expect(screen.getByText('oct 26')).toBeInTheDocument();
  });

  it('describes every period for assistive technology and in the data table', async () => {
    await renderBars();

    expect(
      screen.getByRole('img', {
        name: `Periodo 2026-10: Ingresos ${formatCents(210000)}, Gastos ${formatCents(157500)}`,
      }),
    ).toBeInTheDocument();
    const table = screen.getByRole('table', { hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(4);
    expect(rows[3]).toHaveTextContent(
      plain(`Periodo 2026-10 ${formatCents(210000)} ${formatCents(157500)}`),
    );
  });

  it('shows a tooltip with every series on hover', async () => {
    const { user } = await renderBars();

    await user.hover(screen.getByRole('img', { name: /Periodo 2026-09/ }));

    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('Periodo 2026-09');
    expect(tooltip).toHaveTextContent(plain(`${formatCents(0)}Ingresos`));
    expect(tooltip).toHaveTextContent(plain(`${formatCents(90000)}Gastos`));
  });

  it('lets the reader pick a period when selectable and marks the selected one', async () => {
    const { selected, user } = await renderBars({ selectable: true, selectedKey: '2026-10' });

    const current = screen.getByRole('button', { name: /Periodo 2026-10/ });
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('selected-band')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Periodo 2026-08/ }));
    expect(selected).toHaveBeenCalledWith('2026-08');
  });

  it('draws an overlay line on the same axis', async () => {
    await renderBars({
      overlay: { key: 'category', label: 'Alimentación', slot: 3, values: [40000, 42000, 39000] },
    });

    expect(screen.getByTestId('overlay-line').getAttribute('d')).toMatch(/^M[\d.]+,[\d.]+ L/);
    expect(screen.getByRole('list', { name: 'Leyenda' })).toHaveTextContent('Alimentación');
  });
});

describe('LineChart', () => {
  it('breaks the line where values are missing and labels only the end value', async () => {
    await render(LineChart, {
      inputs: {
        categories,
        series: [{ key: 'rate', label: 'Tasa de ahorro', slot: 1, values: [2500, null, -1250] }],
        ariaLabel: 'Tasa de ahorro',
        valueFormatter: formatBasisPoints,
      },
    });

    const path = screen.getByTestId('line').getAttribute('d') ?? '';
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path).not.toContain('L');
    expect(screen.getByTestId('end-label')).toHaveTextContent('-12,5 %');
    expect(screen.queryByRole('list', { name: 'Leyenda' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Periodo 2026-09: Tasa de ahorro —' }),
    ).toBeInTheDocument();
  });

  it('shows a crosshair and tooltip on focus', async () => {
    await render(LineChart, {
      inputs: {
        categories,
        series: [{ key: 'rate', label: 'Tasa de ahorro', slot: 1, values: [2500, 1000, 500] }],
        ariaLabel: 'Tasa de ahorro',
        valueFormatter: formatBasisPoints,
      },
    });

    screen.getByRole('img', { name: /Periodo 2026-08/ }).dispatchEvent(new FocusEvent('focus'));
    expect(await screen.findByTestId('crosshair')).toBeInTheDocument();
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('25 %');
  });
});

describe('DonutChart', () => {
  it('draws the folded segments with values and shares in the legend', async () => {
    const segments = foldSegments(
      [
        { key: '20', label: 'Vivienda', value: 91000 },
        { key: '10', label: 'Alimentación', value: 42000 },
        { key: '30', label: 'Ocio', value: 24500 },
      ],
      6,
      'Otras',
    );
    await render(DonutChart, {
      inputs: { segments, ariaLabel: 'Gastos por categoría', totalLabel: 'Gastos' },
    });

    expect(screen.getAllByTestId('donut-arc')).toHaveLength(3);
    const rows = screen.getAllByTestId('donut-legend-row');
    expect(rows[0]).toHaveTextContent(plain(`Vivienda${formatCents(91000)}57,8 %`));
    expect(rows[2]).toHaveTextContent('Ocio');
    expect(screen.getByText(plain(formatCents(157500)))).toBeInTheDocument();
  });

  it('draws a single segment as a full ring', async () => {
    await render(DonutChart, {
      inputs: {
        segments: [{ key: '1', label: 'Nómina', value: 210000, slot: 1 }],
        ariaLabel: 'Ingresos por categoría',
      },
    });

    expect(screen.getByTestId('donut-arc').getAttribute('d')).toContain(' 1 1 ');
  });

  it('prefers a segment colour over its series slot', async () => {
    await render(DonutChart, {
      inputs: {
        segments: [
          { key: '1', label: 'Nómina', value: 150000, slot: 1, color: 'var(--category-green)' },
          { key: '2', label: 'Extras', value: 60000, slot: 2 },
        ],
        ariaLabel: 'Ingresos por categoría',
      },
    });

    const arcs = screen.getAllByTestId('donut-arc');
    expect(arcs[0].style.fill).toBe('var(--category-green)');
    expect(arcs[1].style.fill).toBe('var(--viz-series-2)');
  });
});

describe('StatTile and ProgressBar', () => {
  it('renders a stat with a status icon and label', async () => {
    await render(StatTile, {
      inputs: {
        label: 'Tasa de ahorro',
        value: '25 %',
        tone: 'positive',
        status: 'good',
        statusLabel: 'Objetivo cumplido',
      },
    });

    expect(screen.getByTestId('stat-value')).toHaveTextContent('25 %');
    expect(screen.getByTestId('stat-value')).toHaveClass('text-success-text');
    expect(screen.getByTestId('stat-status')).toHaveTextContent('Objetivo cumplido');
  });

  it('uses tabular amounts, a tinted surface by default and a card surface on request', async () => {
    const { rerender } = await render(StatTile, {
      inputs: { label: 'Gastos', value: '1.575,00 €', tone: 'negative' },
    });

    const value = screen.getByTestId('stat-value');
    expect(value).toHaveClass('amount', 'text-danger-text');
    expect(value.parentElement).toHaveClass('bg-fill-on-card');

    await rerender({ inputs: { label: 'Gastos', value: '1.575,00 €', variant: 'card' } });

    expect(screen.getByTestId('stat-value').parentElement).toHaveClass('bg-card', 'shadow-card');
  });

  it('exposes the progress value and clamps the fill', async () => {
    await render(ProgressBar, {
      inputs: { value: 12500, label: 'Uso', valueText: '125 %', tone: 'over' },
    });

    const bar = screen.getByRole('progressbar', { name: 'Uso' });
    expect(bar).toHaveAttribute('aria-valuenow', '12500');
    expect(bar).toHaveAttribute('aria-valuetext', '125 %');
    expect(screen.getByTestId('progress-fill').style.width).toBe('100%');
  });
});
