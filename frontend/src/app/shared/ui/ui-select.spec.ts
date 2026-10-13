import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { UiSelect, UiSelectOption } from './ui-select';

describe('UiSelect', () => {
  const options: UiSelectOption[] = [
    { value: '1', label: 'BBVA' },
    { value: '2', label: 'Efectivo' },
  ];

  it('selects the bound value and emits changes', async () => {
    const choice = signal<string | null>('2');
    await render(
      `<ui-select label="Cuenta" placeholder="Elige" [options]="options" [(value)]="choice" />`,
      { imports: [UiSelect], componentProperties: { options, choice } },
    );
    const select = screen.getByLabelText(/cuenta/i);
    expect(select).toHaveValue('2');

    await userEvent.setup().selectOptions(select, '1');

    expect(choice()).toBe('1');
  });

  it('marks the error state as invalid with its hint', async () => {
    await render(
      `<ui-select label="Cuenta" state="error" hint="Elige una cuenta" [options]="options" />`,
      { imports: [UiSelect], componentProperties: { options } },
    );

    expect(screen.getByLabelText(/cuenta/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Elige una cuenta');
  });
});
