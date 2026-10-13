import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';
import { HOME_PATH, loginUrlFor, unavailableUrlFor } from './login-url';

export const authGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  switch (await inject(AuthStore).loadMe()) {
    case 'authenticated':
      return true;
    case 'guest':
      return router.parseUrl(loginUrlFor(state.url));
    case 'unavailable':
      return router.parseUrl(unavailableUrlFor(state.url));
  }
};

export const guestGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  switch (await inject(AuthStore).loadMe()) {
    case 'guest':
      return true;
    case 'authenticated':
      return router.parseUrl(HOME_PATH);
    case 'unavailable':
      return router.parseUrl(unavailableUrlFor(state.url));
  }
};
