import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import { DataEnvelope, Settings, SettingsPatch } from './models';

@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly http = inject(HttpClient);

  get(): Observable<Settings> {
    return this.http
      .get<DataEnvelope<Settings>>(`${API_BASE}/settings`)
      .pipe(map((response) => response.data));
  }

  update(patch: SettingsPatch): Observable<Settings> {
    return this.http
      .patch<DataEnvelope<Settings>>(`${API_BASE}/settings`, patch)
      .pipe(map((response) => response.data));
  }
}
