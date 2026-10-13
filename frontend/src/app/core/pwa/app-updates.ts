import { DOCUMENT, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private readonly swUpdate = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly versionReady = signal(false);

  readonly updateReady = this.versionReady.asReadonly();

  watch(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }
    const subscription = this.swUpdate.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => this.versionReady.set(true));
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  reload(): void {
    this.document.location.reload();
  }
}
