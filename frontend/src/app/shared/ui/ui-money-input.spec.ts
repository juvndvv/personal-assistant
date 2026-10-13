import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { UiMoneyInput } from './ui-money-input';

describe('UiMoneyInput', () => {
  async function setup(initial: number | null) {
    const cents = signal<number | null>(initial);
    await render(
      `<ui-money-input label="Importe" [(value)]="cents" /><output>{{ cents() }}</output>`,
      { imports: [UiMoneyInput], componentProperties: { cents } },
    );
    return { cents, input: screen.getByLabelText(/importe/i), user: userEvent.setup() };
  }

  it('uses a decimal keyboard', async () => {
    const { input } = await setup(null);
    expect(input).toHaveAttribute('inputmode', 'decimal');
  });

  it('shows the initial amount in Spanish format', async () => {
    const { input } = await setup(1250);
    expect(input).toHaveValue('12,50');
  });

  it('emits integer cents while typing', async () => {
    const { cents, input, user } = await setup(null);

    await user.type(input, '1.234,5');

    expect(cents()).toBe(123450);
    expect(input).toHaveValue('1.234,5');
  });

  it('flags unparseable amounts and emits null', async () => {
    const { cents, input, user } = await setup(null);

    await user.type(input, '12,345');

    expect(cents()).toBeNull();
    expect(screen.getByText(/introduce un importe válido/i)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('normalises the text when the field is committed', async () => {
    const { input, user } = await setup(null);

    await user.type(input, '12.5');
    await user.tab();

    expect(input).toHaveValue('12,50');
  });
});
