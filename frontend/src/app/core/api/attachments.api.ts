import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import { Attachment, DataEnvelope } from './models';

@Injectable({ providedIn: 'root' })
export class AttachmentsApi {
  private readonly http = inject(HttpClient);

  listForTransaction(transactionId: number): Observable<Attachment[]> {
    return this.http
      .get<DataEnvelope<Attachment[]>>(`${API_BASE}/transactions/${transactionId}/attachments`)
      .pipe(map((response) => response.data));
  }

  addToTransaction(transactionId: number, file: Blob, filename: string): Observable<Attachment> {
    const form = new FormData();
    form.append('file', file, filename);
    return this.http
      .post<DataEnvelope<Attachment>>(`${API_BASE}/transactions/${transactionId}/attachments`, form)
      .pipe(map((response) => response.data));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/attachments/${encodeURIComponent(id)}`);
  }
}
