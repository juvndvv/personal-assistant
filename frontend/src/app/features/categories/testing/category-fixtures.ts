import { Category } from '../../../core/api/models';

export function aCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    kind: 'expense',
    name: 'Categoría',
    parent_id: null,
    icon: null,
    color: null,
    sort_order: 0,
    archived_at: null,
    children: [],
    ...overrides,
  };
}
