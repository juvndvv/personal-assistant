import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import { DataEnvelope, Draft, DraftListQuery, Paginated } from './models';

const DRAFTS = `${API_BASE}/drafts`;

export function draftListParams(query: DraftListQuery): HttpParams {
  let params = new HttpParams();
  if (query.status !== undefined) {
    params = params.set('status', query.status);
  }
  for (const origin of query.origin ?? []) {
    params = params.append('origin[]', origin);
  }
  if (query.page !== undefined) {
    params = params.set('page', query.page);
  }
  if (query.per_page !== undefined) {
    params = params.set('per_page', query.per_page);
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class DraftsApi {
  private readonly http = inject(HttpClient);

  list(query: DraftListQuery = {}): Observable<Paginated<Draft>> {
    return this.http.get<Paginated<Draft>>(DRAFTS, { params: draftListParams(query) });
  }

  get(id: number): Observable<Draft> {
    return this.http
      .get<DataEnvelope<Draft>>(`${DRAFTS}/${id}`)
      .pipe(map((response) => response.data));
  }

  discard(id: number): Observable<Draft> {
    return this.http
      .post<DataEnvelope<Draft>>(`${DRAFTS}/${id}/discard`, null)
      .pipe(map((response) => response.data));
  }
}
