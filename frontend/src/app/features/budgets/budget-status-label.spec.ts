import { render, screen } from '@testing-library/angular';
import { BudgetStatus } from '../../core/api/models';
import { BudgetStatusLabel } from './budget-status-label';

describe('BudgetStatusLabel', () => {
  it.each<{ status: BudgetStatus; label: string; tint: string; icon: string }>([
    { status: 'ok', label: 'En presupuesto', tint: 'bg-tint-green', icon: 'text-success-text' },
    {
      status: 'warning',
      label: 'Cerca del límite',
      tint: 'bg-tint-orange',
      icon: 'text-warning-text',
    },
    { status: 'over', label: 'Superado', tint: 'bg-tint-red', icon: 'text-danger-text' },
  ])(
    'pairs the $status colour with an icon and a text label',
    async ({ status, label, tint, icon }) => {
      const { container } = await render(BudgetStatusLabel, { inputs: { status } });

      const pill = screen.getByText(label);
      expect(pill).toHaveAttribute('data-status', status);
      expect(pill).toHaveClass(tint, 'text-foreground');
      const glyph = container.querySelector('ng-icon');
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
      expect(glyph).toHaveClass(icon);
    },
  );
});
