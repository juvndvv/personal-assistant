import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Draft } from '../../core/api/models';
import { DraftsApi } from '../../core/api/drafts.api';

@Injectable({ providedIn: 'root' })
export class PendingDrafts {
  private readonly api = inject(DraftsApi);
  private readonly total = signal(0);
  private readonly known = new Map<number, Draft>();
  private inFlight: Promise<void> | null = null;

  readonly count = this.total.asReadonly();

  refresh(): Promise<void> {
    this.inFlight ??= firstValueFrom(this.api.list({ status: 'pending', per_page: 1 }))
      .then((page) => this.total.set(page.meta.total))
      .catch(() => undefined)
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  remember(draft: Draft): void {
    this.known.set(draft.id, draft);
  }

  recall(id: number): Draft | null {
    return this.known.get(id) ?? null;
  }

  forget(id: number): void {
    this.known.delete(id);
  }
}
