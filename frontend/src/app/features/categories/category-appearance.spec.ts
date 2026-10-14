import {
  CATEGORY_COLORS,
  categoryColorKey,
  categoryColorValue,
  categoryColorVar,
} from './category-appearance';

describe('category palette', () => {
  it('offers twelve palette keys', () => {
    expect(CATEGORY_COLORS).toHaveLength(12);
    expect(new Set(CATEGORY_COLORS.map((option) => option.key)).size).toBe(12);
  });

  it('round-trips every canonical value to its own key', () => {
    for (const option of CATEGORY_COLORS) {
      expect(categoryColorKey(option.value)).toBe(option.key);
      expect(categoryColorValue(option.key)).toBe(option.value);
    }
  });

  it.each([
    ['#F95A5C', 'orange'],
    ['#E53935', 'red'],
    ['#2E7D32', 'green'],
    ['#1E88E5', 'blue'],
    ['#3949AB', 'indigo'],
    ['#8E24AA', 'purple'],
    ['#00897B', 'teal'],
    ['#546E7A', 'slate'],
    ['#757575', 'slate'],
    ['#fb8c00', 'orange'],
  ])('maps the stored legacy colour %s to the nearest key %s', (stored, key) => {
    expect(categoryColorKey(stored)).toBe(key);
  });

  it('resolves stored colours to theme-aware CSS variables', () => {
    expect(categoryColorVar('#2E7D32')).toBe('var(--category-green)');
    expect(categoryColorVar(null)).toBeNull();
    expect(categoryColorVar('not-a-colour')).toBeNull();
  });
});
