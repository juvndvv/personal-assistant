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

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];
const THEME_STORAGE_KEY = 'finanzas.theme';

async function expectTheme(page: Page, theme: Theme): Promise<void> {
  const root = page.locator('html');
  if (theme === 'dark') {
    await expect(root).toHaveClass(/(^|\s)dark(\s|$)/);
  } else {
    await expect(root).not.toHaveClass(/(^|\s)dark(\s|$)/);
  }
}

function madridToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function stubDraftForReview(page: Page): Promise<number> {
  await page.goto('/');
  const reference = await page.evaluate(async () => {
    const headers = { Accept: 'application/json' };
    const accounts = (await (await fetch('/api/v1/accounts', { headers })).json()) as {
      data: { id: number; archived_at: string | null }[];
    };
    const categories = (await (
      await fetch('/api/v1/categories?kind=expense', { headers })
    ).json()) as { data: { id: number }[] };
    return {
      accountId: accounts.data.find((candidate) => candidate.archived_at === null)?.id ?? null,
      categoryId: categories.data[0]?.id ?? null,
    };
  });
  const draftId = 980_000 + Math.floor(Math.random() * 9_000);
  const now = new Date().toISOString();
  await page.route(new RegExp(`/api/v1/drafts/${draftId}$`), (route) =>
    route.fulfill({
      json: {
        data: {
          id: draftId,
          origin: 'voice',
          status: 'pending',
          proposal: {
            type: 'expense',
            amount_cents: 1250,
            date: madridToday(),
            account_id: reference.accountId,
            to_account_id: null,
            category_id: reference.categoryId,
            description: 'Compra',
            merchant: 'Mercadona',
          },
          confidence: { amount_cents: 0.95, category_id: 0.4, account_id: 0.95, date: 1 },
          field_sources: {
            type: 'ai',
            amount_cents: 'ai',
            date: 'default',
            account_id: 'history',
            category_id: 'ai',
            description: 'ai',
            merchant: 'ai',
          },
          low_confidence_fields: ['category_id'],
          capture: {
            id: `e2e-axe-capture-${draftId}`,
            kind: 'voice',
            status: 'completed',
            transcript: 'Doce cincuenta en Mercadona',
            error: null,
            transcription_ms: 700,
            extraction_ms: 1200,
            attachments: [],
            created_at: now,
          },
          recurring: null,
          transaction_id: null,
          transfer_id: null,
          corrected_fields: null,
          confirmed_at: null,
          discarded_at: null,
          created_at: now,
        },
      },
    }),
  );
  return draftId;
}

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

  test.describe('dark theme controls', () => {
    test.use({ colorScheme: 'dark' });

    test('a ticked checkbox is filled with the primary colour', async ({ page }) => {
      await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
        THEME_STORAGE_KEY,
        'dark',
      ] as const);
      await page.goto('/login');
      await expectTheme(page, 'dark');

      const checkbox = page.getByRole('checkbox', { name: 'Recordarme' });
      await expect(checkbox).toBeChecked();

      const colours = await checkbox.evaluate((element) => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--primary)';
        document.body.append(probe);
        const primary = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { fill: getComputedStyle(element).backgroundColor, primary };
      });
      expect(colours.fill).toBe(colours.primary);
    });
  });

  for (const theme of THEMES) {
    test.describe(`signed in, ${theme} theme`, () => {
      test.use({
        storageState: authenticatedStatePath,
        serviceWorkers: 'block',
        colorScheme: theme,
      });

      test.beforeEach(async ({ page }) => {
        await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
          THEME_STORAGE_KEY,
          theme,
        ] as const);
      });

      for (const { path, heading } of SIGNED_IN_PAGES) {
        test(`${path} passes axe, labels icon buttons and has 44 px tap targets on touch`, async ({
          page,
          isMobile,
        }) => {
          await page.goto(path);
          await expect(
            page.getByRole('heading', { name: heading, exact: true }).first(),
          ).toBeVisible();
          await expectTheme(page, theme);
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
        await expect(sheet.getByRole('button', { name: 'Guardar', exact: true })).toBeVisible();
        await expect(sheet.getByRole('textbox', { name: 'Importe' })).not.toBeFocused();
        await expectTheme(page, theme);

        expect(await axeViolations(page)).toEqual([]);
        expect(await unlabelledControls(page)).toEqual([]);
        if (isMobile) {
          expect(await smallTapTargets(page)).toEqual([]);
        }
      });

      test('a draft review passes axe and has 44 px tap targets on touch', async ({
        page,
        isMobile,
      }) => {
        const draftId = await stubDraftForReview(page);
        await page.goto(`/pendientes/${draftId}`);
        await expect(
          page.getByRole('heading', { name: 'Revisar movimiento', exact: true }),
        ).toBeVisible();
        await expect(page.locator('app-review-field').first()).toBeVisible();
        await expectTheme(page, theme);
        await page.waitForLoadState('networkidle');

        expect(await axeViolations(page)).toEqual([]);
        expect(await unlabelledControls(page)).toEqual([]);
        if (isMobile) {
          expect(await smallTapTargets(page)).toEqual([]);
        }
      });
    });
  }
});
