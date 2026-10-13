import { Locator, Page, expect, test } from '@playwright/test';
import { authenticatedStatePath } from './auth-state';

interface NewAccount {
  name: string;
  type: 'checking' | 'cash' | 'credit_card' | 'savings_investment';
  openingBalance: string;
  openingDate?: string;
  statementDay?: number;
}

interface CreatedAccount {
  id: string;
  name: string;
}

function normalizedText(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function madridDate(daysAgo = 0): { iso: string; day: number } {
  const moment = new Date(Date.now() - daysAgo * 86_400_000);
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(moment);
  return { iso, day: Number(iso.slice(8, 10)) };
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function createAccount(page: Page, account: NewAccount): Promise<CreatedAccount> {
  await page.goto('/cuentas/nueva');
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill(account.name);
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption(account.type);
  await page
    .getByRole('textbox', { name: 'Saldo inicial', exact: true })
    .fill(account.openingBalance);
  if (account.openingDate !== undefined) {
    await page.getByLabel('Fecha del saldo inicial', { exact: true }).fill(account.openingDate);
  }
  if (account.statementDay !== undefined) {
    await page
      .getByRole('combobox', { name: 'Día de corte', exact: true })
      .selectOption(String(account.statementDay));
  }
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/cuentas\/\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: account.name })).toBeVisible();
  const id = /\/cuentas\/(\d+)$/.exec(page.url())?.[1];
  if (id === undefined) {
    throw new Error('Account id not found in URL');
  }
  return { id, name: account.name };
}

const E2E_CATEGORY = 'Compras E2E';

async function ensureExpenseCategory(page: Page): Promise<void> {
  await page.goto('/');
  const expenseCount = await page.evaluate(async () => {
    const response = await fetch('/api/v1/categories?kind=expense', {
      headers: { Accept: 'application/json' },
    });
    const body = (await response.json()) as { data: unknown[] };
    return body.data.length;
  });
  if (expenseCount > 0) {
    return;
  }
  await page.goto('/mas/categorias');
  await page.getByRole('button', { name: 'Nueva categoría' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill(E2E_CATEGORY);
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByText(E2E_CATEGORY).first()).toBeVisible();
}

function plusButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Añadir movimiento' }).filter({ visible: true });
}

function quickAdd(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Nuevo movimiento' });
}

function categoryChips(page: Page): Locator {
  return quickAdd(page).getByTestId('quick-add-categories').getByRole('button');
}

async function addExpenseWithDetails(
  page: Page,
  amount: string,
  account: CreatedAccount,
  description: string,
  date?: string,
): Promise<void> {
  await plusButton(page).click();
  const sheet = quickAdd(page);
  await expect(sheet.getByRole('textbox', { name: 'Importe' })).toBeFocused();
  await page.keyboard.type(amount);
  await categoryChips(page).first().click();
  await sheet.getByRole('button', { name: 'Más detalles' }).click();
  await sheet.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption(account.id);
  await sheet.getByRole('textbox', { name: 'Descripción' }).fill(description);
  if (date !== undefined) {
    await sheet.getByLabel('Fecha', { exact: true }).fill(date);
  }
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText('Gasto guardado').first()).toBeVisible();
}

async function accountBalance(page: Page, account: CreatedAccount): Promise<string> {
  await page.goto(`/cuentas/${account.id}`);
  const balance = page.getByTestId('account-balance');
  await expect(balance).toBeVisible();
  return normalizedText(await balance.textContent());
}

async function netWorth(page: Page): Promise<string> {
  await page.goto('/');
  const total = page.getByTestId('net-worth');
  await expect(total).toBeVisible();
  return normalizedText(await total.textContent());
}

async function periodTotals(page: Page): Promise<[string, string]> {
  await page.goto('/movimientos?period=all');
  await expect(page.getByTestId('list-scope')).toHaveText('Todo el historial');
  await expect(page.getByTestId('transaction-row').first()).toBeVisible();
  return [
    normalizedText(await page.getByTestId('total-income').textContent()),
    normalizedText(await page.getByTestId('total-expense').textContent()),
  ];
}

