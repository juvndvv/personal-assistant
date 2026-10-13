import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const standardSizes = [72, 96, 128, 144, 152, 192, 384, 512];
const maskableSize = 512;
const maskableSafeZoneScale = 0.7;

const mark = await readFile(`${publicDir}favicon.svg`, 'utf8');
const glyph = mark.replace(/<rect[^>]*\/>/, '').replace(/<\/?svg[^>]*>/g, '');

function standardPage(size) {
  return `<body style="margin:0">${mark.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`;
}

function maskablePage(size) {
  const offset = (512 * (1 - maskableSafeZoneScale)) / 2;
  return `<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" fill="#F95A5C"/><g transform="translate(${offset} ${offset}) scale(${maskableSafeZoneScale})">${glyph}</g></svg></body>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(html, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  await page.screenshot({ path: `${publicDir}${file}`, omitBackground: true });
}

for (const size of standardSizes) {
  await render(standardPage(size), size, `icons/icon-${size}x${size}.png`);
}
await render(
  maskablePage(maskableSize),
  maskableSize,
  `icons/icon-maskable-${maskableSize}x${maskableSize}.png`,
);
await render(standardPage(180), 180, 'icons/apple-touch-icon.png');

await browser.close();
