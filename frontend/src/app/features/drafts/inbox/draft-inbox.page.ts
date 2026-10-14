import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideInbox } from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { serverMessage } from '../../../core/api/api-error';
import { DraftsApi } from '../../../core/api/drafts.api';
import { Draft } from '../../../core/api/models';
import { PageHeader } from '../../../shared/layout/page-header';
import { UiAlert, UiButton, UiCard, UiEmptyState, UiSkeletonList } from '../../../shared/ui';
import { isRecurringDraft } from '../draft-display';
import { PendingDrafts } from '../pending-drafts';
import { RecurringConfirmSheet } from '../recurring-confirm/recurring-confirm-sheet';
import { DraftRowContent } from './draft-row-content';

const PAGE_SIZE = 50;

@Component({
  selector: 'app-draft-inbox-page',
  imports: [
    DraftRowContent,
    PageHeader,
    RecurringConfirmSheet,
    RouterLink,
    UiAlert,
    UiButton,
    UiCard,
    UiEmptyState,
    UiSkeletonList,
  ],
  providers: [provideIcons({ lucideInbox })],
  template: `
    <app-page-header
      title="Pendientes"
      subtitle="Borradores de voz, foto y fijos variables. Nada se guarda hasta que lo confirmes."
      backLink="/movimientos"
      backLabel="Movimientos"
    />
    @if (failure(); as message) {
      <ui-alert class="mb-4" retryable [retrying]="loading()" (retry)="loadMore()">
        {{ message }}
      </ui-alert>
    }
    @if (!loaded()) {
      <ui-card padding="none">
        <ui-skeleton-list label="Cargando pendientes" [rows]="4" />
      </ui-card>
    } @else if (drafts().length === 0) {
      @if (failure() === null) {
        <ui-empty-state
          title="No hay borradores pendientes"
          description="Cuando registres un gasto por voz o con una foto, aparecerá aquí hasta que lo revises."
          icon="lucideInbox"
        />
      }
    } @else {
      <ul uiCard divided data-testid="draft-list">
        @for (draft of drafts(); track draft.id) {
          <li>
            @if (recurring(draft)) {
              <button
                type="button"
                class="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-150 hover:bg-hover active:bg-pressed"
                data-testid="draft-row"
                (click)="confirming.set(draft)"
              >
                <app-draft-row-content [draft]="draft" />
              </button>
            } @else {
              <a
                [routerLink]="['/pendientes', draft.id]"
                class="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-hover active:bg-pressed"
                data-testid="draft-row"
              >
                <app-draft-row-content [draft]="draft" />
              </a>
            }
          </li>
        }
      </ul>
      @if (hasMore()) {
        <div class="mt-4 flex justify-center">
          <ui-button variant="outline" [loading]="loading()" (clicked)="loadMore()">
            Cargar más
          </ui-button>
        </div>
      }
    }

    <app-recurring-confirm-sheet
      [draft]="confirming()"
      (resolved)="onResolved($event)"
      (closed)="confirming.set(null)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftInboxPage implements OnInit {
  private readonly api = inject(DraftsApi);
  private readonly pending = inject(PendingDrafts);

  protected readonly drafts = signal<Draft[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly confirming = signal<Draft | null>(null);
  protected readonly recurring = isRecurringDraft;
  private page = 0;

  ngOnInit(): void {
    void this.pending.refresh();
    void this.loadMore();
  }

  protected onResolved(draftId: number): void {
    this.confirming.set(null);
    this.drafts.update((drafts) => drafts.filter((draft) => draft.id !== draftId));
    void this.pending.refresh();
  }

  protected async loadMore(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.failure.set(null);
    try {
      const next = this.page + 1;
      const page = await firstValueFrom(
        this.api.list({ status: 'pending', page: next, per_page: PAGE_SIZE }),
      );
      this.page = next;
      this.drafts.update((drafts) => [...drafts, ...page.data]);
      this.hasMore.set(page.meta.current_page < page.meta.last_page);
    } catch (error: unknown) {
      this.failure.set(serverMessage(error) ?? 'No se pudieron cargar los pendientes.');
    } finally {
      this.loading.set(false);
      this.loaded.set(true);
    }
  }
}
