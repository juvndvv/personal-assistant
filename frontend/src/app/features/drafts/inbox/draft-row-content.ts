import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCamera, lucideChevronRight, lucideMic, lucideRepeat } from '@ng-icons/lucide';
import { Draft } from '../../../core/api/models';
import { formatDate } from '../../../core/date/iso-date';
import { EurPipe } from '../../../core/money/eur.pipe';
import { UiBadge } from '../../../shared/ui';
import {
  DRAFT_ORIGIN_ICON,
  DRAFT_ORIGIN_LABEL,
  RECURRING_DRAFT_PROMPT,
  draftTitle,
  isRecurringDraft,
} from '../draft-display';

@Component({
  selector: 'app-draft-row-content',
  imports: [EurPipe, NgIcon, UiBadge],
  providers: [provideIcons({ lucideCamera, lucideChevronRight, lucideMic, lucideRepeat })],
  host: { class: 'contents' },
  template: `
    <span
      class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
    >
      <ng-icon [name]="originIcon()" size="18" [attr.aria-label]="originLabel()" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate font-medium text-foreground">{{ title() }}</span>
      <span class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {{ dateLabel() }}
        @if (recurring()) {
          <ui-badge tone="warning">{{ recurringPrompt }}</ui-badge>
        } @else if (draft().capture?.status === 'failed') {
          <ui-badge tone="warning">Sin analizar</ui-badge>
        } @else if (draft().low_confidence_fields.length > 0) {
          <ui-badge tone="warning">{{ draft().low_confidence_fields.length }} por revisar</ui-badge>
        }
      </span>
    </span>
    <span class="shrink-0 text-end font-medium tabular-nums text-foreground">
      @if (draft().proposal.amount_cents; as amount) {
        @if (recurring()) {
          <span class="block text-xs font-normal text-muted-foreground">Estimado</span>
        }
        {{ amount | eur }}
      } @else {
        —
      }
    </span>
    <ng-icon name="lucideChevronRight" class="text-muted-foreground" aria-hidden="true" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftRowContent {
  readonly draft = input.required<Draft>();

  protected readonly recurringPrompt = RECURRING_DRAFT_PROMPT;
  protected readonly recurring = computed(() => isRecurringDraft(this.draft()));
  protected readonly title = computed(() => draftTitle(this.draft()));
  protected readonly originIcon = computed(() => DRAFT_ORIGIN_ICON[this.draft().origin]);
  protected readonly originLabel = computed(() => DRAFT_ORIGIN_LABEL[this.draft().origin]);
  protected readonly dateLabel = computed(() => {
    const draft = this.draft();
    const date = draft.proposal.date ?? draft.recurring?.due_date ?? null;
    return date === null ? 'Sin fecha' : formatDate(date, 'medium');
  });
}
