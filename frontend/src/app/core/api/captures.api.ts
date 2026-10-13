import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import { CaptureResult, CaptureUpload, DataEnvelope } from './models';

@Injectable({ providedIn: 'root' })
export class CapturesApi {
  private readonly http = inject(HttpClient);

  create(upload: CaptureUpload): Observable<CaptureResult> {
    const form = new FormData();
    form.append('kind', upload.kind);
    form.append('file', upload.file, upload.filename);
    if (upload.clientStartedAt !== undefined) {
      form.append('client_started_at', upload.clientStartedAt);
    }
    return this.http
      .post<DataEnvelope<CaptureResult>>(`${API_BASE}/captures`, form)
      .pipe(map((response) => response.data));
  }
}
