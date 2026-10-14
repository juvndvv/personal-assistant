export const splashSchemes = {
  light: { background: '#ffffff', tile: '#0D0D0D', glyph: '#FFFFFF' },
  dark: { background: '#212121', tile: '#FFFFFF', glyph: '#0D0D0D' },
};

export const splashScreens = [
  { width: 440, height: 956, ratio: 3 },
  { width: 402, height: 874, ratio: 3 },
  { width: 430, height: 932, ratio: 3 },
  { width: 393, height: 852, ratio: 3 },
  { width: 428, height: 926, ratio: 3 },
  { width: 390, height: 844, ratio: 3 },
  { width: 414, height: 896, ratio: 3 },
  { width: 375, height: 812, ratio: 3 },
  { width: 414, height: 896, ratio: 2 },
  { width: 414, height: 736, ratio: 3 },
  { width: 375, height: 667, ratio: 2 },
  { width: 320, height: 568, ratio: 2 },
  { width: 1032, height: 1376, ratio: 2 },
  { width: 1024, height: 1366, ratio: 2 },
  { width: 834, height: 1194, ratio: 2 },
  { width: 820, height: 1180, ratio: 2 },
  { width: 810, height: 1080, ratio: 2 },
  { width: 768, height: 1024, ratio: 2 },
];

export function splashFile({ width, height, ratio }, scheme = 'light') {
  const prefix = scheme === 'dark' ? 'splash-dark' : 'splash';
  return `icons/${prefix}-${width * ratio}x${height * ratio}.png`;
}

export function splashMedia({ width, height, ratio }, scheme = 'light') {
  return `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`;
}
