import { Page, expect } from '@playwright/test';
import { e2eCredentials } from './credentials';

export async function logInAsE2eUser(page: Page): Promise<void> {
  const { email, password } = e2eCredentials();
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email);
  await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
}
