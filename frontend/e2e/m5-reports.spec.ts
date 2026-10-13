import { Page, expect, test } from '@playwright/test';
import { authenticatedStatePath } from './auth-state';

interface Period {
  label: string;
  start: string;
  end: string;
  month_start_day: number;
}

interface BreakdownNode {
  category_id: number;
  name: string;
  amount_cents: number;
  children: { category_id: number; name: string }[];
}

interface Summary {
  period: Period;
  income_cents: number;
  expense_cents: number;
  savings_rate_bp: number | null;
  by_category: { expense: BreakdownNode[]; income: BreakdownNode[] };
}

interface NetWorthAccount {
  id: number;
  name: string;
  archived: boolean;
  last_updated_on: string | null;
  stale: boolean;
}

interface NetWorth {
  total_cents: number;
  assets_cents: number;
  liabilities_cents: number;
  accounts: NetWorthAccount[];
}

interface Category {
  id: number;
  name: string;
  archived_at: string | null;
  children: Category[];
}

const euros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
});
const percent = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 });
const mediumDate = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function normalized(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function eur(cents: number): string {
  return normalized(euros.format(cents / 100));
}

function rate(basisPoints: number | null): string {
  return basisPoints === null ? '—' : normalized(percent.format(basisPoints / 10_000));
}

function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return normalized(mediumDate.format(new Date(Date.UTC(year, month - 1, day))).replace('.', ''));
}

function madridToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function api<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
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
      if (!response.ok) {
        throw new Error(`${method} ${path} returned ${response.status}: ${await response.text()}`);
      }
      return response.status === 204 ? null : ((await response.json()) as { data: unknown }).data;
    },
    { method, path, body },
  ) as Promise<T>;
}

async function summary(page: Page, period?: string): Promise<Summary> {
  return api<Summary>(
    page,
    'GET',
    period === undefined ? '/api/v1/reports/summary' : `/api/v1/reports/summary?period=${period}`,
  );
}

async function expenseCategory(page: Page): Promise<Category> {
  const categories = await api<Category[]>(page, 'GET', '/api/v1/categories?kind=expense');
  const category = categories.find((candidate) => candidate.archived_at === null);
  if (category === undefined) {
    throw new Error('The M5 journey needs an expense category (run M1/M2 first)');
  }
  return category;
}

async function createAccount(page: Page, name: string, type: string): Promise<number> {
  const account = await api<{ id: number }>(page, 'POST', '/api/v1/accounts', {
    name,
    type,
    opening_balance_cents: 100000,
    opening_date: madridToday(),
  });
  return account.id;
}

