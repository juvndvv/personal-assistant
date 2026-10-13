import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { RecurringTemplate, RecurringTemplateInput } from '../../core/api/models';
import { todayInMadrid } from '../../core/date/iso-date';
import { CategoryOption } from '../transactions/reference-data';
import { RecurringTemplateForm, RecurringTemplateFormErrors } from './recurring-template-form';
import { aRecurringTemplate } from './testing/recurring-fixtures';

const accounts = [
  { id: 3, name: 'BBVA' },
  { id: 9, name: 'Ahorro' },
];

function category(id: number, kind: 'expense' | 'income', label: string): CategoryOption {
  return { id, kind, name: label, label, icon: null, color: null };
}

const categories = [
  category(21, 'expense', 'Vivienda › Electricidad'),
  category(22, 'expense', 'Vivienda › Alquiler'),
  category(50, 'income', 'Nómina'),
];

interface SetupOptions {
  template?: RecurringTemplate | null;
  serverErrors?: RecurringTemplateFormErrors;
}

async function setup(options: SetupOptions = {}) {
  const submitted = vi.fn<(input: RecurringTemplateInput) => void>();
  await render(RecurringTemplateForm, {
    inputs: {
      template: options.template ?? null,
      accounts,
      categories,
      serverErrors: options.serverErrors ?? {},
    },
    on: { submitted },
  });
  return { submitted, user: userEvent.setup() };
}

const amountInput = () => screen.getByRole('textbox', { name: /^importe/i });
const categorySelect = () => screen.getByRole('combobox', { name: /categoría/i });
const optionLabels = (select: HTMLElement) =>
  Array.from((select as HTMLSelectElement).options).map((option) => option.textContent?.trim());

describe('RecurringTemplateForm', () => {
  it('labels the amount as an estimate and explains the draft when the template is variable', async () => {
    const { user } = await setup();

    expect(screen.getByRole('textbox', { name: /^importe/i })).toHaveAccessibleName(
      /^importe\*?$/i,
    );
    expect(screen.queryByText(/te pediremos el importe real/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /importe variable/i }));

    expect(amountInput()).toHaveAccessibleName(/importe estimado/i);
    expect(screen.getByText(/te pediremos el importe real/i)).toBeInTheDocument();
  });

  it('blocks submission and explains every missing required field', async () => {
    const { submitted, user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Crear fijo' }));

    expect(submitted).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe un nombre.')).toBeInTheDocument();
    expect(screen.getByText('Indica un importe mayor que cero.')).toBeInTheDocument();
    expect(screen.getByText('Elige una cuenta.')).toBeInTheDocument();
    expect(screen.getByText('Elige una categoría.')).toBeInTheDocument();
  });

  it('rejects an end date before the start date', async () => {
    const { submitted, user } = await setup();
    await user.type(screen.getByRole('textbox', { name: /nombre/i }), 'Gimnasio');
    await user.type(amountInput(), '30');
    await user.selectOptions(screen.getByRole('combobox', { name: /cuenta/i }), '3');
    await user.selectOptions(categorySelect(), '22');
    fireEvent.input(screen.getByLabelText(/empieza el/i), { target: { value: '2026-11-01' } });
    fireEvent.input(screen.getByLabelText(/termina el/i), { target: { value: '2026-10-01' } });

    await user.click(screen.getByRole('button', { name: 'Crear fijo' }));

    expect(submitted).not.toHaveBeenCalled();
    expect(
      screen.getByText('La fecha de fin no puede ser anterior al inicio.'),
    ).toBeInTheDocument();
  });

  it('only offers categories of the selected type and clears a mismatched one', async () => {
    const { user } = await setup();

    expect(optionLabels(categorySelect())).toEqual([
      'Elige una categoría',
      'Vivienda › Electricidad',
      'Vivienda › Alquiler',
    ]);
    await user.selectOptions(categorySelect(), '21');

    await user.click(screen.getByRole('radio', { name: 'Ingreso' }));

    expect(optionLabels(categorySelect())).toEqual(['Elige una categoría', 'Nómina']);
    expect(categorySelect()).toHaveValue('');
  });

  it('offers days 1 to 31 and explains the clamping to the month end', async () => {
    await setup();

    const day = screen.getByRole('combobox', { name: /día del mes/i });
    expect(optionLabels(day)).toEqual(Array.from({ length: 31 }, (_, index) => String(index + 1)));
    expect(screen.getByText(/se usará el último día del mes/i)).toBeInTheDocument();
  });

  it('emits a complete payload in cents for a valid variable template', async () => {
    const { submitted, user } = await setup();
    await user.type(screen.getByRole('textbox', { name: /nombre/i }), '  Luz  ');
    await user.click(screen.getByRole('checkbox', { name: /importe variable/i }));
    await user.type(amountInput(), '60');
    await user.selectOptions(screen.getByRole('combobox', { name: /cuenta/i }), '3');
    await user.selectOptions(categorySelect(), '21');
    await user.selectOptions(screen.getByRole('combobox', { name: /frecuencia/i }), 'quarterly');
    await user.selectOptions(screen.getByRole('combobox', { name: /día del mes/i }), '31');
    await user.type(screen.getByRole('textbox', { name: /comercio/i }), 'Iberdrola');

    await user.click(screen.getByRole('button', { name: 'Crear fijo' }));

    expect(submitted).toHaveBeenCalledWith({
      name: 'Luz',
      type: 'expense',
      amount_cents: 6000,
      is_variable: true,
      account_id: 3,
      category_id: 21,
      frequency: 'quarterly',
      day_of_month: 31,
      starts_on: todayInMadrid(),
      ends_on: null,
      description: null,
      merchant: 'Iberdrola',
    });
  });

  it('prefills an existing template and shows server errors', async () => {
    await setup({
      template: aRecurringTemplate({ ends_on: '2027-12-31' }),
      serverErrors: { type: 'No se puede cambiar el tipo de un fijo con movimientos.' },
    });

    expect(screen.getByRole('textbox', { name: /nombre/i })).toHaveValue('Luz');
    expect(amountInput()).toHaveValue('60,00');
    expect(amountInput()).toHaveAccessibleName(/importe estimado/i);
    expect(screen.getByRole('checkbox', { name: /importe variable/i })).toBeChecked();
    expect(categorySelect()).toHaveValue('21');
    expect(screen.getByRole('combobox', { name: /día del mes/i })).toHaveValue('5');
    expect(screen.getByLabelText(/termina el/i)).toHaveValue('2027-12-31');
    expect(
      screen.getByText('No se puede cambiar el tipo de un fijo con movimientos.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });
});
