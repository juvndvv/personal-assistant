import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import { SKIP_UNAUTHORIZED_REDIRECT } from '../http/http-context';
import { API_BASE, CSRF_COOKIE_PATH } from './api-paths';
import { DataEnvelope, LoginCredentials, User } from './models';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  me(): Observable<User> {
    return this.http
      .get<DataEnvelope<User>>(`${API_BASE}/auth/me`, {
        context: new HttpContext().set(SKIP_UNAUTHORIZED_REDIRECT, true),
      })
      .pipe(map((response) => response.data));
  }

  login(credentials: LoginCredentials): Observable<User> {
    return this.refreshCsrfCookie().pipe(
      switchMap(() =>
        this.http.post<DataEnvelope<User>>(`${API_BASE}/auth/login`, credentials, {
          context: new HttpContext().set(SKIP_UNAUTHORIZED_REDIRECT, true),
        }),
      ),
      map((response) => response.data),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${API_BASE}/auth/logout`, null);
  }

  refreshCsrfCookie(): Observable<void> {
    return this.http.get<void>(CSRF_COOKIE_PATH);
  }
}
