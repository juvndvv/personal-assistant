import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Observable, of, throwError } from 'rxjs';
import { RecurringTemplate } from '../../core/api/models';
import { AccountsApi } from '../../core/api/accounts.api';
import { CategoriesApi } from '../../core/api/categories.api';
import { RecurringApi } from '../../core/api/recurring.api';
import { UiToast } from '../../shared/ui';
import { anAccount } from '../accounts/testing/account-fixtures';
import { RecurringEditorPage } from './recurring-editor.page';
import { aRecurringTemplate } from './testing/recurring-fixtures';

const categoryTree = [
  {
    id: 20,
    kind: 'expense' as const,
    name: 'Vivienda',
    parent_id: null,
    icon: null,
    color: null,
    sort_order: 0,
    archived_at: null,
    children: [
      {
        id: 21,
        kind: 'expense' as const,
        name: 'Electricidad',
        parent_id: 20,
        icon: null,
        color: null,
        sort_order: 0,
        archived_at: null,
        children: [],
      },
    ],
  },
];

async function setup(
  id?: string,
  update: () => Observable<RecurringTemplate> = () => of(aRecurringTemplate()),
) {
  const recurring = {
    get: vi.fn(() => of(aRecurringTemplate())),
    create: vi.fn(() => of(aRecurringTemplate())),
    update: vi.fn(update),
  };
  const view = await render(RecurringEditorPage, {
    providers: [
      provideRouter([]),
      { provide: RecurringApi, useValue: recurring },
      { provide: AccountsApi, useValue: { list: () => of([anAccount({ id: 3, name: 'BBVA' })]) } },
      { provide: CategoriesApi, useValue: { list: () => of(categoryTree) } },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    ],
    inputs: id === undefined ? {} : { id },
  });
  const router = view.fixture.debugElement.injector.get(Router);
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { recurring, navigate, user: userEvent.setup() };
}

describe('RecurringEditorPage', () => {
  it('creates a template and returns to the list', async () => {
    const { recurring, navigate, user } = await setup();
    await screen.findByRole('heading', { name: 'Nuevo fijo' });
    await user.type(await screen.findByRole('textbox', { name: /nombre/i }), 'Luz');
    await user.type(screen.getByRole('textbox', { name: /^importe/i }), '60');
    await user.selectOptions(screen.getByRole('combobox', { name: /cuenta/i }), '3');
    await user.selectOptions(screen.getByRole('combobox', { name: /categoría/i }), '21');

    await user.click(screen.getByRole('button', { name: 'Crear fijo' }));

    expect(recurring.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Luz', amount_cents: 6000, account_id: 3, category_id: 21 }),
    );
    expect(navigate).toHaveBeenCalledWith('/mas/fijos');
  });

  it('edits a template without resending an unchanged type', async () => {
    const { recurring, user } = await setup('4');
    const amount = await screen.findByRole('textbox', { name: /importe estimado/i });
    await user.clear(amount);
    await user.type(amount, '75');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(recurring.get).toHaveBeenCalledWith(4);
    const [id, patch] = recurring.update.mock.calls[0] as unknown as [number, object];
    expect(id).toBe(4);
    expect(patch).toMatchObject({ amount_cents: 7500, name: 'Luz' });
    expect(patch).not.toHaveProperty('type');
  });

  it('shows validation errors from the server on their fields', async () => {
    const { user } = await setup('4', () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { message: 'Invalid', errors: { account_id: ['La cuenta está archivada.'] } },
          }),
      ),
    );
    await screen.findByRole('textbox', { name: /importe estimado/i });

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('La cuenta está archivada.')).toBeInTheDocument();
  });
});
