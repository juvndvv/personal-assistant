import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { UiSwitch } from './ui-switch';

describe('UiSwitch', () => {
  it('toggles its model and is labelled by its content', async () => {
    const checked = signal(false);
    await render(
      `<ui-switch [(checked)]="checked" description="Superficies opacas">Reducir transparencia</ui-switch>`,
      { imports: [UiSwitch], componentProperties: { checked } },
    );

    const control = screen.getByRole('switch', { name: 'Reducir transparencia' });
    await userEvent.setup().click(control);

    expect(checked()).toBe(true);
    expect(control).toHaveAccessibleDescription('Superficies opacas');
  });
});
