import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import {
  CaptureMetrics,
  DataEnvelope,
  IsoDateString,
  NetWorth,
  PeriodLabel,
  PeriodSummary,
  TrendPoint,
  TrendQuery,
} from './models';

const REPORTS = `${API_BASE}/reports`;

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);

  summary(period?: PeriodLabel): Observable<PeriodSummary> {
    return this.http
      .get<DataEnvelope<PeriodSummary>>(`${REPORTS}/summary`, { params: periodParams(period) })
      .pipe(map((response) => response.data));
  }

  trend(query: TrendQuery = {}): Observable<TrendPoint[]> {
    let params = new HttpParams();
    if (query.periods !== undefined) {
      params = params.set('periods', query.periods);
    }
    if (query.until !== undefined) {
      params = params.set('until', query.until);
    }
    if (query.category_id !== undefined) {
      params = params.set('category_id', query.category_id);
    }
    return this.http
      .get<DataEnvelope<TrendPoint[]>>(`${REPORTS}/trend`, { params })
      .pipe(map((response) => response.data));
  }

  netWorth(date?: IsoDateString): Observable<NetWorth> {
    const params = date === undefined ? new HttpParams() : new HttpParams().set('date', date);
    return this.http
      .get<DataEnvelope<NetWorth>>(`${REPORTS}/net-worth`, { params })
      .pipe(map((response) => response.data));
  }

  captureMetrics(period?: PeriodLabel): Observable<CaptureMetrics> {
    return this.http
      .get<DataEnvelope<CaptureMetrics>>(`${REPORTS}/capture-metrics`, {
        params: periodParams(period),
      })
      .pipe(map((response) => response.data));
  }
}

function periodParams(period: PeriodLabel | undefined): HttpParams {
  return period === undefined ? new HttpParams() : new HttpParams().set('period', period);
}
