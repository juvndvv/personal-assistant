import { arcPath, columnPath, foldSegments, visibleLabelIndexes } from './chart-geometry';

describe('chart geometry', () => {
  it('rounds the data end of a positive column and keeps the baseline square', () => {
    expect(columnPath(10, 100, 40, 20, 4)).toBe(
      'M10,100 L10,44 Q10,40 14,40 L26,40 Q30,40 30,44 L30,100 Z',
    );
  });

  it('rounds the bottom of a negative column', () => {
    expect(columnPath(10, 100, 140, 20, 4)).toBe(
      'M10,100 L10,136 Q10,140 14,140 L26,140 Q30,140 30,136 L30,100 Z',
    );
  });

  it('shrinks the radius for very short columns', () => {
    expect(columnPath(0, 100, 98, 10, 4)).toBe(
      'M0,100 L0,100 Q0,98 2,98 L8,98 Q10,98 10,100 L10,100 Z',
    );
  });

  it('thins axis labels to fit and always keeps the last one', () => {
    expect(visibleLabelIndexes(12, 6)).toEqual([1, 3, 5, 7, 9, 11]);
    expect(visibleLabelIndexes(4, 6)).toEqual([0, 1, 2, 3]);
  });

  it('draws a donut arc between two angles', () => {
    expect(arcPath(50, 50, 40, 25, 0, Math.PI / 2)).toBe(
      'M50,10 A40,40 0 0 1 90,50 L75,50 A25,25 0 0 0 50,25 Z',
    );
  });

  it('folds the tail of the segments into an other bucket', () => {
    const items = [5, 4, 3, 2, 1].map((value) => ({ key: `k${value}`, label: `L${value}`, value }));
    expect(foldSegments(items, 3, 'Otras')).toEqual([
      { key: 'k5', label: 'L5', value: 5, slot: 1 },
      { key: 'k4', label: 'L4', value: 4, slot: 2 },
      { key: 'other', label: 'Otras', value: 6, slot: null },
    ]);
    expect(foldSegments(items.slice(0, 3), 3, 'Otras')).toHaveLength(3);
  });
});
