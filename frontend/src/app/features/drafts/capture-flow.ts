import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, TimeoutError, timeout } from 'rxjs';
import { validationErrors } from '../../core/api/api-error';
import { CapturesApi } from '../../core/api/captures.api';
import { CaptureKind, CaptureResult, CaptureUpload } from '../../core/api/models';
import { PendingDrafts } from './pending-drafts';

export const CAPTURE_CLIENT_TIMEOUT_MS = 25_000;
const TOO_MANY_REQUESTS = 429;

export const CAPTURE_MESSAGES = {
  timeout:
    'El análisis está tardando demasiado. Introduce el movimiento a mano o inténtalo de nuevo.',
  throttled: 'Has alcanzado el límite de capturas por hora. Introduce el movimiento a mano.',
  invalid: 'El archivo no es válido. Prueba otra vez o introdúcelo a mano.',
  generic: 'No se pudo procesar la captura. Introduce el movimiento a mano o inténtalo de nuevo.',
} as const;

export function captureFailureMessage(error: unknown): string {
  if (error instanceof TimeoutError) {
    return CAPTURE_MESSAGES.timeout;
  }
  if (error instanceof HttpErrorResponse && error.status === TOO_MANY_REQUESTS) {
    return CAPTURE_MESSAGES.throttled;
  }
  const fields = validationErrors(error);
  if (fields !== null) {
    return fields['file'] ?? fields['kind'] ?? CAPTURE_MESSAGES.invalid;
  }
  return CAPTURE_MESSAGES.generic;
}

@Injectable({ providedIn: 'root' })
export class CaptureFlow {
  private readonly api = inject(CapturesApi);
  private readonly pending = inject(PendingDrafts);
  private readonly router = inject(Router);
  private subscription: Subscription | null = null;
  private settle: ((result: CaptureResult | null) => void) | null = null;

  readonly processing = signal<CaptureKind | null>(null);
  readonly failure = signal<string | null>(null);

  submit(upload: CaptureUpload): Promise<CaptureResult | null> {
    this.cancel();
    this.failure.set(null);
    this.processing.set(upload.kind);
    return new Promise<CaptureResult | null>((resolve) => {
      this.settle = resolve;
      this.subscription = this.api
        .create(upload)
        .pipe(timeout({ first: CAPTURE_CLIENT_TIMEOUT_MS }))
        .subscribe({
          next: (result) => {
            this.finish(result);
            void this.open(result);
          },
          error: (error: unknown) => {
            this.failure.set(captureFailureMessage(error));
            this.finish(null);
          },
        });
    });
  }

  cancel(): void {
    this.subscription?.unsubscribe();
    this.finish(null);
  }

  clearFailure(): void {
    this.failure.set(null);
  }

  private finish(result: CaptureResult | null): void {
    this.subscription = null;
    this.processing.set(null);
    const settle = this.settle;
    this.settle = null;
    settle?.(result);
  }

  private async open(result: CaptureResult): Promise<void> {
    this.pending.remember(result.draft);
    void this.pending.refresh();
    await this.router.navigate(['/pendientes', result.draft.id]);
  }
}
