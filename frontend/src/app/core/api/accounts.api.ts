import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import {
  Account,
  AccountBalance,
  AccountInput,
  AccountPatch,
  BalanceAdjustmentInput,
  DataEnvelope,
  IsoDateString,
  Transaction,
} from './models';

const ACCOUNTS = `${API_BASE}/accounts`;

@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly http = inject(HttpClient);

  list(includeArchived = false): Observable<Account[]> {
    const params = new HttpParams().set('include_archived', includeArchived ? 1 : 0);
    return this.http
      .get<DataEnvelope<Account[]>>(ACCOUNTS, { params })
      .pipe(map((response) => response.data));
  }

  get(id: number): Observable<Account> {
    return this.http
      .get<DataEnvelope<Account>>(`${ACCOUNTS}/${id}`)
      .pipe(map((response) => response.data));
  }

  create(input: AccountInput): Observable<Account> {
    return this.http
      .post<DataEnvelope<Account>>(ACCOUNTS, input)
      .pipe(map((response) => response.data));
  }

  update(id: number, patch: AccountPatch): Observable<Account> {
    return this.http
      .patch<DataEnvelope<Account>>(`${ACCOUNTS}/${id}`, patch)
      .pipe(map((response) => response.data));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${ACCOUNTS}/${id}`);
  }

  archive(id: number): Observable<Account> {
    return this.http
      .post<DataEnvelope<Account>>(`${ACCOUNTS}/${id}/archive`, null)
      .pipe(map((response) => response.data));
  }

  unarchive(id: number): Observable<Account> {
    return this.http
      .post<DataEnvelope<Account>>(`${ACCOUNTS}/${id}/unarchive`, null)
      .pipe(map((response) => response.data));
  }

  balance(id: number, date?: IsoDateString): Observable<AccountBalance> {
    const params = date === undefined ? new HttpParams() : new HttpParams().set('date', date);
    return this.http
      .get<DataEnvelope<AccountBalance>>(`${ACCOUNTS}/${id}/balance`, { params })
      .pipe(map((response) => response.data));
  }

  adjust(id: number, input: BalanceAdjustmentInput): Observable<Transaction> {
    return this.http
      .post<DataEnvelope<Transaction>>(`${ACCOUNTS}/${id}/adjustments`, input)
      .pipe(map((response) => response.data));
  }
}
