import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { UiSegmented } from './ui-segmented';

describe('UiSegmented', () => {
  async function setup() {
    const value = signal('system');
    const options = [
      { value: 'light', label: 'Claro' },
      { value: 'dark', label: 'Oscuro' },
      { value: 'system', label: 'Sistema' },
    ];
    await render(`<ui-segmented ariaLabel="Tema" [options]="options" [(value)]="value" />`, {
      imports: [UiSegmented],
      componentProperties: { value, options },
    });
    return { value, user: userEvent.setup() };
  }

  it('checks the selected option and positions the indicator on it', async () => {
    await setup();

    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'true');
    const group = screen.getByRole('radiogroup', { name: 'Tema' });
    expect(group.style.getPropertyValue('--segment-index')).toBe('2');
    expect(group.style.getPropertyValue('--segment-count')).toBe('3');
    expect(screen.getByTestId('segmented-indicator')).toBeInTheDocument();
  });

  it('selects with click and arrow keys and moves the indicator', async () => {
    const { value, user } = await setup();

    await user.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(value()).toBe('light');
    expect(screen.getByRole('radiogroup').style.getPropertyValue('--segment-index')).toBe('0');

    await user.keyboard('{ArrowRight}');
    expect(value()).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toHaveFocus();
  });
});
