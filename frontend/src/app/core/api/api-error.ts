import { HttpErrorResponse } from '@angular/common/http';
import { ConflictErrorBody, ValidationErrorBody } from './models';

const FORBIDDEN = 403;
const CONFLICT = 409;
const IP_BLOCKED = 'ip_blocked';
const UNPROCESSABLE = 422;

export function conflictCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== CONFLICT) {
    return null;
  }
  const body = error.error as Partial<ConflictErrorBody> | null;
  return typeof body?.code === 'string' ? body.code : null;
}

export function validationErrors(error: unknown): Record<string, string> | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== UNPROCESSABLE) {
    return null;
  }
  const body = error.error as ValidationErrorBody | null;
  const firstMessages: Record<string, string> = {};
  for (const [field, messages] of Object.entries(body?.errors ?? {})) {
    const first = messages[0];
    if (first !== undefined) {
      firstMessages[field] = first;
    }
  }
  return firstMessages;
}

export function serverMessage(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body = error.error as { message?: unknown } | null;
  return typeof body?.message === 'string' ? body.message : null;
}

export function isIpBlocked(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== FORBIDDEN) {
    return false;
  }
  const body = error.error as { code?: unknown } | null;
  return body?.code === IP_BLOCKED;
}
