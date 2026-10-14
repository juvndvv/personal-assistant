import {
  lucideBaby,
  lucideBriefcase,
  lucideBus,
  lucideCar,
  lucideCircleEllipsis,
  lucideCoffee,
  lucideCoins,
  lucideDroplet,
  lucideDumbbell,
  lucideFlame,
  lucideFuel,
  lucideGamepad2,
  lucideGift,
  lucideGraduationCap,
  lucideHeartPulse,
  lucideHouse,
  lucideLandmark,
  lucideLaptop,
  lucidePawPrint,
  lucidePercent,
  lucidePiggyBank,
  lucidePlane,
  lucideRepeat,
  lucideShirt,
  lucideShoppingBag,
  lucideShoppingCart,
  lucideSmartphone,
  lucideTag,
  lucideUndo2,
  lucideUtensils,
  lucideWifi,
  lucideZap,
} from '@ng-icons/lucide';

export interface CategoryIconOption {
  key: string;
  label: string;
  iconName: string;
}

export const FALLBACK_CATEGORY_ICON = 'lucideTag';

export const CATEGORY_ICON_SVGS = {
  lucideBaby,
  lucideBriefcase,
  lucideBus,
  lucideCar,
  lucideCircleEllipsis,
  lucideCoffee,
  lucideCoins,
  lucideDroplet,
  lucideDumbbell,
  lucideFlame,
  lucideFuel,
  lucideGamepad2,
  lucideGift,
  lucideGraduationCap,
  lucideHeartPulse,
  lucideHouse,
  lucideLandmark,
  lucideLaptop,
  lucidePawPrint,
  lucidePercent,
  lucidePiggyBank,
  lucidePlane,
  lucideRepeat,
  lucideShirt,
  lucideShoppingBag,
  lucideShoppingCart,
  lucideSmartphone,
  lucideTag,
  lucideUndo2,
  lucideUtensils,
  lucideWifi,
  lucideZap,
};

export const CATEGORY_ICONS: readonly CategoryIconOption[] = [
  { key: 'house', label: 'Casa', iconName: 'lucideHouse' },
  { key: 'lightning', label: 'Electricidad', iconName: 'lucideZap' },
  { key: 'drop', label: 'Agua', iconName: 'lucideDroplet' },
  { key: 'flame', label: 'Gas', iconName: 'lucideFlame' },
  { key: 'wifi-high', label: 'Internet', iconName: 'lucideWifi' },
  { key: 'shopping-cart', label: 'Supermercado', iconName: 'lucideShoppingCart' },
  { key: 'fork-knife', label: 'Restaurante', iconName: 'lucideUtensils' },
  { key: 'coffee', label: 'Cafetería', iconName: 'lucideCoffee' },
  { key: 'car', label: 'Coche', iconName: 'lucideCar' },
  { key: 'gas-pump', label: 'Combustible', iconName: 'lucideFuel' },
  { key: 'bus', label: 'Transporte público', iconName: 'lucideBus' },
  { key: 'heartbeat', label: 'Salud', iconName: 'lucideHeartPulse' },
  { key: 'barbell', label: 'Deporte', iconName: 'lucideDumbbell' },
  { key: 'game-controller', label: 'Ocio', iconName: 'lucideGamepad2' },
  { key: 'shopping-bag', label: 'Compras', iconName: 'lucideShoppingBag' },
  { key: 't-shirt', label: 'Ropa', iconName: 'lucideShirt' },
  { key: 'device-mobile', label: 'Teléfono', iconName: 'lucideSmartphone' },
  { key: 'repeat', label: 'Suscripciones', iconName: 'lucideRepeat' },
  { key: 'graduation-cap', label: 'Educación', iconName: 'lucideGraduationCap' },
  { key: 'airplane', label: 'Viajes', iconName: 'lucidePlane' },
  { key: 'gift', label: 'Regalos', iconName: 'lucideGift' },
  { key: 'baby', label: 'Hijos', iconName: 'lucideBaby' },
  { key: 'paw-print', label: 'Mascotas', iconName: 'lucidePawPrint' },
  { key: 'bank', label: 'Impuestos', iconName: 'lucideLandmark' },
  { key: 'briefcase', label: 'Trabajo', iconName: 'lucideBriefcase' },
  { key: 'laptop', label: 'Freelance', iconName: 'lucideLaptop' },
  { key: 'piggy-bank', label: 'Ahorro', iconName: 'lucidePiggyBank' },
  { key: 'arrow-counter-clockwise', label: 'Reembolsos', iconName: 'lucideUndo2' },
  { key: 'coins', label: 'Intereses', iconName: 'lucideCoins' },
  { key: 'percent', label: 'Porcentaje', iconName: 'lucidePercent' },
  { key: 'dots-three', label: 'Otros', iconName: 'lucideCircleEllipsis' },
];