test.describe('M5 reports journey', () => {
  test.use({ storageState: authenticatedStatePath, serviceWorkers: 'block' });

  test('the period report matches the API, ignores transfers and drills down to movements', async ({
    page,
  }) => {
    await page.goto('/');
    const suffix = uniqueSuffix();
    const category = await expenseCategory(page);
    const leaf = category.children.find((child) => child.archived_at === null) ?? category;
    const checking = await createAccount(page, `Informe ${suffix}`, 'checking');
    const savings = await createAccount(page, `Hucha informe ${suffix}`, 'savings_investment');
    const before = await summary(page);

    const description = `Gasto informe ${suffix}`;
    await api(page, 'POST', '/api/v1/transactions', {
      type: 'expense',
      amount_cents: 1234,
      date: madridToday(),
      account_id: checking,
      category_id: leaf.id,
      description,
    });
    await api(page, 'POST', '/api/v1/transfers', {
      kind: 'transfer',
      from_account_id: checking,
      to_account_id: savings,
      amount_cents: 30000,
      date: madridToday(),
    });

    const after = await summary(page);
    expect(after.expense_cents - before.expense_cents).toBe(1234);
    expect(after.income_cents).toBe(before.income_cents);

    await page.goto('/informes');
    await expect(page.getByTestId('period-range')).toHaveText(
      `${shortDate(after.period.start)} – ${shortDate(after.period.end)}`,
    );
    await expect(page.getByTestId('summary-expense')).toContainText(eur(after.expense_cents));
    await expect(page.getByTestId('summary-income')).toContainText(eur(after.income_cents));
    await expect(page.getByTestId('summary-savings-rate')).toContainText(
      rate(after.savings_rate_bp),
    );

    const parent = after.by_category.expense.find((node) => node.category_id === category.id);
    expect(parent).toBeDefined();
    const breakdown = page.getByTestId('category-breakdown');
    await breakdown.getByTestId('breakdown-row').filter({ hasText: category.name }).first().click();
    if (parent !== undefined && parent.children.length > 0) {
      await expect(page).toHaveURL(new RegExp(`/informes\\?.*category=${category.id}`));
      await expect(page.getByTestId('drill-heading')).toHaveText(category.name);
      await page.getByRole('link', { name: `Ver los movimientos de ${category.name}` }).click();
    }
    await expect(page).toHaveURL(
      new RegExp(`/movimientos\\?period=${after.period.label}&category=${category.id}`),
    );
    await expect(page.getByTestId('transaction-row').filter({ hasText: description })).toHaveCount(
      1,
    );
  });

  test('the period switcher and month_start_day re-bucket every report', async ({ page }) => {
    await page.goto('/');
    const settings = await api<{ month_start_day: number }>(page, 'GET', '/api/v1/settings');
    const original = settings.month_start_day;
    const target = original === 25 ? 1 : 25;
    try {
      await api(page, 'PATCH', '/api/v1/settings', { month_start_day: target });
      const current = await summary(page);
      expect(current.period.month_start_day).toBe(target);
      expect(current.period.start.endsWith(`-${String(target).padStart(2, '0')}`)).toBe(true);

      await page.goto('/informes');
      await expect(page.getByTestId('period-range')).toHaveText(
        `${shortDate(current.period.start)} – ${shortDate(current.period.end)}`,
      );
      await expect(page.getByRole('button', { name: 'Periodo siguiente' })).toBeDisabled();

      await page.getByRole('button', { name: 'Periodo anterior' }).click();
      await expect(page).toHaveURL(/\/informes\?period=\d{4}-\d{2}$/);
      const previousLabel = new URL(page.url()).searchParams.get('period') ?? '';
      const previous = await summary(page, previousLabel);
      await expect(page.getByTestId('period-range')).toHaveText(
        `${shortDate(previous.period.start)} – ${shortDate(previous.period.end)}`,
      );
      await expect(page.getByTestId('summary-expense')).toContainText(eur(previous.expense_cents));

      const trend = page.getByTestId('trend-section');
      await expect(trend.locator('rect[role="button"]')).toHaveCount(12);
      await page.getByRole('button', { name: 'Ir al actual' }).click();
      await expect(page).toHaveURL(/\/informes$/);

      await page.goto('/');
      await expect(page.getByTestId('period-range')).toHaveText(
        `${shortDate(current.period.start)} – ${shortDate(current.period.end)}`,
      );
      await expect(page.getByTestId('home-expense')).toContainText(eur(current.expense_cents));
    } finally {
      await api(page, 'PATCH', '/api/v1/settings', { month_start_day: original });
    }
  });

  test('net worth shows every account with its last update and stale badges', async ({ page }) => {
    await page.goto('/');
    await createAccount(page, `Efectivo informe ${uniqueSuffix()}`, 'cash');
    const netWorth = await api<NetWorth>(page, 'GET', '/api/v1/reports/net-worth');

    await page.goto('/informes/patrimonio');
    await expect(page.getByTestId('net-worth-total')).toContainText(eur(netWorth.total_cents));
    await expect(page.getByTestId('net-worth-assets')).toContainText(eur(netWorth.assets_cents));
    const liabilities = page.getByTestId('net-worth-liabilities');
    await expect(liabilities).toContainText('Deudas');
    await expect(liabilities).not.toContainText('tarjetas');
    await expect(liabilities).toContainText(eur(netWorth.liabilities_cents));
    const rows = page.getByTestId('net-worth-account');
    await expect(rows).toHaveCount(netWorth.accounts.length);
    for (const [index, account] of netWorth.accounts.entries()) {
      const row = rows.nth(index);
      await expect(row).toContainText(account.name);
      await expect(row).toContainText(
        account.last_updated_on === null
          ? 'Sin movimientos'
          : `Actualizado el ${shortDate(account.last_updated_on)}`,
      );
      if (account.stale) {
        await expect(row).toContainText('Desactualizada');
      } else {
        await expect(row).not.toContainText('Desactualizada');
      }
    }

    await page.goto('/');
    await expect(page.getByTestId('net-worth')).toContainText(eur(netWorth.total_cents));
  });

  test('the capture quality panel shows the PRD targets', async ({ page }) => {
    await page.goto('/informes');
    const panel = page.getByRole('region', { name: 'Calidad de captura' });
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('capture-time')).toContainText('menos de 10 s');
    await expect(panel.getByTestId('capture-unedited')).toContainText('80 % o más');
    await expect(panel.getByTestId('capture-active-days')).toContainText('5 de 7 días o más');
  });
});
