import { DOCUMENT, DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, fromEvent } from 'rxjs';

export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => {
    const location = inject(DOCUMENT).location;
    return () => location.reload();
  },
});

@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private readonly swUpdate = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadPage = inject(RELOAD_PAGE);
  private readonly pendingUpdate = signal(false);
  private readonly brokenServiceWorker = signal(false);

  readonly updateReady = this.pendingUpdate.asReadonly();
  readonly reloadRequired = this.brokenServiceWorker.asReadonly();

  watch(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }
    this.swUpdate.versionUpdates
      .pipe(
        filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.pendingUpdate.set(true));
    this.swUpdate.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.brokenServiceWorker.set(true);
      this.pendingUpdate.set(true);
    });
    fromEvent(this.document, 'visibilitychange')
      .pipe(
        filter(() => this.document.visibilityState === 'visible'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.checkForUpdate());
  }

  async applyUpdate(): Promise<void> {
    await this.swUpdate.activateUpdate().catch(() => false);
    this.reloadPage();
  }

  reload(): void {
    this.reloadPage();
  }

  dismiss(): void {
    if (this.brokenServiceWorker()) {
      return;
    }
    this.pendingUpdate.set(false);
  }

  private checkForUpdate(): void {
    void this.swUpdate.checkForUpdate().catch(() => false);
  }
}
