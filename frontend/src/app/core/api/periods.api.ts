import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import { DataEnvelope, IsoDateString, Period, PeriodLabel } from './models';

export interface PeriodRangeQuery {
  count?: number;
  until?: PeriodLabel;
}

@Injectable({ providedIn: 'root' })
export class PeriodsApi {
  private readonly http = inject(HttpClient);

  current(previewMonthStartDay?: number): Observable<Period> {
    let params = new HttpParams();
    if (previewMonthStartDay !== undefined) {
      params = params.set('month_start_day', previewMonthStartDay);
    }
    return this.http
      .get<DataEnvelope<Period>>(`${API_BASE}/periods/current`, { params })
      .pipe(map((response) => response.data));
  }

  list(query: PeriodRangeQuery = {}): Observable<Period[]> {
    let params = new HttpParams();
    if (query.count !== undefined) {
      params = params.set('count', query.count);
    }
    if (query.until !== undefined) {
      params = params.set('until', query.until);
    }
    return this.http
      .get<DataEnvelope<Period[]>>(`${API_BASE}/periods`, { params })
      .pipe(map((response) => response.data));
  }

  resolve(date: IsoDateString): Observable<Period> {
    return this.http
      .get<DataEnvelope<Period>>(`${API_BASE}/periods/resolve`, { params: { date } })
      .pipe(map((response) => response.data));
  }
}
