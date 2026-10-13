import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../api/auth.api';
import { LoginCredentials, User } from '../api/models';
import { LOGIN_PATH } from './login-url';

export type SessionStatus = 'unknown' | 'authenticated' | 'guest' | 'unavailable';
export type SettledSessionStatus = Exclude<SessionStatus, 'unknown'>;

const UNAUTHENTICATED = 401;

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly currentUser = signal<User | null>(null);
  private readonly sessionStatus = signal<SessionStatus>('unknown');
  private pendingLoad: Promise<SettledSessionStatus> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly status = this.sessionStatus.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionStatus() === 'authenticated');

  loadMe(): Promise<SettledSessionStatus> {
    const status = this.sessionStatus();
    if (status === 'authenticated' || status === 'guest') {
      return Promise.resolve(status);
    }
    this.pendingLoad ??= this.fetchMe().finally(() => {
      this.pendingLoad = null;
    });
    return this.pendingLoad;
  }

  async login(credentials: LoginCredentials): Promise<User> {
    const user = await firstValueFrom(this.api.login(credentials));
    this.startSession(user);
    return user;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.logout());
    } finally {
      this.clearSession();
      await this.router.navigateByUrl(LOGIN_PATH);
    }
  }

  clearSession(): void {
    this.currentUser.set(null);
    this.sessionStatus.set('guest');
  }

  private async fetchMe(): Promise<SettledSessionStatus> {
    try {
      this.startSession(await firstValueFrom(this.api.me()));
      return 'authenticated';
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === UNAUTHENTICATED) {
        this.clearSession();
        return 'guest';
      }
      this.sessionStatus.set('unavailable');
      return 'unavailable';
    }
  }

  private startSession(user: User): void {
    this.currentUser.set(user);
    this.sessionStatus.set('authenticated');
  }
}
