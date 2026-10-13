import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConnectivityStatus {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly onlineState = signal(this.window?.navigator.onLine ?? true);

  readonly online = this.onlineState.asReadonly();

  constructor() {
    this.window?.addEventListener('online', () => this.onlineState.set(true));
    this.window?.addEventListener('offline', () => this.onlineState.set(false));
  }
}
