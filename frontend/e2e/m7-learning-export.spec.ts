import { readFile } from 'node:fs/promises';
import { Download, Locator, Page, expect, test } from '@playwright/test';
import { authenticatedStatePath } from './auth-state';

interface Created {
  id: number;
  name: string;
}

interface CategorizationSuggestion {
  category_id: number | null;
  account_id: number | null;
  source: string;
  hits: number;
}

const CSV_COLUMNS = [
  'id',
  'date',
  'type',
  'account',
  'account_type',
  'category',
  'parent_category',
  'amount_cents',
  'amount_eur',
  'description',
  'merchant',
  'note',
  'tags',
  'origin',
  'transfer_id',
  'transfer_kind',
  'transfer_leg',
  'counter_account',
  'adjustment_target_cents',
  'recurring_template',
  'attachments_count',
  'created_at',
];

const ARCHIVE_FILES = [
  'accounts.csv',
  'categories.csv',
  'transactions.csv',
  'transfers.csv',
  'tags.csv',
  'recurring_templates.csv',
  'budgets.csv',
  'attachments.csv',
  'settings.csv',
];

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

async function request(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const cookie = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
      const token = decodeURIComponent(cookie?.slice('XSRF-TOKEN='.length) ?? '');
      const response = await fetch(path, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-XSRF-TOKEN': token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      const parsed = text === '' ? null : (JSON.parse(text) as { data?: unknown });
      return { status: response.status, data: parsed?.data ?? parsed };
    },
    { method, path, body },
  );
}

