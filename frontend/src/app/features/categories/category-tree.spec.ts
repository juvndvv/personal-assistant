import { Category } from '../../core/api/models';
import { nextSortOrder, siblingsOf, sortOrderChangesForMove } from './category-tree';
import { aCategory } from './testing/category-fixtures';

describe('category tree helpers', () => {
  const groceries = aCategory({ id: 11, parent_id: 10, name: 'Supermercado', sort_order: 0 });
  const restaurants = aCategory({ id: 12, parent_id: 10, name: 'Restaurantes', sort_order: 1 });
  const food = aCategory({
    id: 10,
    name: 'Alimentación',
    sort_order: 0,
    children: [groceries, restaurants],
  });
  const home = aCategory({ id: 20, name: 'Vivienda', sort_order: 1 });
  const leisure = aCategory({ id: 30, name: 'Ocio', sort_order: 2 });
  const tree: Category[] = [food, home, leisure];

  it('finds top-level and child siblings', () => {
    expect(siblingsOf(tree, home)).toBe(tree);
    expect(siblingsOf(tree, restaurants)).toEqual([groceries, restaurants]);
  });

  it('renumbers only the moved items', () => {
    expect(sortOrderChangesForMove(tree, 30, -1)).toEqual([
      { id: 30, sort_order: 1 },
      { id: 20, sort_order: 2 },
    ]);
    expect(sortOrderChangesForMove(tree, 10, 1)).toEqual([
      { id: 20, sort_order: 0 },
      { id: 10, sort_order: 1 },
    ]);
  });

  it('normalises gaps and duplicates', () => {
    const messy = [
      aCategory({ id: 1, sort_order: 5 }),
      aCategory({ id: 2, sort_order: 5 }),
      aCategory({ id: 3, sort_order: 9 }),
    ];
    expect(sortOrderChangesForMove(messy, 3, -1)).toEqual([
      { id: 1, sort_order: 0 },
      { id: 3, sort_order: 1 },
      { id: 2, sort_order: 2 },
    ]);
  });

  it('ignores moves past the edges', () => {
    expect(sortOrderChangesForMove(tree, 10, -1)).toEqual([]);
    expect(sortOrderChangesForMove(tree, 30, 1)).toEqual([]);
  });

  it('appends new categories after the last sibling', () => {
    expect(nextSortOrder(tree)).toBe(3);
    expect(nextSortOrder([])).toBe(0);
  });
});
