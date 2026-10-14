import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { fullArchiveUrl, transactionsCsvUrl } from './exports.api';
import { SuggestionsApi } from './suggestions.api';

describe('M7 API clients', () => {
  let backend: HttpTestingController;
  let suggestions: SuggestionsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
    suggestions = TestBed.inject(SuggestionsApi);
  });

  afterEach(() => backend.verify());

  it('asks for a categorization suggestion with the trimmed merchant and description', async () => {
    const suggestion = firstValueFrom(
      suggestions.categorization({
        type: 'expense',
        merchant: '  Mercadona ',
        description: 'Compra semanal',
      }),
    );
    backend
      .expectOne({
        method: 'GET',
        url: '/api/v1/suggestions/categorization?type=expense&merchant=Mercadona&description=Compra%20semanal',
      })
      .flush({ data: { category_id: 11, account_id: 7, source: 'history', hits: 6 } });

    expect(await suggestion).toEqual({
      category_id: 11,
      account_id: 7,
      source: 'history',
      hits: 6,
    });
  });

  it('omits empty fields and resolves null when there is no hint (204)', async () => {
    const suggestion = firstValueFrom(
      suggestions.categorization({ type: 'income', merchant: '', description: 'Nómina' }),
    );
    backend
      .expectOne({
        method: 'GET',
        url: '/api/v1/suggestions/categorization?type=income&description=N%C3%B3mina',
      })
      .flush(null, { status: 204, statusText: 'No Content' });

    expect(await suggestion).toBeNull();
  });
});

describe('Export URLs', () => {
  it('builds the CSV download URL from the list filters without pagination', () => {
    const url = transactionsCsvUrl({
      q: 'café',
      period: '2026-10',
      type: ['expense'],
      account_id: [3, 4],
      tag_id: [9],
      tag_mode: 'all',
      has_attachments: true,
      page: 2,
      per_page: 50,
    });
    const [path, query] = url.split('?');
    const params = new URLSearchParams(query);

    expect(path).toBe('/api/v1/exports/transactions.csv');
    expect(params.get('q')).toBe('café');
    expect(params.get('period')).toBe('2026-10');
    expect(params.getAll('type[]')).toEqual(['expense']);
    expect(params.getAll('account_id[]')).toEqual(['3', '4']);
    expect(params.getAll('tag_id[]')).toEqual(['9']);
    expect(params.get('tag_mode')).toBe('all');
    expect(params.get('has_attachments')).toBe('1');
    expect(params.get('delimiter')).toBe('semicolon');
    expect(params.has('page')).toBe(false);
    expect(params.has('per_page')).toBe(false);
  });

  it('builds the CSV URL with a date range and the comma delimiter', () => {
    expect(transactionsCsvUrl({ date_from: '2026-01-01', date_to: '2026-03-31' }, 'comma')).toBe(
      '/api/v1/exports/transactions.csv?date_from=2026-01-01&date_to=2026-03-31&delimiter=comma',
    );
  });

  it('builds the full archive URL with or without receipts', () => {
    expect(fullArchiveUrl(false)).toBe('/api/v1/exports/full.zip');
    expect(fullArchiveUrl(true)).toBe('/api/v1/exports/full.zip?include_receipts=1');
  });
});
