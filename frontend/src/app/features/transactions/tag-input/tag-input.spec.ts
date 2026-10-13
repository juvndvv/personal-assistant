import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { TagsApi } from '../../../core/api/tags.api';
import { TagInput } from './tag-input';
import { addTagName, normalizeTagName } from './tag-names';

async function setup(initial: string[] = []) {
  const list = vi.fn(() =>
    of([
      { id: 5, name: 'viaje roma', usage_count: 3 },
      { id: 6, name: 'viaje lisboa', usage_count: 1 },
    ]),
  );
  const view = await render(TagInput, {
    providers: [{ provide: TagsApi, useValue: { list } }],
    inputs: { tags: initial },
  });
  const tags = () => view.fixture.componentInstance.tags();
  return { list, tags, user: userEvent.setup() };
}

describe('tag names', () => {
  it('normalizes and deduplicates case-insensitively', () => {
    expect(normalizeTagName('  Viaje   ROMA ')).toBe('viaje roma');
    expect(addTagName(['casa'], 'CASA')).toEqual(['casa']);
    expect(addTagName(['casa'], '   ')).toEqual(['casa']);
    expect(addTagName([], 'x'.repeat(41))).toEqual([]);
    expect(
      addTagName(
        Array.from({ length: 10 }, (_, i) => `t${i}`),
        'otra',
      ),
    ).toHaveLength(10);
  });
});

describe('TagInput', () => {
  it('creates a tag on Enter', async () => {
    const { tags, user } = await setup();

    await user.type(screen.getByRole('combobox', { name: 'Etiquetas' }), 'Casa{Enter}');

    expect(tags()).toEqual(['casa']);
    expect(screen.getByRole('combobox', { name: 'Etiquetas' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Quitar etiqueta casa' })).toBeInTheDocument();
  });

  it('autocompletes from the existing tags', async () => {
    const { list, tags, user } = await setup();

    await user.type(screen.getByRole('combobox', { name: 'Etiquetas' }), 'via');
    const option = await screen.findByRole('option', { name: 'viaje roma' });
    expect(list).toHaveBeenCalledWith('via');
    expect(screen.getByRole('option', { name: 'Crear «via»' })).toBeInTheDocument();

    await user.click(option);
    expect(tags()).toEqual(['viaje roma']);
  });

  it('picks a suggestion with the keyboard', async () => {
    const { tags, user } = await setup(['viaje roma']);

    await user.type(screen.getByRole('combobox', { name: 'Etiquetas' }), 'viaje');
    await screen.findByRole('option', { name: 'viaje lisboa' });
    expect(screen.queryByRole('option', { name: 'viaje roma' })).not.toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}');

    expect(tags()).toEqual(['viaje roma', 'viaje lisboa']);
  });

  it('removes tags with the chip button and backspace', async () => {
    const { tags, user } = await setup(['casa', 'roma']);

    await user.click(screen.getByRole('button', { name: 'Quitar etiqueta casa' }));
    expect(tags()).toEqual(['roma']);

    await user.click(screen.getByRole('combobox', { name: 'Etiquetas' }));
    await user.keyboard('{Backspace}');
    expect(tags()).toEqual([]);
  });
});
