import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import { DataEnvelope, EntryType } from './models';

const CATEGORIZATION = `${API_BASE}/suggestions/categorization`;

export interface CategorizationSuggestion {
  category_id: number | null;
  account_id: number | null;
  source: 'history';
  hits: number;
}

export interface CategorizationQuery {
  type: EntryType;
  merchant: string;
  description: string;
}

export function categorizationParams(query: CategorizationQuery): HttpParams {
  let params = new HttpParams().set('type', query.type);
  const merchant = query.merchant.trim();
  const description = query.description.trim();
  if (merchant !== '') {
    params = params.set('merchant', merchant);
  }
  if (description !== '') {
    params = params.set('description', description);
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class SuggestionsApi {
  private readonly http = inject(HttpClient);

  categorization(query: CategorizationQuery): Observable<CategorizationSuggestion | null> {
    return this.http
      .get<DataEnvelope<CategorizationSuggestion> | null>(CATEGORIZATION, {
        params: categorizationParams(query),
      })
      .pipe(map((response) => response?.data ?? null));
  }
}
