import { HttpErrorResponse } from '@angular/common/http';
import { ValidationErrorBody } from '../../core/api/models';

export interface LoginFailure {
  message: string | null;
  emailError: string | null;
}

const INVALID_CREDENTIALS = 'Credenciales incorrectas';
const SERVER_UNREACHABLE = 'No se pudo conectar con el servidor. Inténtalo de nuevo.';

export function describeLoginFailure(error: unknown): LoginFailure {
  if (!(error instanceof HttpErrorResponse)) {
    return { message: SERVER_UNREACHABLE, emailError: null };
  }
  if (error.status === 422) {
    const body = error.error as ValidationErrorBody | null;
    const emailError = body?.errors?.['email']?.[0] ?? INVALID_CREDENTIALS;
    return { message: null, emailError };
  }
  if (error.status === 429) {
    return { message: tooManyAttemptsMessage(error.headers.get('Retry-After')), emailError: null };
  }
  return { message: SERVER_UNREACHABLE, emailError: null };
}

function tooManyAttemptsMessage(retryAfter: string | null): string {
  const seconds = retryAfter === null ? NaN : Number.parseInt(retryAfter, 10);
  return Number.isFinite(seconds) && seconds > 0
    ? `Demasiados intentos. Vuelve a intentarlo en ${seconds} segundos.`
    : 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.';
}
