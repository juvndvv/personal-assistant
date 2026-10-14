import { HttpParams } from '@angular/common/http';
import { API_BASE } from './api-paths';
import { TransactionListQuery } from './models';
import { transactionListParams } from './transactions.api';

const EXPORTS = `${API_BASE}/exports`;

export type CsvDelimiter = 'semicolon' | 'comma';

export function transactionsCsvUrl(
  query: TransactionListQuery,
  delimiter: CsvDelimiter = 'semicolon',
): string {
  const unpaged: TransactionListQuery = { ...query, page: undefined, per_page: undefined };
  const params = transactionListParams(unpaged).set('delimiter', delimiter);
  return `${EXPORTS}/transactions.csv?${params.toString()}`;
}

export function fullArchiveUrl(includeReceipts: boolean): string {
  const params = includeReceipts ? new HttpParams().set('include_receipts', 1) : new HttpParams();
  const query = params.toString();
  return query === '' ? `${EXPORTS}/full.zip` : `${EXPORTS}/full.zip?${query}`;
}
