import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import { DataEnvelope, QuickAddDefaults } from './models';

@Injectable({ providedIn: 'root' })
export class QuickAddApi {
  private readonly http = inject(HttpClient);

  defaults(): Observable<QuickAddDefaults> {
    return this.http
      .get<DataEnvelope<QuickAddDefaults>>(`${API_BASE}/quick-add/defaults`)
      .pipe(map((response) => response.data));
  }
}
