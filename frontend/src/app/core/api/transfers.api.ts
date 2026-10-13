import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api-paths';
import { DataEnvelope, Transfer, TransferInput, TransferPatch } from './models';

const TRANSFERS = `${API_BASE}/transfers`;

@Injectable({ providedIn: 'root' })
export class TransfersApi {
  private readonly http = inject(HttpClient);

  get(id: number): Observable<Transfer> {
    return this.http
      .get<DataEnvelope<Transfer>>(`${TRANSFERS}/${id}`)
      .pipe(map((response) => response.data));
  }

  create(input: TransferInput): Observable<Transfer> {
    return this.http
      .post<DataEnvelope<Transfer>>(TRANSFERS, input)
      .pipe(map((response) => response.data));
  }

  update(id: number, patch: TransferPatch): Observable<Transfer> {
    return this.http
      .patch<DataEnvelope<Transfer>>(`${TRANSFERS}/${id}`, patch)
      .pipe(map((response) => response.data));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${TRANSFERS}/${id}`);
  }

  restore(id: number): Observable<Transfer> {
    return this.http
      .post<DataEnvelope<Transfer>>(`${TRANSFERS}/${id}/restore`, null)
      .pipe(map((response) => response.data));
  }
}
