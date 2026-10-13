import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import { DataEnvelope, Tag } from './models';

const TAGS = `${API_BASE}/tags`;

@Injectable({ providedIn: 'root' })
export class TagsApi {
  private readonly http = inject(HttpClient);

  list(search = ''): Observable<Tag[]> {
    const term = search.trim();
    const params = term === '' ? new HttpParams() : new HttpParams().set('q', term);
    return this.http
      .get<DataEnvelope<Tag[]>>(TAGS, { params })
      .pipe(map((response) => response.data));
  }

  create(name: string): Observable<Tag> {
    return this.http.post<DataEnvelope<Tag>>(TAGS, { name }).pipe(map((response) => response.data));
  }

  rename(id: number, name: string): Observable<Tag> {
    return this.http
      .patch<DataEnvelope<Tag>>(`${TAGS}/${id}`, { name })
      .pipe(map((response) => response.data));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${TAGS}/${id}`);
  }
}
