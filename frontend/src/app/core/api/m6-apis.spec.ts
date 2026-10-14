import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  aBudget,
  aBudgetHistory,
  aBudgetList,
  aBudgetVsActual,
} from '../../features/budgets/testing/budget-fixtures';
import { BudgetsApi } from './budgets.api';
import { ReportsApi } from './reports.api';

describe('M6 API clients', () => {
  let backend: HttpTestingController;
  let budgets: BudgetsApi;
  let reports: ReportsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
    budgets = TestBed.inject(BudgetsApi);
    reports = TestBed.inject(ReportsApi);
  });

  afterEach(() => backend.verify());

  it('lists the budgets of the current or a given period', async () => {
    const current = firstValueFrom(budgets.list());
    backend.expectOne({ method: 'GET', url: '/api/v1/budgets' }).flush({ data: aBudgetList() });
    expect(await current).toHaveLength(3);

    const october = firstValueFrom(budgets.list('2026-10'));
    backend
      .expectOne({ method: 'GET', url: '/api/v1/budgets?period=2026-10' })
      .flush({ data: aBudgetList() });
    expect((await october)[2]?.amount_cents).toBeNull();
  });

  it('sets a budget from a period with PUT', async () => {
    const saved = firstValueFrom(
      budgets.set(10, { amount_cents: 45000, effective_from: '2026-09' }),
    );
    const request = backend.expectOne({ method: 'PUT', url: '/api/v1/budgets/10' });
    expect(request.request.body).toEqual({ amount_cents: 45000, effective_from: '2026-09' });
    request.flush({ data: aBudget({ amount_cents: 45000, effective_from: '2026-09' }) });
    expect((await saved).amount_cents).toBe(45000);
  });

  it('fetches the history of a budget', async () => {
    const history = firstValueFrom(budgets.history(10));
    backend
      .expectOne({ method: 'GET', url: '/api/v1/budgets/10/history' })
      .flush({ data: aBudgetHistory() });
    expect((await history)[0]?.effective_from).toBe('2026-11');
  });

  it('clears every budget row of a category with DELETE', async () => {
    const cleared = firstValueFrom(budgets.clear(10), { defaultValue: undefined });
    backend
      .expectOne({ method: 'DELETE', url: '/api/v1/budgets/10' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await expect(cleared).resolves.toBeNull();
  });

  it('fetches budget vs actual of the current or a given period', async () => {
    const october = firstValueFrom(reports.budgetVsActual('2026-10'));
    backend
      .expectOne({ method: 'GET', url: '/api/v1/reports/budget-vs-actual?period=2026-10' })
      .flush({ data: aBudgetVsActual() });
    expect((await october).items[0]?.status).toBe('over');

    const current = firstValueFrom(reports.budgetVsActual());
    backend
      .expectOne({ method: 'GET', url: '/api/v1/reports/budget-vs-actual' })
      .flush({ data: aBudgetVsActual() });
    expect((await current).budgeted_cents).toBe(200000);
  });
});
