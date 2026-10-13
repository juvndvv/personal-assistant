import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { User } from '../api/models';
import { authGuard, guestGuard } from './auth.guards';
import { AuthStore } from './auth.store';

const dani: User = { id: 1, name: 'Dani', email: 'dani@example.com' };

function runGuard(guard: typeof authGuard, url: string) {
  return TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );
}

const serialize = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

describe('auth guards', () => {
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  const answerMe = (body: { data: User } | null, status = 200, statusText = 'OK') =>
    backend.expectOne('/api/v1/auth/me').flush(body, { status, statusText });

  const failMeWithNetworkError = () =>
    backend.expectOne('/api/v1/auth/me').error(new ProgressEvent('error'), { status: 0 });

  describe('authGuard', () => {
    it('lets an authenticated user through', async () => {
      const result = runGuard(authGuard, '/movimientos');
      answerMe({ data: dani });
      await expect(result).resolves.toBe(true);
    });

    it('sends a guest to the login page keeping the requested url', async () => {
      const result = runGuard(authGuard, '/informes?period=2026-10');
      answerMe(null, 401, 'Unauthorized');
      expect(serialize(await result)).toBe('/login?returnUrl=%2Finformes%3Fperiod%3D2026-10');
    });

    it('sends a guest from the home page to the bare login page', async () => {
      const result = runGuard(authGuard, '/');
      answerMe(null, 401, 'Unauthorized');
      expect(serialize(await result)).toBe('/login');
    });

    it('shows the unavailable page instead of login when the device is offline', async () => {
      const result = runGuard(authGuard, '/movimientos');
      failMeWithNetworkError();
      expect(serialize(await result)).toBe('/sin-conexion?returnUrl=%2Fmovimientos');
    });

    it('shows the unavailable page instead of login when the server answers 503', async () => {
      const result = runGuard(authGuard, '/informes');
      answerMe(null, 503, 'Service Unavailable');
      expect(serialize(await result)).toBe('/sin-conexion?returnUrl=%2Finformes');
    });

    it('asks the server again on the next navigation after it was unavailable', async () => {
      const firstAttempt = runGuard(authGuard, '/movimientos');
      answerMe(null, 502, 'Bad Gateway');
      await firstAttempt;

      const retry = runGuard(authGuard, '/movimientos');
      answerMe({ data: dani });
      await expect(retry).resolves.toBe(true);
    });
  });

  describe('guestGuard', () => {
    it('lets a guest see the login page', async () => {
      const result = runGuard(guestGuard, '/login');
      answerMe(null, 401, 'Unauthorized');
      await expect(result).resolves.toBe(true);
    });

    it('sends an authenticated user home', async () => {
      const result = runGuard(guestGuard, '/login');
      answerMe({ data: dani });
      expect(serialize(await result)).toBe('/');
    });

    it('shows the unavailable page when the session cannot be checked', async () => {
      const result = runGuard(guestGuard, '/login');
      failMeWithNetworkError();
      expect(serialize(await result)).toBe('/sin-conexion?returnUrl=%2Flogin');
    });
  });

  it('keeps reusing a settled session without asking the server again', async () => {
    const first = runGuard(authGuard, '/');
    answerMe({ data: dani });
    await first;

    await expect(runGuard(authGuard, '/mas')).resolves.toBe(true);
    expect(TestBed.inject(AuthStore).status()).toBe('authenticated');
  });
});
