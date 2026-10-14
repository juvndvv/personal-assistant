import { HttpErrorResponse } from '@angular/common/http';
import { isIpBlocked } from '../../core/api/api-error';
import { ValidationErrorBody } from '../../core/api/models';

export interface LoginFailure {
  message: string | null;
  emailError: string | null;
}

const INVALID_CREDENTIALS = 'Credenciales incorrectas';
const SERVER_UNREACHABLE = 'No se pudo conectar con el servidor. Inténtalo de nuevo.';
const FORBIDDEN =
  'No tienes permiso para acceder. Si el problema continúa, revisa la configuración del servidor.';
const IP_BLOCKED = 'Hemos bloqueado el acceso desde esta red por demasiados intentos fallidos.';
const SECONDS_PER_MINUTE = 60;

export function describeLoginFailure(error: unknown): LoginFailure {
  if (!(error instanceof HttpErrorResponse)) {
    return { message: SERVER_UNREACHABLE, emailError: null };
  }
  const retryAfterSeconds = parseRetryAfter(error.headers.get('Retry-After'));
  switch (error.status) {
    case 422:
      return { message: null, emailError: invalidCredentialsMessage(error) };
    case 429:
      return { message: tooManyAttemptsMessage(retryAfterSeconds), emailError: null };
    case 403:
      return {
        message: isIpBlocked(error) ? ipBlockedMessage(retryAfterSeconds) : FORBIDDEN,
        emailError: null,
      };
    default:
      return { message: SERVER_UNREACHABLE, emailError: null };
  }
}

function invalidCredentialsMessage(error: HttpErrorResponse): string {
  const body = error.error as ValidationErrorBody | null;
  return body?.errors?.['email']?.[0] ?? INVALID_CREDENTIALS;
}

function parseRetryAfter(retryAfter: string | null): number | null {
  const seconds = retryAfter === null ? NaN : Number.parseInt(retryAfter, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function tooManyAttemptsMessage(seconds: number | null): string {
  if (seconds === null) {
    return 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.';
  }
  return `Demasiados intentos. Vuelve a intentarlo en ${waitDescription(seconds)}.`;
}

function ipBlockedMessage(seconds: number | null): string {
  const wait = seconds === null ? 'dentro de una hora' : `en ${waitDescription(seconds)}`;
  return `${IP_BLOCKED} Vuelve a intentarlo ${wait}.`;
}

function waitDescription(seconds: number): string {
  if (seconds <= SECONDS_PER_MINUTE) {
    return seconds === 1 ? '1 segundo' : `${seconds} segundos`;
  }
  const minutes = Math.ceil(seconds / SECONDS_PER_MINUTE);
  return `${minutes} minutos`;
}
