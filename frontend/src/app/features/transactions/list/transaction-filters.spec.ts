import { convertToParamMap } from '@angular/router';
import {
  EMPTY_FILTERS,
  TransactionFilters,
  activeFilterCount,
  filtersFromQueryParams,
  filtersToListQuery,
  filtersToQueryParams,
} from './transaction-filters';

const FULL: TransactionFilters = {
  q: 'café',
  period: '2026-09',
  dateFrom: null,
  dateTo: null,
  accountIds: [3, 7],
  categoryIds: [10],
  types: ['expense', 'transfer'],
  origins: ['voice'],
  tagIds: [5, 6],
  tagMode: 'all',
  amountMinCents: 1000,
  amountMaxCents: 5000,
  hasAttachments: true,
};

describe('transaction filters <-> query params', () => {
  it('omits every default from the URL', () => {
    expect(filtersToQueryParams(EMPTY_FILTERS)).toEqual({});
  });

  it('serializes every filter with repeated keys for multi-selects', () => {
    expect(filtersToQueryParams(FULL)).toEqual({
      q: 'café',
      period: '2026-09',
      account: ['3', '7'],
      category: ['10'],
      type: ['expense', 'transfer'],
      origin: ['voice'],
      tag: ['5', '6'],
      tag_mode: 'all',
      amount_min_cents: '1000',
      amount_max_cents: '5000',
      receipt: '1',
    });
  });

  it('round-trips through the URL', () => {
    const params = filtersToQueryParams(FULL);
    expect(filtersFromQueryParams(convertToParamMap(params))).toEqual(FULL);

    const range: TransactionFilters = {
      ...EMPTY_FILTERS,
      dateFrom: '2026-01-01',
      dateTo: '2026-03-31',
      hasAttachments: false,
    };
    expect(filtersFromQueryParams(convertToParamMap(filtersToQueryParams(range)))).toEqual(range);
  });

  it('ignores malformed values', () => {
    const filters = filtersFromQueryParams(
      convertToParamMap({
        period: 'October',
        from: '2026-13-01',
        account: ['x', '4', '-1'],
        type: ['expense', 'gift'],
        origin: 'fax',
        tag_mode: 'some',
        amount_min_cents: '12.5',
        receipt: 'maybe',
      }),
    );
    expect(filters).toEqual({ ...EMPTY_FILTERS, accountIds: [4], types: ['expense'] });
  });

  it('keeps the all-history choice', () => {
    const filters = filtersFromQueryParams(convertToParamMap({ period: 'all' }));
    expect(filters.period).toBe('all');
    expect(filtersToQueryParams(filters)).toEqual({ period: 'all' });
  });
});

describe('filtersToListQuery', () => {
  it('uses the current period by default', () => {
    expect(filtersToListQuery(EMPTY_FILTERS, '2026-10')).toEqual({ period: '2026-10' });
  });

  it('sends no period for the whole history', () => {
    expect(filtersToListQuery({ ...EMPTY_FILTERS, period: 'all' }, '2026-10')).toEqual({});
  });

  it('prefers an explicit date range over the period', () => {
    expect(
      filtersToListQuery({ ...FULL, dateFrom: '2026-01-01', dateTo: null }, '2026-10'),
    ).toEqual({
      q: 'café',
      date_from: '2026-01-01',
      account_id: [3, 7],
      category_id: [10],
      type: ['expense', 'transfer'],
      origin: ['voice'],
      tag_id: [5, 6],
      tag_mode: 'all',
      amount_min_cents: 1000,
      amount_max_cents: 5000,
      has_attachments: true,
    });
  });

  it('maps every filter to the API contract', () => {
    expect(filtersToListQuery(FULL, '2026-10')).toMatchObject({
      period: '2026-09',
      tag_id: [5, 6],
      tag_mode: 'all',
    });
    expect(filtersToListQuery({ ...EMPTY_FILTERS, tagIds: [1] }, null)).toEqual({
      tag_id: [1],
    });
  });
});

describe('activeFilterCount', () => {
  it('counts the filters set in the sheet', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, q: 'x' })).toBe(0);
    expect(activeFilterCount(FULL)).toBe(8);
  });
});
