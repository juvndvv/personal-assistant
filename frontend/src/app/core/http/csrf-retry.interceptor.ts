import {
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpXsrfTokenExtractor,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { CSRF_COOKIE_PATH } from '../api/api-paths';
import { CSRF_RETRIED } from './http-context';
import { XSRF_HEADER_NAME } from './xsrf';

const CSRF_TOKEN_MISMATCH = 419;

export const csrfRetryInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.context.get(CSRF_RETRIED) || request.url === CSRF_COOKIE_PATH) {
    return next(request);
  }

  const http = inject(HttpClient);
  const tokenExtractor = inject(HttpXsrfTokenExtractor);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== CSRF_TOKEN_MISMATCH) {
        return throwError(() => error);
      }
      return http.get<void>(CSRF_COOKIE_PATH).pipe(
        switchMap(() => {
          const token = tokenExtractor.getToken();
          const retried = request.clone({
            context: request.context.set(CSRF_RETRIED, true),
            setHeaders: token === null ? {} : { [XSRF_HEADER_NAME]: token },
          });
          return next(retried);
        }),
      );
    }),
  );
};
