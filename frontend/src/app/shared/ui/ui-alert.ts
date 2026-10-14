import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideCircleCheck,
  lucideInfo,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { UiButton } from './ui-button';

export type UiAlertTone = 'error' | 'warning' | 'info' | 'success';

interface ToneStyle {
  icon: string;
  surface: string;
  accent: string;
  role: 'alert' | 'status';
}

const TONES: Record<UiAlertTone, ToneStyle> = {
  error: {
    icon: 'lucideCircleAlert',
    surface: 'bg-callout-error',
    accent: 'text-danger-text',
    role: 'alert',
  },
  warning: {
    icon: 'lucideTriangleAlert',
    surface: 'bg-callout-warning',
    accent: 'text-warning-text',
    role: 'alert',
  },
  info: {
    icon: 'lucideInfo',
    surface: 'bg-callout-info',
    accent: 'text-info-text',
    role: 'status',
  },
  success: {
    icon: 'lucideCircleCheck',
    surface: 'bg-callout-success',
    accent: 'text-success-text',
    role: 'status',
  },
};

@Component({
  selector: 'ui-alert',
  imports: [NgIcon, UiButton],
  providers: [
    provideIcons({ lucideCircleAlert, lucideCircleCheck, lucideInfo, lucideTriangleAlert }),
  ],
  host: { class: 'block' },
  template: `
    <div
      [attr.role]="style().role"
      class="flex items-start gap-3 rounded-card px-4 py-3 text-sm text-foreground"
      [class]="style().surface"
    >
      <ng-icon
        [name]="style().icon"
        size="20"
        aria-hidden="true"
        class="mt-px shrink-0"
        [class]="style().accent"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        @if (title()) {
          <p class="font-semibold">{{ title() }}</p>
        }
        <div class="text-foreground"><ng-content /></div>
      </div>
      @if (retryable()) {
        <ui-button
          class="-my-1 shrink-0"
          variant="secondary"
          size="sm"
          [loading]="retrying()"
          (clicked)="retry.emit()"
          >{{ retryLabel() }}</ui-button
        >
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiAlert {
  readonly tone = input<UiAlertTone>('error');
  readonly title = input<string>();
  readonly retryable = input(false, { transform: booleanAttribute });
  readonly retrying = input(false, { transform: booleanAttribute });
  readonly retryLabel = input('Reintentar');

  readonly retry = output<void>();

  protected readonly style = computed(() => TONES[this.tone()]);
}
