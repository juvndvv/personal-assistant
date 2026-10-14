import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { KitchenSinkPage } from './kitchen-sink.page';

describe('KitchenSinkPage (yukit-web gate)', () => {
  it('renders yukit-web button, input, select, tabs and table', async () => {
    await render(KitchenSinkPage);
    const yukit = within(screen.getByTestId('yukit'));

    expect(yukit.getByRole('button', { name: 'Botón primario' })).toBeInTheDocument();
    expect(document.querySelector('input#ks-yuw-input')).toHaveAttribute(
      'placeholder',
      'Texto libre',
    );
    expect(yukit.getByRole('combobox')).toBeInTheDocument();
    expect(yukit.getByRole('tab', { name: 'Gastos' })).toHaveAttribute('aria-selected', 'true');
    expect(yukit.getByText('Panel de gastos')).toBeInTheDocument();
    expect(yukit.getByRole('table')).toBeInTheDocument();
    expect(yukit.getByText('Mercadona')).toBeInTheDocument();
    expect(yukit.getByText('-45,50 €')).toBeInTheDocument();
  });

  it('switches yukit-web tabs', async () => {
    await render(KitchenSinkPage);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Ingresos' }));
    expect(await screen.findByText('Panel de ingresos')).toBeInTheDocument();
  });

  it('opens the yukit-web dialog and sheet', async () => {
    await render(KitchenSinkPage);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Abrir diálogo' }));
    expect(await screen.findByRole('dialog', { name: 'Diálogo' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Abrir panel' }));
    expect(await screen.findByText('Contenido del panel.')).toBeInTheDocument();
  });

  it('shows a yukit-web toast', async () => {
    await render(KitchenSinkPage);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Botón primario' }));
    expect(await screen.findByText('Toast de yukit-web')).toBeInTheDocument();
  });

  it('renders the shared/ui wrappers', async () => {
    await render(KitchenSinkPage);
    const wrappers = within(screen.getByTestId('wrappers'));

    expect(wrappers.getByLabelText('Importe')).toHaveValue('12,50');
    expect(wrappers.getByLabelText('Fecha')).toHaveValue('2026-10-13');
    expect(wrappers.getByLabelText(/cuenta/i)).toBeInTheDocument();
    expect(wrappers.getByText('Sin movimientos')).toBeInTheDocument();
    expect(wrappers.getByText('Borrador')).toBeInTheDocument();
  });

  it('opens the wrapper dialog and sheet', async () => {
    await render(KitchenSinkPage);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Diálogo' }));
    expect(await screen.findByRole('dialog', { name: 'Confirmar' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    await user.click(screen.getByRole('button', { name: 'Panel' }));
    expect(await screen.findByText('Formulario rápido.')).toBeInTheDocument();
  });
});

describe('KitchenSinkPage (design system)', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('shows the new components in the current and forced dark theme', async () => {
    await render(KitchenSinkPage);

    for (const testId of ['showcase-light', 'showcase-dark']) {
      const panel = within(screen.getByTestId(testId));
      expect(panel.getAllByRole('alert')).toHaveLength(1);
      expect(panel.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
      expect(panel.getByText('Cargando ejemplo')).toBeInTheDocument();
      expect(panel.getByText(/^\+1\.?850,00/)).toBeInTheDocument();
    }
    expect(screen.getByTestId('showcase-dark')).toHaveClass('dark');
  });

  it('switches the application theme', async () => {
    await render(KitchenSinkPage);

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Oscuro' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
