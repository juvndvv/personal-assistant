import { Page, expect, test } from '@playwright/test';
import { e2eCredentials, unknownEmail } from './credentials';

const { email, password } = e2eCredentials();

async function logIn(page: Page, withEmail = email, withPassword = password): Promise<void> {
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(withEmail);
  await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill(withPassword);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

function primaryNavigation(page: Page) {
  return page.getByRole('navigation', { name: 'Navegación principal' }).filter({ visible: true });
}

test.describe('M0 auth journey', () => {
  test('health endpoint answers', async ({ request }) => {
    const response = await request.get('/up');
    expect(response.status()).toBe(200);
  });

  test('a guest is sent to the login page', async ({ page }) => {
    await page.goto('/movimientos');

    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fmovimientos$/);
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Recordarme' })).toBeChecked();
  });

  test('wrong credentials show an error', async ({ page }) => {
    await page.goto('/login');

    await logIn(page, unknownEmail(), 'definitely-not-the-password');

    await expect(page.getByRole('alert')).toContainText('Credenciales incorrectas');
    await expect(page).toHaveURL(/\/login/);
  });

  test('log in, keep the session across reloads, and log out', async ({ page, context }) => {
    await page.goto('/login');
    await logIn(page);

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
    await expect(primaryNavigation(page)).toBeVisible();

    const cookieNames = (await context.cookies()).map((cookie) => cookie.name);
    expect(cookieNames).toContain('XSRF-TOKEN');
    expect(cookieNames.some((name) => name.startsWith('remember_web_'))).toBe(true);

    await primaryNavigation(page).getByRole('link', { name: 'Movimientos' }).click();
    await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/movimientos$/);
    await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();

    await page.goto('/mas');
    await page
      .getByRole('button', { name: 'Cerrar sesión' })
      .filter({ visible: true })
      .first()
      .click();

    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});
