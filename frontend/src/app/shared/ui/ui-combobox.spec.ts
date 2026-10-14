import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { UiCombobox } from './ui-combobox';

describe('UiCombobox', () => {
  const options = [
    { value: 'viaje', label: 'viaje' },
    { value: 'vacaciones', label: 'vacaciones' },
  ];

  it('opens its suggestions on an opaque menu surface that sheets cannot clear', async () => {
    await render(`<ui-combobox label="Etiquetas" [options]="options" />`, {
      imports: [UiCombobox],
      componentProperties: { options },
    });

    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Etiquetas' }));

    const listbox = screen.getByRole('listbox', { name: 'Etiquetas' });
    expect(listbox).toBeVisible();
    expect(listbox).toHaveClass('bg-menu');
    expect(listbox).not.toHaveClass('bg-popover');
  });

  it('uses secondary text for its placeholder', async () => {
    await render(`<ui-combobox label="Etiquetas" placeholder="Añade etiquetas" />`, {
      imports: [UiCombobox],
    });

    const input = screen.getByRole('combobox', { name: 'Etiquetas' });
    expect(input).toHaveAttribute('placeholder', 'Añade etiquetas');
    expect(input).toHaveClass('placeholder:text-muted-foreground');
  });

  it('switches an invalid field to the focus ring border when focused', async () => {
    await render(`<ui-combobox label="Etiquetas" state="error" />`, { imports: [UiCombobox] });

    const input = screen.getByRole('combobox', { name: 'Etiquetas' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveClass('focus-visible:border-ring', 'focus-visible:ring-destructive/50');
  });
});
