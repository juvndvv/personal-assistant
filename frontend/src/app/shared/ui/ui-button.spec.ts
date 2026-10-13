import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { UiButton } from './ui-button';

describe('UiButton', () => {
  it('emits clicks', async () => {
    const clicked = vi.fn();
    await render(`<ui-button (clicked)="clicked()">Guardar</ui-button>`, {
      imports: [UiButton],
      componentProperties: { clicked },
    });

    await userEvent.setup().click(screen.getByRole('button', { name: /guardar/i }));

    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('is disabled while loading', async () => {
    await render(`<ui-button [loading]="true">Guardar</ui-button>`, { imports: [UiButton] });

    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
  });

  it('submits its form', async () => {
    const submitted = vi.fn((event: Event) => event.preventDefault());
    await render(
      `<form (submit)="submitted($event)"><ui-button type="submit">Entrar</ui-button></form>`,
      { imports: [UiButton], componentProperties: { submitted } },
    );

    await userEvent.setup().click(screen.getByRole('button', { name: /entrar/i }));

    expect(submitted).toHaveBeenCalledTimes(1);
  });
});