async function api<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  const response = await request(page, method, path, body);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} returned ${response.status}`);
  }
  return response.data as T;
}

async function createAccount(page: Page, name: string): Promise<Created> {
  return api<Created>(page, 'POST', '/api/v1/accounts', {
    name,
    type: 'checking',
    opening_balance_cents: 100000,
    opening_date: madridToday(),
  });
}

async function createExpenseCategory(page: Page, name: string): Promise<Created> {
  return api<Created>(page, 'POST', '/api/v1/categories', { kind: 'expense', name });
}

async function downloadedText(download: Download): Promise<string> {
  const path = await download.path();
  return (await readFile(path)).toString('utf8');
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && text[index + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      index += 1;
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function saveTransaction(
  page: Page,
  method: 'POST' | 'PATCH',
  button: Locator,
): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === method &&
        new URL(response.url()).pathname.startsWith('/api/v1/transactions') &&
        response.ok(),
    ),
    button.click(),
  ]);
}

test.describe('M7 learned suggestions and export journey', () => {
  test.use({ storageState: authenticatedStatePath, serviceWorkers: 'block' });

  test('one correction of a merchant teaches the manual form its category and account', async ({
    page,
  }) => {
    await page.goto('/');
    const suffix = uniqueSuffix();
    const merchant = `E2E Comercio ${suffix}`;
    const description = `Aprendizaje ${suffix}`;
    const wrong = await createExpenseCategory(page, `E2E Ocio ${suffix}`);
    const right = await createExpenseCategory(page, `E2E Súper ${suffix}`);
    const original = await createAccount(page, `E2E Original ${suffix}`);
    const learned = await createAccount(page, `E2E Aprendida ${suffix}`);
    await api(page, 'POST', '/api/v1/transactions', {
      type: 'expense',
      amount_cents: 1999,
      date: madridToday(),
      account_id: original.id,
      category_id: wrong.id,
      merchant,
      description,
    });

    await page.goto(`/cuentas/${original.id}`);
    await page.getByRole('button', { name: `Editar ${description}` }).click();
    const edit = page.getByRole('dialog', { name: 'Editar movimiento' });
    await edit.getByRole('combobox', { name: /categoría/i }).selectOption(String(right.id));
    await edit.getByRole('combobox', { name: /cuenta/i }).selectOption(String(learned.id));
    await saveTransaction(page, 'PATCH', page.getByRole('button', { name: 'Guardar cambios' }));
    await expect(edit).toBeHidden();

    const suggestion = await api<CategorizationSuggestion>(
      page,
      'GET',
      `/api/v1/suggestions/categorization?type=expense&merchant=${encodeURIComponent(merchant)}`,
    );
    expect(suggestion).toMatchObject({
      category_id: right.id,
      account_id: learned.id,
      source: 'history',
    });

    await page.goto('/movimientos');
    await page.getByRole('button', { name: 'Añadir movimiento' }).filter({ visible: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' });
    await expect(sheet.getByRole('textbox', { name: 'Importe' })).toBeFocused();
    await page.keyboard.type('4,20');
    await sheet.getByRole('button', { name: 'Más detalles' }).click();
    await sheet.getByRole('textbox', { name: 'Comercio' }).fill(merchant.toUpperCase());
    await sheet.getByRole('textbox', { name: 'Comercio' }).press('Tab');

    await expect(sheet.getByTestId('history-suggestion')).toHaveText(/Sugerido por tu historial/);
    await expect(
      sheet.getByTestId('quick-add-categories').getByRole('button', { name: right.name }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('combobox', { name: 'Cuenta', exact: true })).toHaveValue(
      String(learned.id),
    );

    await saveTransaction(page, 'POST', page.getByRole('button', { name: 'Guardar', exact: true }));
    await expect(sheet).toBeHidden();
    const saved = await api<{ category: { id: number } | null }[]>(
      page,
      'GET',
      `/api/v1/transactions?account_id[]=${learned.id}&category_id[]=${right.id}`,
    );
    expect(saved).toHaveLength(2);
  });

  test('the draft review marks fields that come from history', async ({ page }) => {
    await page.goto('/');
    const accounts = await api<{ id: number; archived_at: string | null }[]>(
      page,
      'GET',
      '/api/v1/accounts',
    );
    const categories = await api<{ id: number }[]>(page, 'GET', '/api/v1/categories?kind=expense');
    const account = accounts.find((candidate) => candidate.archived_at === null);
    const category = categories[0];
    if (account === undefined || category === undefined) {
      throw new Error('The M7 journey needs an account and an expense category');
    }
    const draftId = 990_000 + Math.floor(Math.random() * 9_000);
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
              account_id: account.id,
              to_account_id: null,
              category_id: category.id,
              description: 'Compra',
              merchant: 'Mercadona',
            },
            confidence: { amount_cents: 0.95, category_id: 0.95, account_id: 0.95, date: 1 },
            field_sources: {
              type: 'ai',
              amount_cents: 'ai',
              date: 'default',
              account_id: 'history',
              category_id: 'history',
              description: 'ai',
              merchant: 'ai',
            },
            low_confidence_fields: [],
            capture: {
              id: `e2e-capture-${draftId}`,
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

    await page.goto(`/pendientes/${draftId}`);

    for (const field of ['category_id', 'account_id']) {
      await expect(
        page.locator(`app-review-field[data-field="${field}"]`).getByTestId('field-source'),
      ).toHaveText('De tu historial');
    }
    await expect(
      page.locator('app-review-field[data-field="amount_cents"]').getByTestId('field-source'),
    ).toHaveText('IA');
  });

  test('the filtered CSV export matches the list, includes tags and round-trips cents', async ({
    page,
  }) => {
    await page.goto('/');
    const suffix = uniqueSuffix();
    const description = `Exportable ${suffix}`;
    const account = await createAccount(page, `E2E Export ${suffix}`);
    const category = await createExpenseCategory(page, `E2E Export ${suffix}`);
    for (const amount of [1234, 5]) {
      await api(page, 'POST', '/api/v1/transactions', {
        type: 'expense',
        amount_cents: amount,
        date: madridToday(),
        account_id: account.id,
        category_id: category.id,
        description,
        merchant: '=HYPERLINK("x")',
        tags: [`viaje-${suffix}`, `roma-${suffix}`],
      });
    }

    await page.goto(
      `/movimientos?period=all&q=${encodeURIComponent(description)}&account=${account.id}`,
    );
    await expect(page.getByTestId('transaction-row')).toHaveCount(2);
    const link = page.getByRole('link', { name: 'Exportar CSV' });
    const href = (await link.getAttribute('href')) ?? '';
    expect(href).toContain('/api/v1/exports/transactions.csv?');
    expect(href).toContain('delimiter=semicolon');

    const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
    const text = await downloadedText(download);
    expect(text.startsWith('﻿')).toBe(true);
    const [header, ...rows] = parseCsv(text.slice(1), ';');
    expect(header).toEqual(CSV_COLUMNS);
    expect(rows).toHaveLength(2);
    const column = (name: string) => CSV_COLUMNS.indexOf(name);
    const cents = rows.map((row) => Number(row[column('amount_cents')])).sort((a, b) => a - b);
    expect(cents).toEqual([-1234, -5]);
    const euros = rows.map((row) => row[column('amount_eur')]).sort();
    expect(euros).toEqual(['-0,05', '-12,34']);
    for (const row of rows) {
      expect(row[column('description')]).toBe(description);
      expect(row[column('merchant')]).toBe(`'=HYPERLINK("x")`);
      expect(row[column('tags')]?.split('|').sort()).toEqual(
        [`roma-${suffix}`, `viaje-${suffix}`].sort(),
      );
    }
  });

  test('the full ZIP export contains every entity', async ({ page }) => {
    await page.goto('/mas');
    await page.getByRole('link', { name: /Exportar datos/ }).click();
    await expect(page.getByRole('heading', { name: 'Exportar datos' })).toBeVisible();
    const link = page.getByRole('link', { name: 'Descargar exportación completa (ZIP)' });
    await expect(link).toHaveAttribute('href', '/api/v1/exports/full.zip');
    const receipts = page.getByRole('checkbox', { name: /Incluir justificantes/ });
    await receipts.click();
    await expect(receipts).toHaveAttribute('aria-checked', 'true');
    await expect(link).toHaveAttribute('href', '/api/v1/exports/full.zip?include_receipts=1');

    const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
    const archive = await readFile(await download.path());
    expect(archive.subarray(0, 2).toString('latin1')).toBe('PK');
    const listing = archive.toString('latin1');
    for (const file of ARCHIVE_FILES) {
      expect(listing).toContain(file);
    }
  });
});
