import { ParamMap, Params } from '@angular/router';
import {
  PeriodLabel,
  TRANSACTION_ORIGINS,
  TRANSACTION_TYPES,
  TagMode,
  TransactionListQuery,
  TransactionOrigin,
  TransactionType,
} from '../../../core/api/models';
import { isIsoDate } from '../../../core/date/iso-date';

export const ALL_PERIODS = 'all';

export interface TransactionFilters {
  q: string;
  period: PeriodLabel | typeof ALL_PERIODS | null;
  dateFrom: string | null;
  dateTo: string | null;
  accountIds: number[];
  categoryIds: number[];
  types: TransactionType[];
  origins: TransactionOrigin[];
  tagIds: number[];
  tagMode: TagMode;
  amountMinCents: number | null;
  amountMaxCents: number | null;
  hasAttachments: boolean | null;
}

export const EMPTY_FILTERS: TransactionFilters = {
  q: '',
  period: null,
  dateFrom: null,
  dateTo: null,
  accountIds: [],
  categoryIds: [],
  types: [],
  origins: [],
  tagIds: [],
  tagMode: 'any',
  amountMinCents: null,
  amountMaxCents: null,
  hasAttachments: null,
};

const PERIOD_LABEL = /^\d{4}-(0[1-9]|1[0-2])$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const NON_NEGATIVE_INTEGER = /^\d+$/;

export function filtersFromQueryParams(params: ParamMap): TransactionFilters {
  const period = params.get('period');
  const tagMode = params.get('tag_mode');
  const receipt = params.get('receipt');
  return {
    q: params.get('q')?.trim() ?? '',
    period:
      period === ALL_PERIODS || (period !== null && PERIOD_LABEL.test(period)) ? period : null,
    dateFrom: isoDateOrNull(params.get('from')),
    dateTo: isoDateOrNull(params.get('to')),
    accountIds: ids(params.getAll('account')),
    categoryIds: ids(params.getAll('category')),
    types: allowed(params.getAll('type'), TRANSACTION_TYPES),
    origins: allowed(params.getAll('origin'), TRANSACTION_ORIGINS),
    tagIds: ids(params.getAll('tag')),
    tagMode: tagMode === 'all' ? 'all' : 'any',
    amountMinCents: cents(params.get('amount_min_cents')),
    amountMaxCents: cents(params.get('amount_max_cents')),
    hasAttachments: receipt === '1' ? true : receipt === '0' ? false : null,
  };
}

export function filtersToQueryParams(filters: TransactionFilters): Params {
  const params: Params = {};
  if (filters.q !== '') {
    params['q'] = filters.q;
  }
  if (filters.period !== null) {
    params['period'] = filters.period;
  }
  if (filters.dateFrom !== null) {
    params['from'] = filters.dateFrom;
  }
  if (filters.dateTo !== null) {
    params['to'] = filters.dateTo;
  }
  setList(params, 'account', filters.accountIds);
  setList(params, 'category', filters.categoryIds);
  setList(params, 'type', filters.types);
  setList(params, 'origin', filters.origins);
  setList(params, 'tag', filters.tagIds);
  if (filters.tagMode === 'all') {
    params['tag_mode'] = 'all';
  }
  if (filters.amountMinCents !== null) {
    params['amount_min_cents'] = String(filters.amountMinCents);
  }
  if (filters.amountMaxCents !== null) {
    params['amount_max_cents'] = String(filters.amountMaxCents);
  }
  if (filters.hasAttachments !== null) {
    params['receipt'] = filters.hasAttachments ? '1' : '0';
  }
  return params;
}

export function hasDateRange(filters: TransactionFilters): boolean {
  return filters.dateFrom !== null || filters.dateTo !== null;
}

export function filtersToListQuery(
  filters: TransactionFilters,
  currentPeriod: PeriodLabel | null,
): TransactionListQuery {
  const query: TransactionListQuery = {};
  if (filters.q !== '') {
    query.q = filters.q;
  }
  if (hasDateRange(filters)) {
    if (filters.dateFrom !== null) {
      query.date_from = filters.dateFrom;
    }
    if (filters.dateTo !== null) {
      query.date_to = filters.dateTo;
    }
  } else {
    const period = filters.period ?? currentPeriod;
    if (period !== null && period !== ALL_PERIODS) {
      query.period = period;
    }
  }
  if (filters.accountIds.length > 0) {
    query.account_id = filters.accountIds;
  }
  if (filters.categoryIds.length > 0) {
    query.category_id = filters.categoryIds;
  }
  if (filters.types.length > 0) {
    query.type = filters.types;
  }
  if (filters.origins.length > 0) {
    query.origin = filters.origins;
  }
  if (filters.tagIds.length > 0) {
    query.tag_id = filters.tagIds;
    if (filters.tagMode === 'all') {
      query.tag_mode = 'all';
    }
  }
  if (filters.amountMinCents !== null) {
    query.amount_min_cents = filters.amountMinCents;
  }
  if (filters.amountMaxCents !== null) {
    query.amount_max_cents = filters.amountMaxCents;
  }
  if (filters.hasAttachments !== null) {
    query.has_attachments = filters.hasAttachments;
  }
  return query;
}

export function activeFilterCount(filters: TransactionFilters): number {
  return [
    filters.period !== null || hasDateRange(filters),
    filters.accountIds.length > 0,
    filters.categoryIds.length > 0,
    filters.types.length > 0,
    filters.origins.length > 0,
    filters.tagIds.length > 0,
    filters.amountMinCents !== null || filters.amountMaxCents !== null,
    filters.hasAttachments !== null,
  ].filter(Boolean).length;
}

function isoDateOrNull(value: string | null): string | null {
  return value !== null && isIsoDate(value) ? value : null;
}

function ids(values: readonly string[]): number[] {
  return values.filter((value) => POSITIVE_INTEGER.test(value)).map(Number);
}

function cents(value: string | null): number | null {
  return value !== null && NON_NEGATIVE_INTEGER.test(value) ? Number(value) : null;
}

function allowed<T extends string>(values: readonly string[], options: readonly T[]): T[] {
  return values.filter((value): value is T => (options as readonly string[]).includes(value));
}

function setList(params: Params, key: string, values: readonly (string | number)[]): void {
  if (values.length > 0) {
    params[key] = values.map(String);
  }
}
