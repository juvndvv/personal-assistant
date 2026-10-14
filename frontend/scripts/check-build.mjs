import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { splashFile, splashSchemes, splashScreens } from './splash-screens.mjs';

const browserDir = fileURLToPath(new URL('../dist/frontend/browser/', import.meta.url));
const indexHtml = await readFile(`${browserDir}index.html`, 'utf8');
const failures = [];

function fail(message) {
  failures.push(message);
}

const scriptTags = [...indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
for (const [, attributes, body] of scriptTags) {
  if (!/\bsrc=/.test(attributes) || body.trim() !== '') {
    fail(`inline <script> found: ${(attributes + body).trim().slice(0, 120)}`);
  }
}

const inlineHandlers = indexHtml.match(/\son[a-z]+\s*=\s*["']/gi) ?? [];
for (const handler of inlineHandlers) {
  fail(`inline event handler attribute found: ${handler.trim()}`);
}

if (/javascript:/i.test(indexHtml)) {
  fail('javascript: URL found in index.html');
}

for (const file of await readdir(browserDir)) {
  if (file.endsWith('.js')) {
    const source = await readFile(`${browserDir}${file}`, 'utf8');
    if (/\bnew Function\(|\beval\(/.test(source)) {
      fail(`${file} uses eval or new Function, which a strict script-src blocks`);
    }
  }
}

const requiredHead = [
  /<meta name="apple-mobile-web-app-capable" content="yes"/,
  /<meta name="apple-mobile-web-app-status-bar-style" content="[a-z-]+"/,
  /<meta name="apple-mobile-web-app-title" content="Finanzas"/,
  /<link rel="apple-touch-icon"[^>]*href="icons\/apple-touch-icon\.png"/,
  /<link rel="manifest" href="manifest\.webmanifest"/,
];
for (const pattern of requiredHead) {
  if (!pattern.test(indexHtml)) {
    fail(`index.html is missing ${pattern.source}`);
  }
}

for (const scheme of Object.keys(splashSchemes)) {
  for (const screen of splashScreens) {
    const file = splashFile(screen, scheme);
    if (!indexHtml.includes(`href="${file}"`)) {
      fail(`index.html has no apple-touch-startup-image link for ${file}`);
    }
    await access(`${browserDir}${file}`).catch(() => fail(`${file} is missing from the build`));
  }
}

const ngsw = JSON.parse(await readFile(`${browserDir}ngsw.json`, 'utf8'));
const cachedUrls = Object.keys(ngsw.hashTable ?? {});
if (cachedUrls.some((url) => url.startsWith('/api/'))) {
  fail('ngsw.json caches an /api URL');
}

if (failures.length > 0) {
  console.error(`Build check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(
  'Build check passed: no inline scripts or handlers, iOS meta and splash screens present.',
);
