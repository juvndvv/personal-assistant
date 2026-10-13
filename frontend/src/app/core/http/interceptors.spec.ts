import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../auth/auth.store';
import { SKIP_UNAUTHORIZED_REDIRECT } from './http-context';
import { httpFeatures } from './provide-api-http';

describe('API interceptors', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let clearSession: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigateByUrl = vi.fn().mockResolvedValue(true);
    clearSession = vi.fn();
    document.cookie = 'XSRF-TOKEN=initial-token; path=/';

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(...httpFeatures),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigateByUrl, url: '/movimientos' } },
        { provide: AuthStore, useValue: { clearSession } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('sends credentials and asks for JSON', () => {
    http.get('/api/v1/auth/me').subscribe();

    const request = backend.expectOne('/api/v1/auth/me');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('Accept')).toBe('application/json');
    request.flush({ data: null });
  });

  it('sends the XSRF token from the cookie on mutating requests', () => {
    http.post('/api/v1/auth/logout', null).subscribe();

    const request = backend.expectOne('/api/v1/auth/logout');
    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('initial-token');
    request.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('refreshes the CSRF cookie and retries once after a 419', async () => {
    const response = firstValueFrom(http.post<{ ok: boolean }>('/api/v1/things', { a: 1 }));

    backend
      .expectOne('/api/v1/things')
      .flush({ message: 'CSRF token mismatch.' }, { status: 419, statusText: 'Expired' });

    const csrf = backend.expectOne('/sanctum/csrf-cookie');
    expect(csrf.request.method).toBe('GET');
    document.cookie = 'XSRF-TOKEN=fresh-token; path=/';
    csrf.flush(null, { status: 204, statusText: 'No Content' });

    const retry = backend.expectOne('/api/v1/things');
    expect(retry.request.headers.get('X-XSRF-TOKEN')).toBe('fresh-token');
    expect(retry.request.body).toEqual({ a: 1 });
    retry.flush({ ok: true });

    await expect(response).resolves.toEqual({ ok: true });
  });

  it('gives up after a second 419', async () => {
    const response = firstValueFrom(http.post('/api/v1/things', {}));

    backend.expectOne('/api/v1/things').flush(null, { status: 419, statusText: 'Expired' });
    backend.expectOne('/sanctum/csrf-cookie').flush(null, { status: 204, statusText: 'OK' });
    backend.expectOne('/api/v1/things').flush(null, { status: 419, statusText: 'Expired' });

    await expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
    backend.expectNone('/sanctum/csrf-cookie');
  });

  it('clears the session and redirects to /login on a 401', async () => {
    const response = firstValueFrom(http.get('/api/v1/accounts'));

    backend
      .expectOne('/api/v1/accounts')
      .flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });

    await expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(clearSession).toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/login?returnUrl=%2Fmovimientos');
  });

  it('does not redirect when the request opts out', async () => {
    const response = firstValueFrom(
      http.get('/api/v1/auth/me', {
        context: new HttpContext().set(SKIP_UNAUTHORIZED_REDIRECT, true),
      }),
    );

    backend.expectOne('/api/v1/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('passes other errors through untouched', async () => {
    const response = firstValueFrom(http.get('/api/v1/accounts'));

    backend.expectOne('/api/v1/accounts').flush(null, { status: 500, statusText: 'Error' });

    await expect(response).rejects.toMatchObject({ status: 500 });
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
