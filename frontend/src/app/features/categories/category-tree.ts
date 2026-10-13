import { Category } from '../../core/api/models';

export type MoveDirection = -1 | 1;

export interface SortOrderChange {
  id: number;
  sort_order: number;
}

export function siblingsOf(tree: readonly Category[], category: Category): readonly Category[] {
  if (category.parent_id === null) {
    return tree;
  }
  return tree.find((node) => node.id === category.parent_id)?.children ?? [];
}

export function sortOrderChangesForMove(
  siblings: readonly Category[],
  id: number,
  direction: MoveDirection,
): SortOrderChange[] {
  const index = siblings.findIndex((sibling) => sibling.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= siblings.length) {
    return [];
  }
  const reordered = [...siblings];
  const [moved] = reordered.splice(index, 1);
  if (moved === undefined) {
    return [];
  }
  reordered.splice(target, 0, moved);
  return reordered
    .map((sibling, position) => ({
      id: sibling.id,
      sort_order: position,
      previous: sibling.sort_order,
    }))
    .filter((change) => change.sort_order !== change.previous)
    .map(({ id: changedId, sort_order }) => ({ id: changedId, sort_order }));
}

export function nextSortOrder(siblings: readonly Category[]): number {
  return siblings.reduce((highest, sibling) => Math.max(highest, sibling.sort_order + 1), 0);
}
