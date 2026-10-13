import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { UiTabs } from './ui-tabs';

describe('UiTabs', () => {
  async function setup() {
    const active = signal('expense');
    const tabs = [
      { id: 'expense', label: 'Gastos' },
      { id: 'income', label: 'Ingresos' },
    ];
    await render(`<ui-tabs ariaLabel="Tipo" [tabs]="tabs" [(active)]="active" />`, {
      imports: [UiTabs],
      componentProperties: { active, tabs },
    });
    return { active, user: userEvent.setup() };
  }

  it('marks the active tab as selected', async () => {
    await setup();
    expect(screen.getByRole('tab', { name: 'Gastos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Ingresos' })).toHaveAttribute('aria-selected', 'false');
  });

  it('switches on click and with arrow keys', async () => {
    const { active, user } = await setup();

    await user.click(screen.getByRole('tab', { name: 'Ingresos' }));
    expect(active()).toBe('income');

    await user.keyboard('{ArrowRight}');
    expect(active()).toBe('expense');
    expect(screen.getByRole('tab', { name: 'Gastos' })).toHaveFocus();
  });
});
