import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { TagsApi } from '../../../core/api/tags.api';
import { UiToast } from '../../../shared/ui';
import { TAG_NAME_TAKEN_MESSAGE, TagsPage } from './tags.page';

async function setup() {
  const api = {
    list: vi.fn(() =>
      of([
        { id: 5, name: 'viaje roma', usage_count: 12 },
        { id: 6, name: 'casa', usage_count: 1 },
      ]),
    ),
    rename: vi.fn(() => of({ id: 5, name: 'roma 2026' })),
    delete: vi.fn(() => of(undefined)),
  };
  await render(TagsPage, {
    providers: [
      provideRouter([]),
      { provide: TagsApi, useValue: api },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  return { api, user: userEvent.setup() };
}

describe('TagsPage', () => {
  it('lists tags with their usage', async () => {
    await setup();

    expect(await screen.findByText('viaje roma')).toBeInTheDocument();
    expect(screen.getByText('12 movimientos')).toBeInTheDocument();
    expect(screen.getByText('1 movimiento')).toBeInTheDocument();
  });

  it('renames a tag', async () => {
    const { api, user } = await setup();

    await user.click(await screen.findByRole('button', { name: 'Renombrar viaje roma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renombrar etiqueta' });
    const name = within(dialog).getByRole('textbox', { name: 'Nombre' });
    await user.clear(name);
    await user.type(name, 'Roma 2026');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(api.rename).toHaveBeenCalledWith(5, 'roma 2026');
    expect(await screen.findByText('roma 2026')).toBeInTheDocument();
  });

  it('explains a rename collision', async () => {
    const { api, user } = await setup();
    api.rename.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: 'Taken', code: 'tag_name_taken' },
          }),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Renombrar viaje roma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renombrar etiqueta' });
    const name = within(dialog).getByRole('textbox', { name: 'Nombre' });
    await user.clear(name);
    await user.type(name, 'CASA');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await within(dialog).findByText(TAG_NAME_TAKEN_MESSAGE)).toBeInTheDocument();
  });

  it('deletes a tag after confirmation', async () => {
    const { api, user } = await setup();

    await user.click(await screen.findByRole('button', { name: 'Eliminar casa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar etiqueta' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(api.delete).toHaveBeenCalledWith(6);
    await vi.waitFor(() => expect(screen.queryByText('casa')).not.toBeInTheDocument());
  });

  it('offers a retry when the tags fail to load', async () => {
    const list = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValue(of([{ id: 5, name: 'viaje roma', usage_count: 12 }]));
    await render(TagsPage, {
      providers: [
        provideRouter([]),
        { provide: TagsApi, useValue: { list } },
        { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
    const user = userEvent.setup();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las etiquetas.',
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('viaje roma')).toBeInTheDocument();
  });
});
