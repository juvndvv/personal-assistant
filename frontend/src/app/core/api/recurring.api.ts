import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import {
  DataEnvelope,
  PeriodLabel,
  RecurringForecast,
  RecurringTemplate,
  RecurringTemplateInput,
  RecurringTemplatePatch,
} from './models';

const TEMPLATES = `${API_BASE}/recurring-templates`;
const FORECAST = `${API_BASE}/recurring/forecast`;

@Injectable({ providedIn: 'root' })
export class RecurringApi {
  private readonly http = inject(HttpClient);

  list(includePaused = true): Observable<RecurringTemplate[]> {
    const params = new HttpParams().set('include_paused', includePaused ? 1 : 0);
    return this.http
      .get<DataEnvelope<RecurringTemplate[]>>(TEMPLATES, { params })
      .pipe(map((response) => response.data));
  }

  get(id: number): Observable<RecurringTemplate> {
    return this.http
      .get<DataEnvelope<RecurringTemplate>>(`${TEMPLATES}/${id}`)
      .pipe(map((response) => response.data));
  }

  create(input: RecurringTemplateInput): Observable<RecurringTemplate> {
    return this.http
      .post<DataEnvelope<RecurringTemplate>>(TEMPLATES, input)
      .pipe(map((response) => response.data));
  }

  update(id: number, patch: RecurringTemplatePatch): Observable<RecurringTemplate> {
    return this.http
      .patch<DataEnvelope<RecurringTemplate>>(`${TEMPLATES}/${id}`, patch)
      .pipe(map((response) => response.data));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${TEMPLATES}/${id}`);
  }

  pause(id: number): Observable<RecurringTemplate> {
    return this.http
      .post<DataEnvelope<RecurringTemplate>>(`${TEMPLATES}/${id}/pause`, null)
      .pipe(map((response) => response.data));
  }

  resume(id: number): Observable<RecurringTemplate> {
    return this.http
      .post<DataEnvelope<RecurringTemplate>>(`${TEMPLATES}/${id}/resume`, null)
      .pipe(map((response) => response.data));
  }

  forecast(period?: PeriodLabel): Observable<RecurringForecast> {
    const params = period === undefined ? new HttpParams() : new HttpParams().set('period', period);
    return this.http
      .get<DataEnvelope<RecurringForecast>>(FORECAST, { params })
      .pipe(map((response) => response.data));
  }
}
