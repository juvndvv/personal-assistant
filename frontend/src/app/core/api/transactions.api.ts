import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import {
  DataEnvelope,
  Transaction,
  TransactionInput,
  TransactionListQuery,
  TransactionPage,
  TransactionPatch,
} from './models';

const TRANSACTIONS = `${API_BASE}/transactions`;

const ARRAY_KEYS = ['type', 'account_id', 'category_id', 'tag_id', 'origin'] as const;
const SCALAR_KEYS = [
  'q',
  'tag_mode',
  'period',
  'date_from',
  'date_to',
  'amount_min_cents',
  'amount_max_cents',
  'sort',
  'page',
  'per_page',
] as const;

export function transactionListParams(query: TransactionListQuery): HttpParams {
  let params = new HttpParams();
  for (const key of SCALAR_KEYS) {
    const value = query[key];
    if (value !== undefined && value !== '') {
      params = params.set(key, value);
    }
  }
  for (const key of ARRAY_KEYS) {
    for (const value of query[key] ?? []) {
      params = params.append(`${key}[]`, value);
    }
  }
  if (query.has_attachments !== undefined) {
    params = params.set('has_attachments', query.has_attachments ? 1 : 0);
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class TransactionsApi {
  private readonly http = inject(HttpClient);

  list(query: TransactionListQuery = {}): Observable<TransactionPage> {
    return this.http.get<TransactionPage>(TRANSACTIONS, { params: transactionListParams(query) });
  }

  get(id: number): Observable<Transaction> {
    return this.http
      .get<DataEnvelope<Transaction>>(`${TRANSACTIONS}/${id}`)
      .pipe(map((response) => response.data));
  }

  create(input: TransactionInput): Observable<Transaction> {
    return this.http
      .post<DataEnvelope<Transaction>>(TRANSACTIONS, input)
      .pipe(map((response) => response.data));
  }

  update(id: number, patch: TransactionPatch): Observable<Transaction> {
    return this.http
      .patch<DataEnvelope<Transaction>>(`${TRANSACTIONS}/${id}`, patch)
      .pipe(map((response) => response.data));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${TRANSACTIONS}/${id}`);
  }

  restore(id: number): Observable<Transaction> {
    return this.http
      .post<DataEnvelope<Transaction>>(`${TRANSACTIONS}/${id}/restore`, null)
      .pipe(map((response) => response.data));
  }
}