test.describe('M2 movements journey', () => {
  test.use({ storageState: authenticatedStatePath });

  test.beforeEach(async ({ page }) => {
    await ensureExpenseCategory(page);
  });

  test('quick add saves an expense with defaults in 3 clicks on the last used account', async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const account = await createAccount(page, {
      name: `Rápida ${suffix}`,
      type: 'checking',
      openingBalance: '500',
    });
    await addExpenseWithDetails(page, '1', account, `Primer gasto ${suffix}`);
    await expect(page.getByText('Gasto guardado')).toBeVisible();

    await page.goto('/movimientos');
    let clicks = 0;
    const tap = async (target: Locator) => {
      clicks += 1;
      await target.click();
    };

    await tap(plusButton(page));
    const sheet = quickAdd(page);
    await expect(sheet.getByRole('textbox', { name: 'Importe' })).toBeFocused();
    await expect(sheet.getByTestId('quick-add-summary')).toHaveText(`Hoy · ${account.name}`);
    await page.keyboard.type('12,34');
    const chip = categoryChips(page).first();
    const category = ((await chip.textContent()) ?? '').trim();
    await tap(chip);
    await tap(page.getByRole('button', { name: 'Guardar', exact: true }));

    await expect(sheet).toBeHidden();
    expect(clicks).toBe(3);
    await expect(page.getByText('Gasto guardado')).toBeVisible();

    await page.goto(`/cuentas/${account.id}`);
    await expect(page.getByTestId('account-balance')).toHaveText('486,66 €');
    const row = page.getByTestId('transaction-row').filter({ hasText: category }).first();
    await expect(row.getByTestId('transaction-amount')).toHaveText('-12,34 €');
  });

  test('a transfer moves both balances and leaves net worth and totals unchanged', async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const from = await createAccount(page, {
      name: `Origen ${suffix}`,
      type: 'checking',
      openingBalance: '1000',
    });
    const to = await createAccount(page, {
      name: `Destino ${suffix}`,
      type: 'savings_investment',
      openingBalance: '0',
    });
    const worthBefore = await netWorth(page);
    const totalsBefore = await periodTotals(page);

    await page.goto('/movimientos');
    await page.getByRole('button', { name: 'Transferencia', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Nueva transferencia' });
    await form.getByRole('combobox', { name: 'Desde' }).selectOption(from.id);
    await form.getByRole('combobox', { name: 'Hacia' }).selectOption(to.id);
    await form.getByRole('textbox', { name: 'Importe' }).fill('100');
    await page.getByRole('button', { name: 'Guardar transferencia' }).click();
    await expect(form).toBeHidden();

    expect(await accountBalance(page, from)).toBe('900,00 €');
    expect(await accountBalance(page, to)).toBe('100,00 €');
    expect(await netWorth(page)).toBe(worthBefore);
    expect(await periodTotals(page)).toEqual(totalsBefore);

    await page.goto('/movimientos');
    const route = `${from.name} → ${to.name}`;
    await expect(page.getByText(route)).toHaveCount(1);
    await page.getByRole('button', { name: `Editar ${route}` }).click();
    const edit = page.getByRole('dialog', { name: 'Editar transferencia' });
    const amount = edit.getByRole('textbox', { name: 'Importe' });
    await expect(amount).toHaveValue('100,00');
    await amount.fill('40');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(edit).toBeHidden();
    expect(await accountBalance(page, from)).toBe('960,00 €');
    expect(await accountBalance(page, to)).toBe('40,00 €');

    await page.goto('/movimientos');
    await page.getByRole('button', { name: `Acciones de ${route}` }).click();
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();
    await expect(page.getByText('Transferencia eliminada')).toBeVisible();
    expect(await accountBalance(page, from)).toBe('1.000,00 €');
    expect(await accountBalance(page, to)).toBe('0,00 €');
  });

  test('card settlement prefills the debt, zeroes the card and is not an expense', async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const bank = await createAccount(page, {
      name: `Banco ${suffix}`,
      type: 'checking',
      openingBalance: '1000',
    });
    const card = await createAccount(page, {
      name: `Tarjeta ${suffix}`,
      type: 'credit_card',
      openingBalance: '0',
    });
    await addExpenseWithDetails(page, '30', card, `Compra tarjeta ${suffix}`);

    await page.goto(`/cuentas/${card.id}`);
    await expect(page.getByTestId('account-balance')).toHaveText('-30,00 €');
    await page.getByRole('button', { name: 'Liquidar tarjeta' }).click();
    const sheet = page.getByRole('dialog', { name: 'Liquidar tarjeta' });
    await expect(sheet.getByTestId('suggested-amount')).toHaveText('30,00 €');
    await expect(sheet.getByRole('textbox', { name: 'Importe' })).toHaveValue('30,00');
    await sheet.getByRole('combobox', { name: 'Cuenta de pago' }).selectOption(bank.id);
    await sheet.getByRole('button', { name: 'Liquidar', exact: true }).click();
    await expect(sheet).toBeHidden();

    await expect(page.getByTestId('account-balance')).toHaveText('0,00 €');
    expect(await accountBalance(page, bank)).toBe('970,00 €');

    await page.goto(`/movimientos?period=all&account=${card.id}&type=expense`);
    await expect(page.getByTestId('transaction-row')).toHaveCount(1);
    await expect(page.getByTestId('total-expense')).toHaveText('30,00 €');
    await page.goto(`/movimientos?period=all&account=${bank.id}&type=expense`);
    await expect(page.getByText('No hay movimientos')).toBeVisible();
    await page.goto(`/movimientos?period=all&account=${bank.id}&type=transfer`);
    await expect(page.getByText('Liquidación de tarjeta')).toBeVisible();
  });

  test('paying a card through the generic transfer form counts as a settlement', async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const today = madridDate();
    const statementDay = today.day < 28 ? today.day + 1 : 1;
    const bank = await createAccount(page, {
      name: `Banco pago ${suffix}`,
      type: 'checking',
      openingBalance: '1000',
    });
    const card = await createAccount(page, {
      name: `Tarjeta pago ${suffix}`,
      type: 'credit_card',
      openingBalance: '0',
      openingDate: madridDate(70).iso,
      statementDay,
    });
    await addExpenseWithDetails(page, '30', card, `Compra extracto ${suffix}`, madridDate(45).iso);

    await page.goto('/movimientos');
    await page.getByRole('button', { name: 'Transferencia', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Nueva transferencia' });
    await form.getByRole('combobox', { name: 'Desde' }).selectOption(bank.id);
    await form.getByRole('combobox', { name: 'Hacia' }).selectOption(card.id);
    await form.getByRole('textbox', { name: 'Importe' }).fill('30');
    await page.getByRole('button', { name: 'Guardar transferencia' }).click();
    await expect(form).toBeHidden();

    await page.goto(`/cuentas/${card.id}`);
    await expect(page.getByTestId('account-balance')).toHaveText('0,00 €');
    await page.getByRole('button', { name: 'Liquidar tarjeta' }).click();
    const sheet = page.getByRole('dialog', { name: 'Liquidar tarjeta' });
    await expect(sheet.getByTestId('suggested-amount')).toHaveText('0,00 €');

    await page.goto(`/movimientos?period=all&account=${bank.id}&type=transfer`);
    await expect(page.getByText('Liquidación de tarjeta')).toBeVisible();
  });

  test('search is accent and case insensitive and filters combine through the URL', async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const account = await createAccount(page, {
      name: `Búsqueda ${suffix}`,
      type: 'cash',
      openingBalance: '100',
    });
    const description = `Café Ñandú ${suffix}`;
    await addExpenseWithDetails(page, '2,40', account, description);

    await page.goto('/movimientos');
    await page.getByRole('textbox', { name: 'Buscar' }).fill(`CAFE nandu ${suffix}`);
    await expect(page).toHaveURL(/q=CAFE/);
    await expect(page.getByText(description)).toBeVisible();
    await expect(page.getByTestId('transaction-row')).toHaveCount(1);

    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    const filters = page.getByRole('dialog', { name: 'Filtros' });
    await filters.getByRole('checkbox', { name: 'Ingreso' }).click();
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page).toHaveURL(/type=income/);
    await expect(page.getByText('No hay movimientos')).toBeVisible();

    await page.goto(
      `/movimientos?q=${encodeURIComponent(suffix)}&type=income&type=expense&account=${account.id}`,
    );
    await expect(page.getByText(description)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filtros (2)' })).toBeVisible();
  });

  test('edit a movement and delete it with undo', async ({ page }) => {
    const suffix = uniqueSuffix();
    const account = await createAccount(page, {
      name: `Edición ${suffix}`,
      type: 'cash',
      openingBalance: '50',
    });
    const description = `Editable ${suffix}`;
    await addExpenseWithDetails(page, '5', account, description);

    await page.goto(`/cuentas/${account.id}`);
    await page.getByRole('button', { name: `Editar ${description}` }).click();
    const edit = page.getByRole('dialog', { name: 'Editar movimiento' });
    await edit.getByRole('textbox', { name: 'Importe' }).fill('7,25');
    await edit.getByRole('combobox', { name: 'Etiquetas' }).fill(`etiqueta ${suffix}`);
    await edit.getByRole('combobox', { name: 'Etiquetas' }).press('Enter');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(edit).toBeHidden();
    await expect(page.getByTestId('account-balance')).toHaveText('42,75 €');
    const row = page.getByTestId('transaction-row').filter({ hasText: description });
    await expect(row.getByTestId('transaction-amount')).toHaveText('-7,25 €');
    await expect(row).toContainText(`#etiqueta ${suffix}`);

    await page.getByRole('button', { name: `Acciones de ${description}` }).click();
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();
    await expect(page.getByTestId('account-balance')).toHaveText('50,00 €');
    await expect(row).toHaveCount(0);

    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByTestId('account-balance')).toHaveText('42,75 €');
    await expect(row).toHaveCount(1);
  });

  test('rename collisions on tags show a clear message', async ({ page }) => {
    const suffix = uniqueSuffix();
    const account = await createAccount(page, {
      name: `Etiquetas ${suffix}`,
      type: 'cash',
      openingBalance: '10',
    });
    await plusButton(page).click();
    const sheet = quickAdd(page);
    await expect(sheet.getByRole('textbox', { name: 'Importe' })).toBeFocused();
    await page.keyboard.type('1');
    await categoryChips(page).first().click();
    await sheet.getByRole('button', { name: 'Más detalles' }).click();
    await sheet.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption(account.id);
    const tags = sheet.getByRole('combobox', { name: 'Etiquetas' });
    await tags.fill(`alfa ${suffix}`);
    await tags.press('Enter');
    await tags.fill(`beta ${suffix}`);
    await tags.press('Enter');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Gasto guardado')).toBeVisible();

    await page.goto('/mas/etiquetas');
    await page.getByRole('button', { name: `Renombrar beta ${suffix}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Renombrar etiqueta' });
    await dialog.getByRole('textbox', { name: 'Nombre' }).fill(`ALFA ${suffix}`);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByText('Ya existe una etiqueta con ese nombre.')).toBeVisible();
  });
});
