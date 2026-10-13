import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCamera,
  lucideChevronRight,
  lucideInbox,
  lucideMic,
  lucideRepeat,
} from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { serverMessage } from '../../../core/api/api-error';
import { DraftsApi } from '../../../core/api/drafts.api';
import { Draft } from '../../../core/api/models';
import { formatDate } from '../../../core/date/iso-date';
import { EurPipe } from '../../../core/money/eur.pipe';
import { PageHeader } from '../../../shared/layout/page-header';
import { UiBadge, UiButton, UiEmptyState } from '../../../shared/ui';
import { DRAFT_ORIGIN_ICON, DRAFT_ORIGIN_LABEL, draftTitle } from '../draft-display';
import { PendingDrafts } from '../pending-drafts';

const PAGE_SIZE = 50;

@Component({
  selector: 'app-draft-inbox-page',
  imports: [EurPipe, NgIcon, PageHeader, RouterLink, UiBadge, UiButton, UiEmptyState],
  providers: [
    provideIcons({ lucideCamera, lucideChevronRight, lucideInbox, lucideMic, lucideRepeat }),
  ],
  template: `
    <app-page-header
      title="Pendientes"
      subtitle="Borradores de voz, foto y fijos variables. Nada se guarda hasta que lo confirmes."
    />
    @if (failure(); as message) {
      <p role="alert" class="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {{ message }}
      </p>
    }
    @if (loaded() && drafts().length === 0) {
      <ui-empty-state
        title="No hay borradores pendientes"
        description="Cuando registres un gasto por voz o con una foto, aparecerá aquí hasta que lo revises."
        icon="lucideInbox"
      />
    } @else {
      <ul
        class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background"
        data-testid="draft-list"
      >
        @for (draft of drafts(); track draft.id) {
          <li>
            <a
              [routerLink]="['/pendientes', draft.id]"
              class="flex items-center gap-3 px-4 py-3 hover:bg-muted/60"
              data-testid="draft-row"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <ng-icon
                  [name]="originIcon[draft.origin]"
                  size="18"
                  [attr.aria-label]="originLabel[draft.origin]"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-foreground">{{ title(draft) }}</span>
                <span class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {{ dateLabel(draft) }}
                  @if (draft.capture?.status === 'failed') {
                    <ui-badge tone="warning">Sin analizar</ui-badge>
                  } @else if (draft.low_confidence_fields.length > 0) {
                    <ui-badge tone="warning">
                      {{ draft.low_confidence_fields.length }} por revisar
                    </ui-badge>
                  }
                </span>
              </span>
              <span class="shrink-0 font-medium tabular-nums text-foreground">
                @if (draft.proposal.amount_cents !== null) {
                  {{ draft.proposal.amount_cents | eur }}
                } @else {
                  —
                }
              </span>
              <ng-icon name="lucideChevronRight" class="text-muted-foreground" aria-hidden="true" />
            </a>
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
      @if (!loaded()) {
        <p class="mt-4 text-sm text-muted-foreground" role="status">Cargando pendientes…</p>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftInboxPage implements OnInit {
  private readonly api = inject(DraftsApi);
  private readonly pending = inject(PendingDrafts);

  protected readonly originIcon = DRAFT_ORIGIN_ICON;
  protected readonly originLabel = DRAFT_ORIGIN_LABEL;
  protected readonly drafts = signal<Draft[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly failure = signal<string | null>(null);
  private page = 0;

  ngOnInit(): void {
    void this.pending.refresh();
    void this.loadMore();
  }

  protected title(draft: Draft): string {
    return draftTitle(draft);
  }

  protected dateLabel(draft: Draft): string {
    const date = draft.proposal.date ?? draft.recurring?.due_date ?? null;
    return date === null ? 'Sin fecha' : formatDate(date, 'medium');
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
