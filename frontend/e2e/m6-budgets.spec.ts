import { Page, expect, test } from '@playwright/test';
import { authenticatedStatePath } from './auth-state';

interface Period {
  label: string;
  start: string;
  end: string;
}

interface CategorySummary {
  id: number;
  name: string;
  kind: 'expense' | 'income';
  parent_id: number | null;
}

interface Budget {
  category: CategorySummary;
  amount_cents: number | null;
  effective_from: string | null;
}

interface BudgetHistoryEntry {
  effective_from: string;
  amount_cents: number;
}

interface BudgetItem {
  category: CategorySummary;
  budget_cents: number;
  actual_cents: number;
  used_bp: number;
  status: 'ok' | 'warning' | 'over';
}

interface BudgetVsActual {
  period: Period;
  items: BudgetItem[];
}

interface Category {
  id: number;
  name: string;
  archived_at: string | null;
  children: Category[];
}

const STATUS_LABELS: Record<BudgetItem['status'], string> = {
  ok: 'En presupuesto',
  warning: 'Cerca del límite',
  over: 'Superado',
};

const euros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
});
const periodNames = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

function normalized(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function eur(cents: number): string {
  return normalized(euros.format(cents / 100));
}

function inputAmount(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function periodName(label: string): string {
  const [year, month] = label.split('-').map(Number) as [number, number];
  return periodNames.format(new Date(Date.UTC(year, month - 1, 1)));
}

function shiftLabel(label: string, delta: number): string {
  const [year, month] = label.split('-').map(Number) as [number, number];
  const index = year * 12 + month - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

function madridToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function randomCents(): number {
  return 10_000 + Math.floor(Math.random() * 90_000);
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

async function budgetsOf(page: Page, period: string): Promise<Budget[]> {
  return api<Budget[]>(page, 'GET', `/api/v1/budgets?period=${period}`);
}

async function effectiveBudget(page: Page, period: string, categoryId: number): Promise<Budget> {
  const budget = (await budgetsOf(page, period)).find(
    (candidate) => candidate.category.id === categoryId,
  );
  if (budget === undefined) {
    throw new Error(`Category ${categoryId} is not budgetable in ${period}`);
  }
  return budget;
}

async function budgetHistory(page: Page, categoryId: number): Promise<BudgetHistoryEntry[]> {
  return api<BudgetHistoryEntry[]>(page, 'GET', `/api/v1/budgets/${categoryId}/history`);
}

async function restoreBudgetHistory(
  page: Page,
  categoryId: number,
  history: BudgetHistoryEntry[],
): Promise<void> {
  await api(page, 'DELETE', `/api/v1/budgets/${categoryId}`);
  for (const entry of [...history].reverse()) {
    await api(page, 'PUT', `/api/v1/budgets/${categoryId}`, entry);
  }
}

function budgetRow(page: Page, name: string) {
  return page.getByTestId('budget-category').filter({ has: page.getByText(name, { exact: true }) });
}

async function editBudget(page: Page, name: string, cents: number): Promise<void> {
  const row = budgetRow(page, name);
  await row.getByRole('button', { name: `Editar presupuesto de ${name}` }).click();
  const amount = row.getByRole('textbox', { name: new RegExp(`Presupuesto mensual de ${name}`) });
  await amount.fill(inputAmount(cents));
  await row.getByRole('button', { name: 'Guardar' }).click();
  await expect(amount).toBeHidden();
}

test.describe('M6 budgets journey', () => {
  test.use({ storageState: authenticatedStatePath, serviceWorkers: 'block' });

  test('a budget repeats every period until changed and 0 clears it from its period on', async ({
    page,
  }) => {
    await page.goto('/');
    const current = (await api<Period>(page, 'GET', '/api/v1/periods/current')).label;
    const next = shiftLabel(current, 1);
    const afterNext = shiftLabel(current, 2);
    const category = await api<CategorySummary>(page, 'POST', '/api/v1/categories', {
      kind: 'expense',
      name: `E2E Presupuesto ${Date.now().toString(36)}`,
    });
    const target = await effectiveBudget(page, current, category.id);
    expect(target.amount_cents).toBeNull();
    const name = target.category.name;
    const amount = randomCents();

    try {
      await page.goto('/mas/presupuestos');
      await expect(page.getByTestId('period-name')).toHaveText(
        new RegExp(periodName(current), 'i'),
      );
      await editBudget(page, name, amount);
      const row = budgetRow(page, name);
      await expect(row.getByTestId('budget-amount')).toHaveText(eur(amount));
      await expect(row).toContainText(`Desde ${periodName(current)}`);

      const saved = await effectiveBudget(page, current, target.category.id);
      expect(saved.amount_cents).toBe(amount);
      expect(saved.effective_from).toBe(current);
      expect((await effectiveBudget(page, next, target.category.id)).amount_cents).toBe(amount);

      await page.getByRole('button', { name: 'Periodo siguiente' }).click();
      await expect(page).toHaveURL(new RegExp(`/mas/presupuestos\\?period=${next}$`));
      await expect(budgetRow(page, name).getByTestId('budget-amount')).toHaveText(eur(amount));
      await expect(budgetRow(page, name)).toContainText(`Desde ${periodName(current)}`);

      await editBudget(page, name, 0);
      await expect(budgetRow(page, name).getByTestId('budget-amount')).toHaveText(
        'Sin presupuesto',
      );
      expect((await effectiveBudget(page, next, target.category.id)).amount_cents).toBeNull();
      expect((await effectiveBudget(page, afterNext, target.category.id)).amount_cents).toBeNull();
      expect((await effectiveBudget(page, current, target.category.id)).amount_cents).toBe(amount);

      await budgetRow(page, name)
        .getByRole('button', { name: `Historial de ${name}` })
        .click();
      const history = page.getByRole('dialog', { name: `Historial de ${name}` });
      const entries = history.getByTestId('budget-history-entry');
      await expect(entries.first()).toContainText(`Desde ${periodName(next)}`);
      await expect(entries.first()).toContainText('Sin presupuesto');
      await expect(entries.nth(1)).toContainText(`Desde ${periodName(current)}`);
      await expect(entries.nth(1)).toContainText(eur(amount));
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Ir al actual' }).click();
      await expect(page).toHaveURL(/\/mas\/presupuestos$/);
      await expect(budgetRow(page, name).getByTestId('budget-amount')).toHaveText(eur(amount));
    } finally {
      await api(page, 'DELETE', `/api/v1/categories/${category.id}`);
    }
  });

  test('clearing a budget from the UI lets the category become a subcategory', async ({ page }) => {
    await page.goto('/');
    const suffix = Date.now().toString(36);
    const host = await api<CategorySummary>(page, 'POST', '/api/v1/categories', {
      kind: 'expense',
      name: `E2E Anfitriona ${suffix}`,
    });
    const category = await api<CategorySummary>(page, 'POST', '/api/v1/categories', {
      kind: 'expense',
      name: `E2E Reubicada ${suffix}`,
    });

    try {
      const current = (await api<Period>(page, 'GET', '/api/v1/periods/current')).label;
      const amount = randomCents();
      await api(page, 'PUT', `/api/v1/budgets/${category.id}`, {
        amount_cents: amount,
        effective_from: shiftLabel(current, -1),
      });
      await page.goto('/mas/presupuestos');
      await expect(budgetRow(page, category.name).getByTestId('budget-amount')).toHaveText(
        eur(amount),
      );
      await editBudget(page, category.name, 0);
      await expect(budgetRow(page, category.name).getByTestId('budget-amount')).toHaveText(
        'Sin presupuesto',
      );

      const locked = await request(page, 'PATCH', `/api/v1/categories/${category.id}`, {
        parent_id: host.id,
      });
      expect(locked.status).toBe(422);

      await budgetRow(page, category.name)
        .getByRole('button', { name: `Historial de ${category.name}` })
        .click();
      const sheet = page.getByRole('dialog', { name: `Historial de ${category.name}` });
      await expect(sheet.getByTestId('budget-history-entry')).toHaveCount(2);
      await sheet.getByRole('button', { name: 'Eliminar presupuesto e historial' }).click();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === 'DELETE' &&
            new URL(response.url()).pathname === `/api/v1/budgets/${category.id}` &&
            response.ok(),
        ),
        sheet
          .getByRole('group', { name: 'Confirmar eliminación del presupuesto' })
          .getByRole('button', { name: 'Eliminar' })
          .click(),
      ]);
      await expect(sheet).toBeHidden();
      await expect(budgetRow(page, category.name).getByTestId('budget-amount')).toHaveText(
        'Sin presupuesto',
      );
      expect(await budgetHistory(page, category.id)).toEqual([]);

      const moved = await request(page, 'PATCH', `/api/v1/categories/${category.id}`, {
        parent_id: host.id,
      });
      expect(moved.status).toBe(200);
      await page.reload();
      await expect(budgetRow(page, category.name)).toHaveCount(0);
    } finally {
      await api(page, 'DELETE', `/api/v1/categories/${category.id}`);
      await api(page, 'DELETE', `/api/v1/categories/${host.id}`);
    }
  });

  test('budget vs actual includes subcategories and shows in Informes and Inicio', async ({
    page,
  }) => {
    await page.goto('/');
    const current = (await api<Period>(page, 'GET', '/api/v1/periods/current')).label;
    const categories = await api<Category[]>(page, 'GET', '/api/v1/categories?kind=expense');
    const parent = categories.find(
      (category) =>
        category.archived_at === null &&
        category.children.some((child) => child.archived_at === null),
    );
    if (parent === undefined) {
      throw new Error('The M6 journey needs an expense category with subcategories');
    }
    const child = parent.children.find((candidate) => candidate.archived_at === null)!;
    const originalHistory = await budgetHistory(page, parent.id);
    const account = await api<{ id: number }>(page, 'POST', '/api/v1/accounts', {
      name: `Presupuesto ${Date.now().toString(36)}`,
      type: 'checking',
      opening_balance_cents: 100000,
      opening_date: madridToday(),
    });

    try {
      await api(page, 'PUT', `/api/v1/budgets/${parent.id}`, {
        amount_cents: 1000,
        effective_from: current,
      });
      const before = await api<BudgetVsActual>(page, 'GET', '/api/v1/reports/budget-vs-actual');
      const beforeItem = before.items.find((item) => item.category.id === parent.id);
      expect(beforeItem?.budget_cents).toBe(1000);

      await api(page, 'POST', '/api/v1/transactions', {
        type: 'expense',
        amount_cents: 2500,
        date: madridToday(),
        account_id: account.id,
        category_id: child.id,
        description: `Gasto presupuesto ${Date.now().toString(36)}`,
      });

      const after = await api<BudgetVsActual>(page, 'GET', '/api/v1/reports/budget-vs-actual');
      const item = after.items.find((candidate) => candidate.category.id === parent.id);
      expect(item).toBeDefined();
      expect(item!.actual_cents - (beforeItem?.actual_cents ?? 0)).toBe(2500);
      expect(item!.status).toBe('over');

      await page.goto('/informes');
      const section = page.getByRole('region', { name: 'Presupuesto vs real' });
      const reportRow = section.getByTestId('budget-row').filter({ hasText: parent.name });
      await expect(reportRow.getByTestId('budget-status')).toHaveText(STATUS_LABELS[item!.status]);
      await expect(reportRow.getByTestId('budget-spent')).toContainText(
        `${eur(item!.actual_cents)} de ${eur(item!.budget_cents)}`,
      );

      await page.goto('/');
      const card = page.getByRole('region', { name: 'Presupuestos' });
      await expect(card).toBeVisible();
      await expect(card.getByTestId('budget-row').filter({ hasText: parent.name })).toHaveCount(1);
    } finally {
      await restoreBudgetHistory(page, parent.id, originalHistory);
    }
    expect(await budgetHistory(page, parent.id)).toEqual(originalHistory);
  });

  test('budgets on income categories or subcategories are rejected with 422', async ({ page }) => {
    await page.goto('/');
    const income = await api<Category[]>(page, 'GET', '/api/v1/categories?kind=income');
    const expense = await api<Category[]>(page, 'GET', '/api/v1/categories?kind=expense');
    const incomeCategory = income[0];
    const subcategory = expense.flatMap((category) => category.children)[0];
    expect(incomeCategory).toBeDefined();
    expect(subcategory).toBeDefined();

    const incomeResponse = await request(page, 'PUT', `/api/v1/budgets/${incomeCategory!.id}`, {
      amount_cents: 1000,
    });
    expect(incomeResponse.status).toBe(422);
    const childResponse = await request(page, 'PUT', `/api/v1/budgets/${subcategory!.id}`, {
      amount_cents: 1000,
    });
    expect(childResponse.status).toBe(422);
  });
});
