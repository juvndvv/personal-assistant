import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AccountsApi } from './accounts.api';
import { QuickAddApi } from './quick-add.api';
import { TagsApi } from './tags.api';
import { TransactionsApi, transactionListParams } from './transactions.api';
import { TransfersApi } from './transfers.api';

describe('M2 API clients', () => {
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('serializes list filters with bracketed arrays and 1/0 booleans', () => {
    const params = transactionListParams({
      q: 'café',
      type: ['expense', 'income'],
      account_id: [3],
      category_id: [10, 11],
      tag_id: [5],
      tag_mode: 'all',
      origin: ['voice'],
      period: '2026-10',
      amount_min_cents: 0,
      has_attachments: false,
      page: 2,
      per_page: 50,
    });
    expect(params.toString()).toBe(
      'q=caf%C3%A9&tag_mode=all&period=2026-10&amount_min_cents=0&page=2&per_page=50' +
        '&type%5B%5D=expense&type%5B%5D=income&account_id%5B%5D=3&category_id%5B%5D=10' +
        '&category_id%5B%5D=11&tag_id%5B%5D=5&origin%5B%5D=voice&has_attachments=0',
    );
    expect(transactionListParams({ q: '' }).toString()).toBe('');
  });

  it('calls every transaction endpoint', async () => {
    const api = TestBed.inject(TransactionsApi);
    const page = firstValueFrom(api.list({ period: '2026-10' }));
    backend
      .expectOne({ method: 'GET', url: '/api/v1/transactions?period=2026-10' })
      .flush({ data: [], meta: { totals: { income_cents: 0, expense_cents: 0 } } });
    expect((await page).meta.totals).toEqual({ income_cents: 0, expense_cents: 0 });

    const expectations: [Promise<unknown>, string, string][] = [
      [firstValueFrom(api.get(120)), 'GET', '/api/v1/transactions/120'],
      [
        firstValueFrom(api.create({ type: 'expense', amount_cents: 100, category_id: 11 })),
        'POST',
        '/api/v1/transactions',
      ],
      [firstValueFrom(api.update(120, { amount_cents: 200 })), 'PATCH', '/api/v1/transactions/120'],
      [firstValueFrom(api.restore(120)), 'POST', '/api/v1/transactions/120/restore'],
    ];
    for (const [, method, url] of expectations) {
      backend.expectOne({ method, url }).flush({ data: {} });
    }
    await Promise.all(expectations.map(([promise]) => promise));

    const deletion = firstValueFrom(api.delete(120), { defaultValue: undefined });
    backend
      .expectOne({ method: 'DELETE', url: '/api/v1/transactions/120' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await deletion;
  });

  it('calls every transfer endpoint', async () => {
    const api = TestBed.inject(TransfersApi);
    const expectations: [Promise<unknown>, string, string][] = [
      [firstValueFrom(api.get(44)), 'GET', '/api/v1/transfers/44'],
      [
        firstValueFrom(
          api.create({
            kind: 'card_settlement',
            from_account_id: 3,
            to_account_id: 7,
            amount_cents: 100,
          }),
        ),
        'POST',
        '/api/v1/transfers',
      ],
      [firstValueFrom(api.update(44, { amount_cents: 5 })), 'PATCH', '/api/v1/transfers/44'],
      [firstValueFrom(api.restore(44)), 'POST', '/api/v1/transfers/44/restore'],
    ];
    for (const [, method, url] of expectations) {
      backend.expectOne({ method, url }).flush({ data: {} });
    }
    await Promise.all(expectations.map(([promise]) => promise));

    const deletion = firstValueFrom(api.delete(44), { defaultValue: undefined });
    backend
      .expectOne({ method: 'DELETE', url: '/api/v1/transfers/44' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await deletion;
  });

  it('calls the tag, quick add and settlement suggestion endpoints', async () => {
    const tags = TestBed.inject(TagsApi);
    const expectations: [Promise<unknown>, string, string][] = [
      [firstValueFrom(tags.list(' rom ')), 'GET', '/api/v1/tags?q=rom'],
      [firstValueFrom(tags.list()), 'GET', '/api/v1/tags'],
      [firstValueFrom(tags.create('roma')), 'POST', '/api/v1/tags'],
      [firstValueFrom(tags.rename(5, 'lisboa')), 'PATCH', '/api/v1/tags/5'],
      [firstValueFrom(TestBed.inject(QuickAddApi).defaults()), 'GET', '/api/v1/quick-add/defaults'],
      [
        firstValueFrom(TestBed.inject(AccountsApi).settlementSuggestion(7, '2026-10-13')),
        'GET',
        '/api/v1/accounts/7/settlement-suggestion?date=2026-10-13',
      ],
    ];
    for (const [, method, url] of expectations) {
      backend.expectOne({ method, url }).flush({ data: {} });
    }
    await Promise.all(expectations.map(([promise]) => promise));

    const deletion = firstValueFrom(tags.delete(5), { defaultValue: undefined });
    backend
      .expectOne({ method: 'DELETE', url: '/api/v1/tags/5' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await deletion;
  });
});
