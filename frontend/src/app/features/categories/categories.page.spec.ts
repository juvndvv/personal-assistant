import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { CategoriesApi, CategoryListQuery } from '../../core/api/categories.api';
import { Category } from '../../core/api/models';
import { UiToast } from '../../shared/ui';
import { CategoriesPage } from './categories.page';
import { aCategory } from './testing/category-fixtures';

const groceries = aCategory({ id: 11, parent_id: 10, name: 'Supermercado', sort_order: 0 });
const restaurants = aCategory({ id: 12, parent_id: 10, name: 'Restaurantes', sort_order: 1 });
const expenseTree: Category[] = [
  aCategory({ id: 10, name: 'Alimentación', sort_order: 0, children: [groceries, restaurants] }),
  aCategory({ id: 20, name: 'Vivienda', sort_order: 1 }),
];
const incomeTree: Category[] = [aCategory({ id: 50, kind: 'income', name: 'Nómina' })];

async function setup() {
  const api = {
    list: vi.fn((query: CategoryListQuery) =>
      of(query.kind === 'income' ? incomeTree : expenseTree),
    ),
    create: vi.fn((input: Partial<Category>) => of(aCategory({ id: 99, ...input }))),
    update: vi.fn((id: number) => of(aCategory({ id }))),
    archive: vi.fn((id: number) => of(aCategory({ id }))),
    unarchive: vi.fn((id: number) => of(aCategory({ id }))),
    delete: vi.fn(),
  };
  await render(CategoriesPage, {
    providers: [
      provideRouter([]),
      { provide: CategoriesApi, useValue: api },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  await screen.findByText('Alimentación');
  return { api, user: userEvent.setup() };
}

describe('CategoriesPage', () => {
  it('shows the two-level expense tree and switches to income', async () => {
    const { api, user } = await setup();

    const children = within(screen.getByRole('list', { name: 'Subcategorías de Alimentación' }));
    expect(children.getByText('Supermercado')).toBeInTheDocument();
    expect(children.getByText('Restaurantes')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Ingresos' }));

    expect(api.list).toHaveBeenLastCalledWith({ kind: 'income', includeArchived: false });
    expect(await screen.findByText('Nómina')).toBeInTheDocument();
    expect(screen.queryByText('Alimentación')).not.toBeInTheDocument();
  });

  it('adds a subcategory that always inherits the parent kind', async () => {
    const { api, user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Añadir subcategoría a Alimentación' }));
    expect(await screen.findByText(/Dentro de Alimentación/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/nombre/i), 'Cafeterías');
    await user.click(screen.getByRole('radio', { name: 'Verde' }));
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(api.create).toHaveBeenCalledWith({
      kind: 'expense',
      name: 'Cafeterías',
      parent_id: 10,
      icon: null,
      color: '#2E7D32',
      sort_order: 2,
    });
  });

  it('does not offer subcategories below the second level', async () => {
    await setup();

    expect(
      screen.queryByRole('button', { name: 'Añadir subcategoría a Supermercado' }),
    ).not.toBeInTheDocument();
  });

  it('renames a category and changes its icon', async () => {
    const { api, user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Editar Vivienda' }));
    const name = await screen.findByLabelText(/nombre/i);
    await user.clear(name);
    await user.type(name, 'Hogar');
    await user.selectOptions(screen.getByLabelText(/icono/i), 'house');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(api.update).toHaveBeenCalledWith(20, { name: 'Hogar', icon: 'house', color: null });
  });

  it('reorders siblings', async () => {
    const { api, user } = await setup();

    expect(screen.getByRole('button', { name: 'Subir Alimentación' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Bajar Supermercado' }));

    expect(api.update).toHaveBeenCalledWith(12, { sort_order: 0 });
    expect(api.update).toHaveBeenCalledWith(11, { sort_order: 1 });
  });

  it('archives a category', async () => {
    const { api, user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Archivar Vivienda' }));

    expect(api.archive).toHaveBeenCalledWith(20);
  });

  it.each([
    ['category_in_use', /archívala para ocultarla/i],
    ['category_has_children', /tiene subcategorías/i],
  ])('explains a %s conflict on delete', async (code, message) => {
    const { api, user } = await setup();
    api.delete.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'x', code } })),
    );

    await user.click(screen.getByRole('button', { name: 'Eliminar Alimentación' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar categoría' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });

  it('names only the real deletion blockers on a category_in_use conflict', async () => {
    const { api, user } = await setup();
    api.delete.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({ status: 409, error: { message: 'x', code: 'category_in_use' } }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Eliminar Alimentación' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar categoría' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    const message = await within(dialog).findByText(
      'Esta categoría se usa en movimientos, plantillas o borradores. Archívala para ocultarla sin perder el historial.',
    );
    expect(message).not.toHaveTextContent(/presupuesto/i);
  });
});
