import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from '../auth/auth.store';
import { loginUrlFor } from '../auth/login-url';
import { SKIP_UNAUTHORIZED_REDIRECT } from './http-context';

const UNAUTHENTICATED = 401;

export const unauthorizedInterceptor: HttpInterceptorFn = (request, next) => {
  const router = inject(Router);
  const authStore = inject(AuthStore);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === UNAUTHENTICATED &&
        !request.context.get(SKIP_UNAUTHORIZED_REDIRECT)
      ) {
        authStore.clearSession();
        void router.navigateByUrl(loginUrlFor(router.url));
      }
      return throwError(() => error);
    }),
  );
};