export type CategoryColorKey =
  | 'blue'
  | 'teal'
  | 'purple'
  | 'red'
  | 'amber'
  | 'cyan'
  | 'magenta'
  | 'olive'
  | 'orange'
  | 'green'
  | 'indigo'
  | 'slate';

export interface CategoryColorOption {
  key: CategoryColorKey;
  label: string;
  value: string;
}

const CATEGORY_COLOR_VALUES: Record<CategoryColorKey, string> = {
  blue: '#3566F0',
  teal: '#027C6A',
  purple: '#9639ED',
  red: '#D8241A',
  amber: '#9F5C14',
  cyan: '#0D78A1',
  magenta: '#CF42C5',
  olive: '#758E1A',
  orange: '#C4520A',
  green: '#1F8A3B',
  indigo: '#4F46C8',
  slate: '#5D6B7A',
};

const CATEGORY_COLOR_LABELS: readonly [CategoryColorKey, string][] = [
  ['blue', 'Azul'],
  ['teal', 'Turquesa'],
  ['purple', 'Morado'],
  ['red', 'Rojo'],
  ['amber', 'Ámbar'],
  ['cyan', 'Cian'],
  ['magenta', 'Magenta'],
  ['olive', 'Oliva'],
  ['orange', 'Naranja'],
  ['green', 'Verde'],
  ['indigo', 'Índigo'],
  ['slate', 'Pizarra'],
];

export const CATEGORY_COLORS: readonly CategoryColorOption[] = CATEGORY_COLOR_LABELS.map(
  ([key, label]) => ({ key, label, value: CATEGORY_COLOR_VALUES[key] }),
);

type Rgb = readonly [number, number, number];

const HEX_COLOR = /^#([0-9a-f]{6})$/i;

function toRgb(hex: string): Rgb | null {
  const match = HEX_COLOR.exec(hex.trim());
  if (match?.[1] === undefined) {
    return null;
  }
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function perceptualDistance(a: Rgb, b: Rgb): number {
  const redMean = (a[0] + b[0]) / 2;
  const red = a[0] - b[0];
  const green = a[1] - b[1];
  const blue = a[2] - b[2];
  return (
    (2 + redMean / 256) * red * red + 4 * green * green + (2 + (255 - redMean) / 256) * blue * blue
  );
}

const PALETTE_RGB = CATEGORY_COLORS.map((option) => ({
  key: option.key,
  rgb: toRgb(option.value),
}));

export function categoryColorKey(stored: string | null | undefined): CategoryColorKey | null {
  const rgb = stored ? toRgb(stored) : null;
  if (rgb === null) {
    return null;
  }
  let nearest: CategoryColorKey | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const candidate of PALETTE_RGB) {
    if (candidate.rgb === null) {
      continue;
    }
    const distance = perceptualDistance(rgb, candidate.rgb);
    if (distance < best) {
      best = distance;
      nearest = candidate.key;
    }
  }
  return nearest;
}

export function categoryColorValue(key: CategoryColorKey): string {
  return CATEGORY_COLOR_VALUES[key];
}

export function categoryColorVar(stored: string | null | undefined): string | null {
  const key = categoryColorKey(stored);
  return key === null ? null : `var(--category-${key})`;
}

export function iconNameFor(key: string | null): string {
  return CATEGORY_ICONS.find((option) => option.key === key)?.iconName ?? FALLBACK_CATEGORY_ICON;
}
