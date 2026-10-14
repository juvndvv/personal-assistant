import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import { Budget, BudgetHistoryEntry, BudgetInput, DataEnvelope, PeriodLabel } from './models';

const BUDGETS = `${API_BASE}/budgets`;

@Injectable({ providedIn: 'root' })
export class BudgetsApi {
  private readonly http = inject(HttpClient);

  list(period?: PeriodLabel): Observable<Budget[]> {
    const params = period === undefined ? new HttpParams() : new HttpParams().set('period', period);
    return this.http
      .get<DataEnvelope<Budget[]>>(BUDGETS, { params })
      .pipe(map((response) => response.data));
  }

  set(categoryId: number, input: BudgetInput): Observable<Budget> {
    return this.http
      .put<DataEnvelope<Budget>>(`${BUDGETS}/${categoryId}`, input)
      .pipe(map((response) => response.data));
  }

  history(categoryId: number): Observable<BudgetHistoryEntry[]> {
    return this.http
      .get<DataEnvelope<BudgetHistoryEntry[]>>(`${BUDGETS}/${categoryId}/history`)
      .pipe(map((response) => response.data));
  }

  clear(categoryId: number): Observable<void> {
    return this.http.delete<void>(`${BUDGETS}/${categoryId}`);
  }
}
