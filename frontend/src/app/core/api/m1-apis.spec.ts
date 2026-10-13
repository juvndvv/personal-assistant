import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AccountsApi } from './accounts.api';
import { conflictCode, serverMessage, validationErrors } from './api-error';
import { CategoriesApi } from './categories.api';
import { PeriodsApi } from './periods.api';
import { SettingsApi } from './settings.api';

describe('M1 API clients', () => {
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('reads and patches settings', async () => {
    const api = TestBed.inject(SettingsApi);

    const read = firstValueFrom(api.get());
    backend.expectOne({ method: 'GET', url: '/api/v1/settings' }).flush({ data: { id: 'x' } });
    expect(await read).toEqual({ id: 'x' });

    const patched = firstValueFrom(api.update({ month_start_day: 25 }));
    const request = backend.expectOne({ method: 'PATCH', url: '/api/v1/settings' });
    expect(request.request.body).toEqual({ month_start_day: 25 });
    request.flush({ data: {} });
    await patched;
  });

  it('previews the current period for a start day', async () => {
    const api = TestBed.inject(PeriodsApi);

    const preview = firstValueFrom(api.current(25));
    backend
      .expectOne('/api/v1/periods/current?month_start_day=25')
      .flush({ data: { label: '2026-10' } });
    expect(await preview).toEqual({ label: '2026-10' });

    const current = firstValueFrom(api.current());
    backend.expectOne('/api/v1/periods/current').flush({ data: {} });
    await current;

    const range = firstValueFrom(api.list({ count: 6, until: '2026-10' }));
    backend.expectOne('/api/v1/periods?count=6&until=2026-10').flush({ data: [] });
    await range;

    const resolved = firstValueFrom(api.resolve('2026-10-24'));
    backend.expectOne('/api/v1/periods/resolve?date=2026-10-24').flush({ data: {} });
    await resolved;
  });

  it('calls every account endpoint', async () => {
    const api = TestBed.inject(AccountsApi);
    const expectations: [Promise<unknown>, string, string][] = [
      [firstValueFrom(api.list()), 'GET', '/api/v1/accounts?include_archived=0'],
      [firstValueFrom(api.list(true)), 'GET', '/api/v1/accounts?include_archived=1'],
      [firstValueFrom(api.get(3)), 'GET', '/api/v1/accounts/3'],
      [
        firstValueFrom(
          api.create({
            name: 'BBVA',
            type: 'checking',
            opening_balance_cents: 0,
            opening_date: '2026-01-01',
          }),
        ),
        'POST',
        '/api/v1/accounts',
      ],
      [firstValueFrom(api.update(3, { name: 'X' })), 'PATCH', '/api/v1/accounts/3'],
      [firstValueFrom(api.archive(3)), 'POST', '/api/v1/accounts/3/archive'],
      [firstValueFrom(api.unarchive(3)), 'POST', '/api/v1/accounts/3/unarchive'],
      [
        firstValueFrom(api.balance(3, '2026-10-01')),
        'GET',
        '/api/v1/accounts/3/balance?date=2026-10-01',
      ],
      [
        firstValueFrom(api.adjust(3, { date: '2026-10-13', target_balance_cents: -500 })),
        'POST',
        '/api/v1/accounts/3/adjustments',
      ],
    ];
    for (const [, method, url] of expectations) {
      backend.expectOne({ method, url }).flush({ data: {} });
    }
    await Promise.all(expectations.map(([promise]) => promise));

    const deletion = firstValueFrom(api.delete(3), { defaultValue: undefined });
    backend
      .expectOne({ method: 'DELETE', url: '/api/v1/accounts/3' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await deletion;
  });

  it('calls every category endpoint', async () => {
    const api = TestBed.inject(CategoriesApi);
    const expectations: [Promise<unknown>, string, string][] = [
      [
        firstValueFrom(api.list({ kind: 'income', includeArchived: true })),
        'GET',
        '/api/v1/categories?include_archived=1&kind=income',
      ],
      [firstValueFrom(api.create({ kind: 'expense', name: 'Ocio' })), 'POST', '/api/v1/categories'],
      [firstValueFrom(api.update(10, { sort_order: 2 })), 'PATCH', '/api/v1/categories/10'],
      [firstValueFrom(api.archive(10)), 'POST', '/api/v1/categories/10/archive'],
      [firstValueFrom(api.unarchive(10)), 'POST', '/api/v1/categories/10/unarchive'],
    ];
    for (const [, method, url] of expectations) {
      backend.expectOne({ method, url }).flush({ data: {} });
    }
    await Promise.all(expectations.map(([promise]) => promise));

    const deletion = firstValueFrom(api.delete(10), { defaultValue: undefined });
    backend
      .expectOne({ method: 'DELETE', url: '/api/v1/categories/10' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await deletion;
  });
});

describe('API error helpers', () => {
  it('reads the 409 code', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { message: 'No', code: 'account_has_movements' },
    });
    expect(conflictCode(error)).toBe('account_has_movements');
    expect(serverMessage(error)).toBe('No');
    expect(conflictCode(new HttpErrorResponse({ status: 422 }))).toBeNull();
  });

  it('keeps the first message per field on 422', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: { message: 'Invalid', errors: { name: ['Taken', 'Too long'], date: ['Future'] } },
    });
    expect(validationErrors(error)).toEqual({ name: 'Taken', date: 'Future' });
    expect(validationErrors(new HttpErrorResponse({ status: 409 }))).toBeNull();
  });
});
