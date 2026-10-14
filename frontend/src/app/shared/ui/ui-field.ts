import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { hintIdFor } from './field-accessibility';
import { UiState } from './ui-types';

const HINT_CLASS: Record<UiState, string> = {
  default: 'text-muted-foreground',
  warning: 'text-warning-text',
  error: 'text-danger-text',
};

@Component({
  selector: 'ui-field',
  template: `
    <div class="flex flex-col gap-2">
      @if (label()) {
        <div class="flex items-baseline gap-0.5">
          <label [attr.for]="controlId()" class="text-sm font-medium text-foreground">{{
            label()
          }}</label>
          @if (required()) {
            <span class="text-sm text-destructive" aria-hidden="true">*</span>
          }
        </div>
      }
      <ng-content />
      @if (hint()) {
        <p
          [id]="hintId()"
          class="text-[0.8125rem] leading-snug"
          [class]="hintClass()"
          [attr.role]="hintRole()"
        >
          {{ hint() }}
        </p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiField {
  readonly controlId = input.required<string>();
  readonly label = input<string>();
  readonly hint = input<string>();
  readonly state = input<UiState>('default');
  readonly required = input(false);

  protected readonly hintId = computed(() => hintIdFor(this.controlId()));
  protected readonly hintClass = computed(() => HINT_CLASS[this.state()]);
  protected readonly hintRole = computed(() => (this.state() === 'error' ? 'alert' : null));
}
