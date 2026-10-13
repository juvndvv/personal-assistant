import { Page, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { authenticatedStatePath } from './auth-state';

interface Reference {
  accountId: number;
  categoryId: number;
}

const repositoryRoot = resolve(__dirname, '..', '..');

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function madridToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function generateRecurring(date: string): void {
  execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'web', 'php', 'artisan', 'app:recurring:generate', `--date=${date}`],
    { cwd: repositoryRoot, stdio: 'inherit' },
  );
}

async function referenceData(page: Page): Promise<Reference> {
  await page.goto('/');
  return page.evaluate(async () => {
    const headers = { Accept: 'application/json' };
    const accounts = (await (await fetch('/api/v1/accounts', { headers })).json()) as {
      data: { id: number; archived_at: string | null }[];
    };
    const categories = (await (
      await fetch('/api/v1/categories?kind=expense', { headers })
    ).json()) as { data: { id: number }[] };
    const account = accounts.data.find((candidate) => candidate.archived_at === null);
    const category = categories.data[0];
    if (account === undefined || category === undefined) {
      throw new Error('The M4 journey needs an account and an expense category (run M1/M2 first)');
    }
    return { accountId: account.id, categoryId: category.id };
  });
}

interface NewTemplate {
  name: string;
  amount: string;
  variable: boolean;
}

