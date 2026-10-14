import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  model,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown } from '@ng-icons/lucide';
import { hintIdFor } from './field-accessibility';
import { UiField } from './ui-field';
import { FIELD_STATE_CLASS, UiSize, UiState, nextUiId } from './ui-types';

export interface UiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const SIZE_CLASS: Record<UiSize, string> = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-base md:text-sm',
  lg: 'h-12 text-base',
};

@Component({
  selector: 'ui-select',
  imports: [UiField, NgIcon],
  providers: [provideIcons({ lucideChevronDown })],
  template: `
    <ui-field
      [controlId]="selectId()"
      [label]="label()"
      [hint]="hint()"
      [state]="state()"
      [required]="required()"
    >
      <div class="relative">
        <select
          [id]="selectId()"
          [attr.name]="name() ?? null"
          [attr.aria-describedby]="hint() ? hintId() : null"
          [required]="required()"
          [disabled]="disabled()"
          [attr.aria-invalid]="state() === 'error' ? 'true' : null"
          [class]="selectClass()"
          (change)="onChange($event)"
        >
          @if (placeholder()) {
            <option value="" [selected]="value() === null" [disabled]="required()">
              {{ placeholder() }}
            </option>
          }
          @for (option of options(); track option.value) {
            <option
              [value]="option.value"
              [selected]="option.value === value()"
              [disabled]="option.disabled ?? false"
            >
              {{ option.label }}
            </option>
          }
        </select>
        <ng-icon
          name="lucideChevronDown"
          aria-hidden="true"
          class="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </ui-field>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSelect {
  readonly value = model<string | null>(null);
  readonly options = input.required<readonly UiSelectOption[]>();
  readonly label = input<string>();
  readonly hint = input<string>();
  readonly state = input<UiState>('default');
  readonly size = input<UiSize>('md');
  readonly placeholder = input<string>();
  readonly name = input<string>();
  readonly required = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly selectId = input(nextUiId('ui-select'));

  protected readonly hintId = computed(() => hintIdFor(this.selectId()));
  protected readonly selectClass = computed(
    () =>
      `w-full min-w-0 appearance-none rounded-lg border bg-transparent ps-3 pe-9 text-foreground outline-none transition-colors duration-150 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASS[this.size()]} ${FIELD_STATE_CLASS[this.state()]}`,
  );

  protected onChange(event: Event): void {
    const selected = (event.target as HTMLSelectElement).value;
    this.value.set(selected === '' ? null : selected);
  }
}
