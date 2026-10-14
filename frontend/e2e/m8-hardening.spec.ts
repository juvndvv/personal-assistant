import { Page, expect, test } from '@playwright/test';
import { axeViolations, smallTapTargets, unlabelledControls } from './accessibility';
import { authenticatedStatePath } from './auth-state';
import { e2eCredentials } from './credentials';

const SIGNED_IN_PAGES = [
  { path: '/', heading: 'Inicio' },
  { path: '/movimientos', heading: 'Movimientos' },
  { path: '/pendientes', heading: 'Pendientes' },
  { path: '/informes', heading: 'Informes' },
  { path: '/informes/patrimonio', heading: 'Informes' },
  { path: '/mas', heading: 'Más' },
  { path: '/cuentas', heading: 'Cuentas' },
  { path: '/mas/categorias', heading: 'Categorías' },
  { path: '/mas/etiquetas', heading: 'Etiquetas' },
  { path: '/mas/fijos', heading: 'Fijos' },
  { path: '/mas/presupuestos', heading: 'Presupuestos' },
  { path: '/mas/exportar', heading: 'Exportar datos' },
  { path: '/mas/ajustes', heading: 'Ajustes' },
];

async function submitLogin(page: Page, password = 'not-the-password'): Promise<void> {
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(e2eCredentials().email);
  await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

function recordCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}

test.describe('M8 login protection messages', () => {
  test.use({ serviceWorkers: 'block' });

  test('a throttled login explains how long to wait', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 429,
        headers: { 'Retry-After': '42' },
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Too Many Attempts.' }),
      }),
    );
    await page.goto('/login');

    await submitLogin(page);

    await expect(page.getByRole('alert')).toHaveText(
      'Demasiados intentos. Vuelve a intentarlo en 42 segundos.',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  test('a blocked IP gets a lockout message instead of a generic error', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 403,
        headers: { 'Retry-After': '3600' },
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Blocked.', code: 'ip_blocked' }),
      }),
    );
    await page.goto('/login');

    await submitLogin(page);

    await expect(page.getByRole('alert')).toHaveText(
      'Hemos bloqueado el acceso desde esta red por demasiados intentos fallidos. Vuelve a intentarlo en 60 minutos.',
    );
  });
});

test.describe('M8 PWA polish', () => {
  test('the document ships iOS web app meta, icons and splash screens', async ({
    page,
    request,
  }) => {
    await page.goto('/login');

    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    );
    await expect(
      page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
    ).toHaveAttribute('content', /\S+/);
    const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    const splashes = await page
      .locator('link[rel="apple-touch-startup-image"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(splashes.length).toBeGreaterThanOrEqual(10);

    for (const href of [touchIcon ?? '', splashes[0] ?? '', splashes.at(-1) ?? '']) {
      const response = await request.get(`/${href}`);
      expect(response.status(), href).toBe(200);
      expect(response.headers()['content-type'], href).toContain('image/png');
    }
  });

  test('the build has no inline scripts and loads without CSP violations', async ({ page }) => {
    const violations = recordCspViolations(page);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();

    const inlineScripts = await page.locator('script:not([src])').count();
    const inlineHandlers = await page.evaluate(
      () =>
        [...document.querySelectorAll('*')].filter((element) =>
          [...element.attributes].some((attribute) => attribute.name.startsWith('on')),
        ).length,
    );

    expect(inlineScripts).toBe(0);
    expect(inlineHandlers).toBe(0);
    expect(violations).toEqual([]);
  });

  test('production responses carry HSTS and the security headers', async ({ request }) => {
    test.skip(
      process.env['E2E_EXPECT_SECURITY_HEADERS'] === undefined,
      'set E2E_EXPECT_SECURITY_HEADERS=1 against the production overlay',
    );

    const response = await request.get('/login');
    const headers = response.headers();

    expect(headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('same-origin');
  });
});

test.describe('M8 signed-in polish', () => {
  test.use({ storageState: authenticatedStatePath, serviceWorkers: 'block' });

  test('going offline shows a banner and coming back hides it', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toHaveText(
      'Sin conexión. Finanzas necesita conexión para guardar y consultar datos.',
    );

    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).toBeHidden();
  });

  test('signed-in pages load without CSP violations', async ({ page }) => {
    const violations = recordCspViolations(page);

    for (const { path, heading } of SIGNED_IN_PAGES) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
    }

    expect(violations).toEqual([]);
  });
});

test.describe('M8 accessibility', () => {
  test('the login page passes axe and keeps focus visible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();

    expect(await axeViolations(page)).toEqual([]);

    await page.getByRole('textbox', { name: 'Correo electrónico' }).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focusIndicator = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as Element);
      return { outline: style.outlineStyle, shadow: style.boxShadow };
    });
    expect(focusIndicator.outline !== 'none' || focusIndicator.shadow !== 'none').toBe(true);
  });

  test.describe('signed in', () => {
    test.use({ storageState: authenticatedStatePath, serviceWorkers: 'block' });

    for (const { path, heading } of SIGNED_IN_PAGES) {
      test(`${path} passes axe, labels icon buttons and has 44 px tap targets on touch`, async ({
        page,
        isMobile,
      }) => {
        await page.goto(path);
        await expect(
          page.getByRole('heading', { name: heading, exact: true }).first(),
        ).toBeVisible();
        await page.waitForLoadState('networkidle');

        expect(await axeViolations(page)).toEqual([]);
        expect(await unlabelledControls(page)).toEqual([]);
        if (isMobile) {
          expect(await smallTapTargets(page)).toEqual([]);
        }
      });
    }

    test('the quick add sheet passes axe and has 44 px tap targets on touch', async ({
      page,
      isMobile,
    }) => {
      await page.goto('/movimientos');
      await page
        .getByRole('button', { name: 'Añadir movimiento' })
        .filter({ visible: true })
        .click();
      const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' });
      await expect(sheet.getByRole('textbox', { name: 'Importe' })).toBeFocused();

      expect(await axeViolations(page)).toEqual([]);
      expect(await unlabelledControls(page)).toEqual([]);
      if (isMobile) {
        expect(await smallTapTargets(page)).toEqual([]);
      }
    });
  });
});
