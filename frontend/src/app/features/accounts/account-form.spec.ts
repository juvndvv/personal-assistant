import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Account, AccountInput } from '../../core/api/models';
import { todayInMadrid } from '../../core/date/iso-date';
import { AccountForm, AccountFormErrors } from './account-form';
import { anAccount } from './testing/account-fixtures';

interface SetupOptions {
  account?: Account | null;
  candidates?: Account[];
  serverErrors?: AccountFormErrors;
}

async function setup(options: SetupOptions = {}) {
  const submitted = vi.fn<(input: AccountInput) => void>();
  await render(AccountForm, {
    inputs: {
      account: options.account ?? null,
      settlementCandidates: options.candidates ?? [],
      serverErrors: options.serverErrors ?? {},
    },
    on: { submitted },
  });
  return { submitted, user: userEvent.setup() };
}

const nameInput = () => screen.getByLabelText(/nombre/i);
const typeSelect = () => screen.getByLabelText(/tipo/i);
const balanceInput = () => screen.getByLabelText(/^saldo inicial/i);
const openingDateInput = () => screen.getByLabelText(/fecha del saldo inicial/i);
const submitButton = () => screen.getByRole('button', { name: /crear cuenta|guardar cambios/i });

describe('AccountForm', () => {
  it('hides the card-only fields unless the type is credit card', async () => {
    const { user } = await setup();

    expect(screen.queryByLabelText(/día de corte/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/cuenta de pago/i)).not.toBeInTheDocument();

    await user.selectOptions(typeSelect(), 'credit_card');

    expect(screen.getByLabelText(/día de corte/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cuenta de pago/i)).toBeInTheDocument();

    await user.selectOptions(typeSelect(), 'cash');

    expect(screen.queryByLabelText(/día de corte/i)).not.toBeInTheDocument();
  });

  it('offers statement days 1 to 28', async () => {
    const { user } = await setup();
    await user.selectOptions(typeSelect(), 'credit_card');

    const days = Array.from(
      (screen.getByLabelText(/día de corte/i) as HTMLSelectElement).options,
    ).filter((option) => option.value !== '');

    expect(days.map((option) => option.value)).toEqual(
      Array.from({ length: 28 }, (_, index) => String(index + 1)),
    );
  });

  it('offers only active non-card accounts as settlement account', async () => {
    const { user } = await setup({
      candidates: [
        anAccount({ id: 3, name: 'BBVA', type: 'checking' }),
        anAccount({ id: 4, name: 'Otra Visa', type: 'credit_card' }),
        anAccount({ id: 5, name: 'Vieja', type: 'checking', archived_at: '2026-01-01T00:00:00Z' }),
        anAccount({ id: 6, name: 'Hucha', type: 'cash' }),
      ],
    });
    await user.selectOptions(typeSelect(), 'credit_card');

    const labels = Array.from(
      (screen.getByLabelText(/cuenta de pago/i) as HTMLSelectElement).options,
    ).map((option) => option.textContent?.trim());

    expect(labels).toEqual(['Sin cuenta de pago', 'BBVA', 'Hucha']);
  });

  it('submits a credit card with a negative opening balance and card fields', async () => {
    const { submitted, user } = await setup({
      candidates: [anAccount({ id: 3, name: 'BBVA', type: 'checking' })],
    });

    await user.type(nameInput(), 'Visa');
    await user.selectOptions(typeSelect(), 'credit_card');
    await user.clear(balanceInput());
    await user.type(balanceInput(), '-120');
    await user.selectOptions(screen.getByLabelText(/día de corte/i), '5');
    await user.selectOptions(screen.getByLabelText(/cuenta de pago/i), '3');
    await user.click(submitButton());

    expect(submitted).toHaveBeenCalledWith({
      name: 'Visa',
      type: 'credit_card',
      opening_balance_cents: -12000,
      opening_date: todayInMadrid(),
      statement_day: 5,
      settlement_account_id: 3,
    });
  });

  it('omits card fields for other types', async () => {
    const { submitted, user } = await setup();

    await user.type(nameInput(), 'Cartera');
    await user.selectOptions(typeSelect(), 'cash');
    await user.clear(balanceInput());
    await user.type(balanceInput(), '50');
    await user.click(submitButton());

    expect(submitted).toHaveBeenCalledWith({
      name: 'Cartera',
      type: 'cash',
      opening_balance_cents: 5000,
      opening_date: todayInMadrid(),
    });
  });

  it('submits a checking account with a negative opening balance', async () => {
    const { submitted, user } = await setup();

    await user.type(nameInput(), 'BBVA');
    await user.clear(balanceInput());
    await user.type(balanceInput(), '-35');
    await user.click(submitButton());

    expect(submitted).toHaveBeenCalledWith({
      name: 'BBVA',
      type: 'checking',
      opening_balance_cents: -3500,
      opening_date: todayInMadrid(),
    });
    expect(balanceInput()).not.toHaveAttribute('aria-invalid');
  });

  it('saves an existing non-card account whose opening balance is negative', async () => {
    const { submitted, user } = await setup({
      account: anAccount({ name: 'BBVA', type: 'checking', opening_balance_cents: -3500 }),
    });

    await user.click(submitButton());

    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'checking', opening_balance_cents: -3500 }),
    );
  });

  describe('opening date on 2026-10-13 in Madrid', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-13T10:00:00+02:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects a future opening date', async () => {
      const { submitted, user } = await setup();

      await user.type(nameInput(), 'BBVA');
      fireEvent.input(openingDateInput(), { target: { value: '2026-10-14' } });
      await user.click(submitButton());

      expect(submitted).not.toHaveBeenCalled();
      expect(openingDateInput()).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('La fecha no puede ser futura.')).toBeInTheDocument();
    });

    it('accepts today as opening date', async () => {
      const { submitted, user } = await setup();

      await user.type(nameInput(), 'BBVA');
      fireEvent.input(openingDateInput(), { target: { value: '2026-10-13' } });
      await user.click(submitButton());

      expect(submitted).toHaveBeenCalledWith(
        expect.objectContaining({ opening_date: '2026-10-13' }),
      );
      expect(openingDateInput()).toHaveAttribute('max', '2026-10-13');
    });
  });

  it('requires a name and an opening balance', async () => {
    const { submitted, user } = await setup();

    await user.clear(balanceInput());
    await user.click(submitButton());

    expect(submitted).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe un nombre para la cuenta.')).toBeInTheDocument();
    expect(screen.getByText('Indica el saldo inicial (puede ser 0).')).toBeInTheDocument();
  });

  it('prefills an existing account and shows server errors', async () => {
    await setup({
      account: anAccount({
        name: 'Visa',
        type: 'credit_card',
        opening_balance_cents: -12000,
        statement_day: 5,
      }),
      serverErrors: { name: 'Ya existe una cuenta con ese nombre.' },
    });

    expect(nameInput()).toHaveValue('Visa');
    expect(balanceInput()).toHaveValue('-120,00');
    expect(screen.getByLabelText(/día de corte/i)).toHaveValue('5');
    expect(screen.getByText('Ya existe una cuenta con ese nombre.')).toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Guardar cambios');
  });
});
