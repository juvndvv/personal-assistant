import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  model,
} from '@angular/core';
import { isIsoDate } from '../../core/date/iso-date';
import { hintIdFor } from './field-accessibility';
import { UiField } from './ui-field';
import { UiSize, UiState, nextUiId } from './ui-types';

const SIZE_CLASS: Record<UiSize, string> = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-base md:text-sm',
  lg: 'h-12 text-base',
};

const STATE_CLASS: Record<UiState, string> = {
  default: 'border-input focus-visible:border-ring focus-visible:ring-ring/50',
  warning: 'border-warning focus-visible:ring-warning/30',
  error: 'border-destructive focus-visible:ring-destructive/20',
};

@Component({
  selector: 'ui-date-input',
  imports: [UiField],
  template: `
    <ui-field
      [controlId]="inputId()"
      [label]="label()"
      [hint]="hint()"
      [state]="state()"
      [required]="required()"
    >
      <input
        type="date"
        [id]="inputId()"
        [attr.name]="name() ?? null"
        [attr.aria-describedby]="hint() ? hintId() : null"
        [value]="value() ?? ''"
        [attr.min]="min() ?? null"
        [attr.max]="max() ?? null"
        [required]="required()"
        [disabled]="disabled()"
        [attr.aria-invalid]="state() === 'error' ? 'true' : null"
        [class]="inputClass()"
        (input)="onInput($event)"
      />
    </ui-field>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiDateInput {
  readonly value = model<string | null>(null);
  readonly label = input<string>();
  readonly hint = input<string>();
  readonly state = input<UiState>('default');
  readonly size = input<UiSize>('md');
  readonly min = input<string>();
  readonly max = input<string>();
  readonly name = input<string>();
  readonly required = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly inputId = input(nextUiId('ui-date-input'));

  protected readonly hintId = computed(() => hintIdFor(this.inputId()));
  protected readonly inputClass = computed(
    () =>
      `w-full min-w-0 appearance-none rounded-lg border bg-transparent px-3 text-start text-foreground outline-none transition-colors duration-150 focus-visible:ring-3 [&::-webkit-date-and-time-value]:text-start disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASS[this.size()]} ${STATE_CLASS[this.state()]}`,
  );

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.value.set(isIsoDate(raw) ? raw : null);
  }
}
