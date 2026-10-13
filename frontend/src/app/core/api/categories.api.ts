import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import { Category, CategoryInput, CategoryKind, CategoryPatch, DataEnvelope } from './models';

const CATEGORIES = `${API_BASE}/categories`;

export interface CategoryListQuery {
  kind?: CategoryKind;
  includeArchived?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly http = inject(HttpClient);

  list(query: CategoryListQuery = {}): Observable<Category[]> {
    let params = new HttpParams().set('include_archived', query.includeArchived ? 1 : 0);
    if (query.kind !== undefined) {
      params = params.set('kind', query.kind);
    }
    return this.http
      .get<DataEnvelope<Category[]>>(CATEGORIES, { params })
      .pipe(map((response) => response.data));
  }

  create(input: CategoryInput): Observable<Category> {
    return this.http
      .post<DataEnvelope<Category>>(CATEGORIES, input)
      .pipe(map((response) => response.data));
  }

  update(id: number, patch: CategoryPatch): Observable<Category> {
    return this.http
      .patch<DataEnvelope<Category>>(`${CATEGORIES}/${id}`, patch)
      .pipe(map((response) => response.data));
  }

  archive(id: number): Observable<Category> {
    return this.http
      .post<DataEnvelope<Category>>(`${CATEGORIES}/${id}/archive`, null)
      .pipe(map((response) => response.data));
  }

  unarchive(id: number): Observable<Category> {
    return this.http
      .post<DataEnvelope<Category>>(`${CATEGORIES}/${id}/unarchive`, null)
      .pipe(map((response) => response.data));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${CATEGORIES}/${id}`);
  }
}
