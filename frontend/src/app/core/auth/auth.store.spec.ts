import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { User } from '../api/models';
import { AuthStore } from './auth.store';

const dani: User = { id: 1, name: 'Dani', email: 'dani@example.com' };

describe('AuthStore', () => {
  let store: AuthStore;
  let backend: HttpTestingController;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigateByUrl = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    store = TestBed.inject(AuthStore);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('starts with an unknown session', () => {
    expect(store.status()).toBe('unknown');
    expect(store.user()).toBeNull();
  });

  it('loads the current user once and caches it', async () => {
    const first = store.loadMe();
    const second = store.loadMe();
    backend.expectOne('/api/v1/auth/me').flush({ data: dani });

    await expect(first).resolves.toBe('authenticated');
    await expect(second).resolves.toBe('authenticated');
    await expect(store.loadMe()).resolves.toBe('authenticated');
    expect(store.user()).toEqual(dani);
    expect(store.isAuthenticated()).toBe(true);
  });

  it('marks the session as guest on 401', async () => {
    const loading = store.loadMe();
    backend.expectOne('/api/v1/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(loading).resolves.toBe('guest');
    expect(store.status()).toBe('guest');
    await expect(store.loadMe()).resolves.toBe('guest');
  });

  it('treats a blocked IP as a guest so the login page can explain the lockout', async () => {
    const loading = store.loadMe();
    backend
      .expectOne('/api/v1/auth/me')
      .flush({ message: 'Blocked.', code: 'ip_blocked' }, { status: 403, statusText: 'Forbidden' });

    await expect(loading).resolves.toBe('guest');
    expect(store.user()).toBeNull();
  });

  it('marks the session as unavailable on server errors and retries on the next load', async () => {
    const loading = store.loadMe();
    backend.expectOne('/api/v1/auth/me').flush(null, { status: 503, statusText: 'Unavailable' });

    await expect(loading).resolves.toBe('unavailable');
    expect(store.status()).toBe('unavailable');

    const retry = store.loadMe();
    backend.expectOne('/api/v1/auth/me').flush({ data: dani });
    await expect(retry).resolves.toBe('authenticated');
  });

  it('marks the session as unavailable when the network is down', async () => {
    const loading = store.loadMe();
    backend.expectOne('/api/v1/auth/me').error(new ProgressEvent('error'), { status: 0 });

    await expect(loading).resolves.toBe('unavailable');
    expect(store.user()).toBeNull();
  });

  it('fetches the CSRF cookie before logging in', async () => {
    const login = store.login({ email: dani.email, password: 'secret', remember: true });

    backend.expectOne('/sanctum/csrf-cookie').flush(null, { status: 204, statusText: 'OK' });
    await Promise.resolve();
    const request = backend.expectOne('/api/v1/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      email: dani.email,
      password: 'secret',
      remember: true,
    });
    request.flush({ data: dani });

    await expect(login).resolves.toEqual(dani);
    expect(store.user()).toEqual(dani);
  });

  it('logs out, clears the session and goes to the login page', async () => {
    const loading = store.loadMe();
    backend.expectOne('/api/v1/auth/me').flush({ data: dani });
    await loading;

    const logout = store.logout();
    backend.expectOne('/api/v1/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await logout;

    expect(store.user()).toBeNull();
    expect(store.status()).toBe('guest');
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