async function createTemplate(
  page: Page,
  reference: Reference,
  template: NewTemplate,
): Promise<void> {
  await page.goto('/mas/fijos/nuevo');
  await expect(page.getByRole('heading', { name: 'Nuevo fijo' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill(template.name);
  if (template.variable) {
    await page.getByRole('checkbox', { name: 'Importe variable' }).click();
    await expect(page.getByTestId('variable-explanation')).toBeVisible();
  }
  const amountLabel = template.variable ? 'Importe estimado' : 'Importe';
  await page.getByRole('textbox', { name: amountLabel, exact: true }).fill(template.amount);
  await page
    .getByRole('combobox', { name: 'Cuenta', exact: true })
    .selectOption(String(reference.accountId));
  await page
    .getByRole('combobox', { name: 'Categoría', exact: true })
    .selectOption(String(reference.categoryId));
  await expect(page.getByRole('combobox', { name: 'Frecuencia', exact: true })).toHaveValue(
    'monthly',
  );
  await expect(page.getByRole('combobox', { name: 'Día del mes', exact: true })).toHaveValue(
    String(Number(madridToday().slice(8, 10))),
  );
  await page.getByRole('textbox', { name: 'Descripción', exact: true }).fill(template.name);
  await page.getByRole('button', { name: 'Crear fijo' }).click();
  await expect(page).toHaveURL(/\/mas\/fijos$/);
}

async function deleteTemplate(page: Page, name: string): Promise<void> {
  await page.goto('/mas/fijos');
  await page.getByRole('button', { name: `Eliminar ${name}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar fijo' });
  await dialog.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByTestId('recurring-row').filter({ hasText: name })).toHaveCount(0);
}

interface ForecastEntry {
  template_name: string;
  status: 'upcoming' | 'awaiting_amount' | 'posted' | 'skipped';
  amount_cents: number;
  due_date: string;
}

async function forecastEntry(page: Page, name: string): Promise<ForecastEntry | undefined> {
  const forecast = await page.evaluate(async () => {
    const response = await fetch('/api/v1/recurring/forecast', {
      headers: { Accept: 'application/json' },
    });
    return (await response.json()) as { data: { items: ForecastEntry[] } };
  });
  return forecast.data.items.find((item) => item.template_name === name);
}

async function openVariableDraft(page: Page, name: string) {
  await page.goto('/pendientes');
  const draftRow = page.getByTestId('draft-row').filter({ hasText: name });
  await expect(draftRow).toHaveCount(1);
  await expect(draftRow).toContainText('Introduce el importe real');
  await draftRow.click();
  return page.getByRole('dialog', { name });
}

async function movementRows(page: Page, search: string) {
  await page.goto('/movimientos');
  await page.getByRole('textbox', { name: 'Buscar' }).fill(search);
  return page.getByTestId('transaction-row').filter({ hasText: search });
}

test.describe('M4 recurring journey', () => {
  test.use({ storageState: authenticatedStatePath, serviceWorkers: 'block' });

  test('fixed templates post a Fijo movement once and variable ones ask for the real amount', async ({
    page,
  }) => {
    const reference = await referenceData(page);
    const suffix = uniqueSuffix();
    const fixedName = `Alquiler E2E ${suffix}`;
    const variableName = `Luz E2E ${suffix}`;
    const today = madridToday();

    await createTemplate(page, reference, { name: fixedName, amount: '850', variable: false });
    await createTemplate(page, reference, { name: variableName, amount: '60', variable: true });

    const variableRow = page.getByTestId('recurring-row').filter({ hasText: variableName });
    await expect(variableRow).toContainText('Variable');
    await expect(variableRow).toContainText('Mensual');

    generateRecurring(today);
    generateRecurring(today);

    await page.goto('/');
    const forecast = page.getByRole('region', { name: 'Fijos pendientes este periodo' });
    const awaitingItem = forecast.getByTestId('forecast-item').filter({ hasText: variableName });
    await expect(awaitingItem).toBeVisible();
    await expect(awaitingItem).toContainText('Falta el importe');
    await expect(awaitingItem.getByRole('link')).toHaveAttribute('href', '/pendientes');
    await expect(forecast.getByTestId('forecast-item').filter({ hasText: fixedName })).toHaveCount(
      0,
    );

    const fixedRows = await movementRows(page, fixedName);
    await expect(fixedRows).toHaveCount(1);
    await expect(fixedRows.getByTestId('origin-badge')).toHaveText('Fijo');
    await expect(fixedRows.getByTestId('transaction-amount')).toHaveText('-850,00 €');

    await expect(await movementRows(page, variableName)).toHaveCount(0);

    const sheet = await openVariableDraft(page, variableName);
    const amount = sheet.getByRole('textbox', { name: 'Importe real' });
    await expect(amount).toBeFocused();
    await amount.fill('64,37');
    await sheet.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByTestId('draft-row').filter({ hasText: variableName })).toHaveCount(0);

    const variableRows = await movementRows(page, variableName);
    await expect(variableRows).toHaveCount(1);
    await expect(variableRows.getByTestId('origin-badge')).toHaveText('Fijo');
    await expect(variableRows.getByTestId('transaction-amount')).toHaveText('-64,37 €');

    generateRecurring(today);
    await expect(await movementRows(page, variableName)).toHaveCount(1);
    await page.goto('/pendientes');
    await expect(page.getByTestId('draft-row').filter({ hasText: variableName })).toHaveCount(0);

    await page.goto('/');
    await expect(forecast).toBeVisible();
    await expect(forecast.getByTestId('posted-totals')).toContainText('Ya registrados:');
    await expect(
      forecast.getByTestId('forecast-item').filter({ hasText: variableName }),
    ).toHaveCount(0);
    expect(await forecastEntry(page, fixedName)).toMatchObject({
      status: 'posted',
      amount_cents: 85000,
      due_date: today,
    });
    expect(await forecastEntry(page, variableName)).toMatchObject({
      status: 'posted',
      amount_cents: 6437,
      due_date: today,
    });

    await deleteTemplate(page, fixedName);
    await deleteTemplate(page, variableName);
  });

  test('a variable bill that never arrives can be skipped for the month', async ({ page }) => {
    const reference = await referenceData(page);
    const name = `Agua E2E ${uniqueSuffix()}`;
    const today = madridToday();
    await createTemplate(page, reference, { name, amount: '25', variable: true });

    generateRecurring(today);
    expect(await forecastEntry(page, name)).toMatchObject({ status: 'awaiting_amount' });

    const sheet = await openVariableDraft(page, name);
    await sheet.getByRole('button', { name: 'Omitir este mes' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('draft-row').filter({ hasText: name })).toHaveCount(0);

    generateRecurring(today);
    await page.goto('/pendientes');
    await expect(page.getByTestId('draft-row').filter({ hasText: name })).toHaveCount(0);
    await expect(await movementRows(page, name)).toHaveCount(0);
    expect(await forecastEntry(page, name)).toMatchObject({ status: 'skipped', due_date: today });

    await page.goto('/');
    const forecast = page.getByRole('region', { name: 'Fijos pendientes este periodo' });
    await expect(forecast).toBeVisible();
    await expect(forecast.getByTestId('forecast-item').filter({ hasText: name })).toHaveCount(0);

    await deleteTemplate(page, name);
  });

  test('a paused template is shown as paused and can be resumed', async ({ page }) => {
    const reference = await referenceData(page);
    const name = `Gimnasio E2E ${uniqueSuffix()}`;
    await createTemplate(page, reference, { name, amount: '35', variable: false });

    const row = page.getByTestId('recurring-row').filter({ hasText: name });
    await row.getByRole('button', { name: `Pausar ${name}` }).click();
    await expect(row).toContainText('Pausado');
    await row.getByRole('button', { name: `Reanudar ${name}` }).click();
    await expect(row).not.toContainText('Pausado');

    await deleteTemplate(page, name);
  });
});
