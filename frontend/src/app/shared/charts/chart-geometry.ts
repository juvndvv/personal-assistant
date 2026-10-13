import { SeriesSlot } from './chart-types';

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  slot: SeriesSlot | null;
}

export interface SegmentInput {
  key: string;
  label: string;
  value: number;
}

export const OTHER_SEGMENT_KEY = 'other';

export function columnPath(
  x: number,
  baselineY: number,
  endY: number,
  width: number,
  radius: number,
): string {
  const direction = endY <= baselineY ? 1 : -1;
  const r = Math.min(radius, Math.abs(baselineY - endY), width / 2);
  const right = x + width;
  return [
    `M${x},${baselineY}`,
    `L${x},${round(endY + direction * r)}`,
    `Q${x},${endY} ${x + r},${endY}`,
    `L${right - r},${endY}`,
    `Q${right},${endY} ${right},${round(endY + direction * r)}`,
    `L${right},${baselineY}`,
    'Z',
  ].join(' ');
}

export function visibleLabelIndexes(count: number, maxLabels: number): number[] {
  const step = Math.max(1, Math.ceil(count / Math.max(1, maxLabels)));
  const indexes: number[] = [];
  for (let index = count - 1; index >= 0; index -= step) {
    indexes.unshift(index);
  }
  return indexes;
}

export function arcPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  startAngle: number,
  endAngle: number,
): string {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, outer, startAngle);
  const [x1, y1] = polar(cx, cy, outer, endAngle);
  const [x2, y2] = polar(cx, cy, inner, endAngle);
  const [x3, y3] = polar(cx, cy, inner, startAngle);
  return [
    `M${x0},${y0}`,
    `A${outer},${outer} 0 ${largeArc} 1 ${x1},${y1}`,
    `L${x2},${y2}`,
    `A${inner},${inner} 0 ${largeArc} 0 ${x3},${y3}`,
    'Z',
  ].join(' ');
}

export function foldSegments(
  items: readonly SegmentInput[],
  maxSegments: number,
  otherLabel: string,
): DonutSegment[] {
  const sorted = [...items].sort((left, right) => right.value - left.value);
  if (sorted.length <= maxSegments) {
    return sorted.map((item, index) => ({ ...item, slot: slotAt(index) }));
  }
  const kept = sorted.slice(0, maxSegments - 1);
  const rest = sorted.slice(maxSegments - 1).reduce((total, item) => total + item.value, 0);
  return [
    ...kept.map((item, index) => ({ ...item, slot: slotAt(index) })),
    { key: OTHER_SEGMENT_KEY, label: otherLabel, value: rest, slot: null },
  ];
}

function slotAt(index: number): SeriesSlot {
  return ((index % 8) + 1) as SeriesSlot;
}

function polar(cx: number, cy: number, radius: number, angle: number): [number, number] {
  return [round(cx + radius * Math.sin(angle)), round(cy - radius * Math.cos(angle))];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
