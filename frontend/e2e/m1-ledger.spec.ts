import { Page, expect, test } from '@playwright/test';
import { authenticatedStatePath } from './auth-state';

interface NewAccount {
  name: string;
  type: 'checking' | 'cash' | 'credit_card' | 'savings_investment';
  openingBalance: string;
  statementDay?: string;
  settlementAccount?: string;
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function createAccount(page: Page, account: NewAccount): Promise<void> {
  await page.goto('/cuentas/nueva');
  await expect(page.getByRole('heading', { name: 'Nueva cuenta' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill(account.name);
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption(account.type);
  await page
    .getByRole('textbox', { name: 'Saldo inicial', exact: true })
    .fill(account.openingBalance);
  if (account.statementDay !== undefined) {
    await page
      .getByRole('combobox', { name: 'Día de corte', exact: true })
      .selectOption(account.statementDay);
  }
  if (account.settlementAccount !== undefined) {
    await page
      .getByRole('combobox', { name: 'Cuenta de pago', exact: true })
      .selectOption({ label: account.settlementAccount });
  }
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page).toHaveURL(/\/cuentas\/\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: account.name })).toBeVisible();
}

test.describe('M1 ledger journey', () => {
  test.use({ storageState: authenticatedStatePath });

  test('create the four account types and see them grouped with balances', async ({ page }) => {
    const suffix = uniqueSuffix();
    const checking = `Corriente ${suffix}`;
    const cash = `Cartera ${suffix}`;
    const card = `Visa ${suffix}`;
    const savings = `Ahorro ${suffix}`;

    await createAccount(page, { name: checking, type: 'checking', openingBalance: '1500' });
    await createAccount(page, { name: cash, type: 'cash', openingBalance: '80,50' });
    await createAccount(page, {
      name: card,
      type: 'credit_card',
      openingBalance: '-120',
      statementDay: '5',
      settlementAccount: checking,
    });
    await expect(page.getByTestId('account-balance')).toHaveText('-120,00 €');
    await expect(page.getByText(checking)).toBeVisible();
    await createAccount(page, {
      name: savings,
      type: 'savings_investment',
      openingBalance: '10000',
    });

    await page.goto('/cuentas');
    for (const group of [
      'Cuentas corrientes',
      'Efectivo',
      'Tarjetas de crédito',
      'Ahorro e inversión',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: group })).toBeVisible();
    }
    const cardRow = page.getByRole('link', { name: new RegExp(card) });
    await expect(cardRow).toContainText('-120,00 €');
    await expect(cardRow.getByText('-120,00 €')).toHaveClass(/text-destructive/);
    await expect(page.getByRole('link', { name: new RegExp(cash) })).toContainText('80,50 €');
  });

  test('adjust a balance to a target and see the computed delta', async ({ page }) => {
    const name = `Ajustable ${uniqueSuffix()}`;
    await createAccount(page, { name, type: 'savings_investment', openingBalance: '1000' });

    await page.getByRole('button', { name: 'Ajustar saldo' }).click();
    await page.getByRole('textbox', { name: 'Saldo real', exact: true }).fill('1250,50');
    await page.getByRole('button', { name: 'Guardar ajuste' }).click();

    await expect(page.getByTestId('adjustment-delta')).toHaveText('+250,50 €');
    await page.getByRole('button', { name: 'Hecho' }).click();
    await expect(page.getByTestId('account-balance')).toHaveText('1.250,50 €');

    await page.getByRole('button', { name: 'Ajustar saldo' }).click();
    await page.getByRole('textbox', { name: 'Saldo real', exact: true }).fill('1250,50');
    await page.getByRole('button', { name: 'Guardar ajuste' }).click();
    await expect(page.getByText(/no hay nada que ajustar/i)).toBeVisible();
  });

  test('archive and unarchive an account', async ({ page }) => {
    const name = `Archivable ${uniqueSuffix()}`;
    await createAccount(page, { name, type: 'cash', openingBalance: '0' });

    await page.getByRole('button', { name: 'Archivar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Archivada');

    await page.goto('/cuentas');
    await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Mostrar archivadas' }).click();
    await page.getByRole('link', { name: new RegExp(name) }).click();

    await page.getByRole('button', { name: 'Desarchivar' }).click();
    await expect(page.getByRole('button', { name: 'Archivar', exact: true })).toBeVisible();
  });

  test('change the month start day and see the period preview', async ({ page }) => {
    await page.goto('/mas/ajustes');
    const startDay = page.getByRole('combobox', { name: 'Día de inicio del mes', exact: true });
    await expect(startDay).toBeVisible();
    const preview = page.getByTestId('period-preview');

    await startDay.selectOption('25');
    await expect(preview).toContainText(/Del 25 \S+ \d{4} al 24 \S+ \d{4}/);

    await page.getByRole('button', { name: 'Guardar ajustes' }).click();
    await page.reload();
    await expect(
      page.getByRole('combobox', { name: 'Día de inicio del mes', exact: true }),
    ).toHaveValue('25');

    await page
      .getByRole('combobox', { name: 'Día de inicio del mes', exact: true })
      .selectOption('1');
    await expect(preview).toContainText(/Del 1 \S+ \d{4} al \d{2} \S+ \d{4}/);
    await page.getByRole('button', { name: 'Guardar ajustes' }).click();
    await page.reload();
    await expect(
      page.getByRole('combobox', { name: 'Día de inicio del mes', exact: true }),
    ).toHaveValue('1');
  });
});
