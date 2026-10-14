import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { hintIdFor } from './field-accessibility';
import { UiField } from './ui-field';
import { UiState, nextUiId } from './ui-types';

export interface UiComboboxOption {
  value: string;
  label: string;
}

const STATE_CLASS: Record<UiState, string> = {
  default: 'border-input focus-visible:border-ring focus-visible:ring-ring/50',
  warning: 'border-warning focus-visible:ring-warning/30',
  error: 'border-destructive focus-visible:ring-destructive/20',
};

@Component({
  selector: 'ui-combobox',
  imports: [UiField],
  template: `
    <ui-field
      [controlId]="inputId()"
      [label]="label()"
      [hint]="hint()"
      [state]="state()"
      [required]="required()"
    >
      <div class="relative">
        <ng-content select="[uiComboboxPrefix]" />
        <input
          type="text"
          role="combobox"
          autocomplete="off"
          [id]="inputId()"
          [attr.name]="name() ?? null"
          [attr.aria-label]="label() ? null : (ariaLabel() ?? null)"
          [attr.aria-expanded]="expanded()"
          [attr.aria-controls]="listId()"
          [attr.aria-autocomplete]="'list'"
          [attr.aria-activedescendant]="activeOptionId()"
          [attr.aria-describedby]="hint() ? hintId() : null"
          [attr.aria-invalid]="state() === 'error' ? 'true' : null"
          [attr.maxlength]="maxlength() ?? null"
          [placeholder]="placeholder() ?? ''"
          [disabled]="disabled()"
          [value]="query()"
          [class]="inputClass()"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
          (focus)="focused.set(true)"
          (blur)="onBlur()"
        />
        <ul
          role="listbox"
          [id]="listId()"
          [attr.aria-label]="label() ?? ariaLabel() ?? null"
          [hidden]="!expanded()"
          class="absolute inset-x-0 top-full z-50 mt-2 max-h-64 overflow-auto rounded-menu bg-popover p-1.5 text-popover-foreground"
        >
          @for (option of options(); track option.value; let index = $index) {
            <li
              role="option"
              [id]="optionId(index)"
              [attr.aria-selected]="index === activeIndex()"
              class="cursor-pointer rounded-menu-item px-3 py-2.5 text-sm hover:bg-hover"
              [class.bg-accent]="index === activeIndex()"
              [class.font-medium]="index === activeIndex()"
              tabindex="-1"
              (mousedown)="$event.preventDefault()"
              (click)="choose(option)"
              (keydown.enter)="choose(option)"
            >
              {{ option.label }}
            </li>
          }
        </ul>
      </div>
    </ui-field>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiCombobox {
  readonly query = model('');
  readonly options = input<readonly UiComboboxOption[]>([]);
  readonly label = input<string>();
  readonly ariaLabel = input<string>();
  readonly hint = input<string>();
  readonly state = input<UiState>('default');
  readonly placeholder = input<string>();
  readonly name = input<string>();
  readonly maxlength = input<number>();
  readonly required = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly inputId = input(nextUiId('ui-combobox'));

  readonly optionSelected = output<UiComboboxOption>();
  readonly submitted = output<string>();
  readonly backspaceOnEmpty = output<void>();

  protected readonly focused = signal(false);
  private readonly dismissed = signal(false);
  protected readonly activeIndex = signal(-1);

  protected readonly listId = computed(() => `${this.inputId()}-list`);
  protected readonly hintId = computed(() => hintIdFor(this.inputId()));
  protected readonly expanded = computed(
    () => this.focused() && !this.dismissed() && this.options().length > 0,
  );
  protected readonly activeOptionId = computed(() => {
    const index = this.activeIndex();
    return this.expanded() && index >= 0 && index < this.options().length
      ? this.optionId(index)
      : null;
  });
  protected readonly inputClass = computed(
    () =>
      `h-10 w-full min-w-0 rounded-lg border bg-transparent px-3 text-base outline-none transition-colors duration-150 placeholder:text-subtle-foreground focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${STATE_CLASS[this.state()]}`,
  );

  protected optionId(index: number): string {
    return `${this.inputId()}-option-${index}`;
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.dismissed.set(false);
    this.activeIndex.set(-1);
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.activeIndex.set(-1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.move(event.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Enter':
        event.preventDefault();
        this.commit();
        break;
      case 'Escape':
        if (this.expanded()) {
          event.preventDefault();
          event.stopPropagation();
          this.dismissed.set(true);
        }
        break;
      case 'Backspace':
        if (this.query() === '') {
          this.backspaceOnEmpty.emit();
        }
        break;
    }
  }

  protected choose(option: UiComboboxOption): void {
    this.activeIndex.set(-1);
    this.optionSelected.emit(option);
  }

  private move(step: number): void {
    const count = this.options().length;
    if (count === 0) {
      return;
    }
    this.dismissed.set(false);
    this.activeIndex.update((index) =>
      index < 0 ? (step > 0 ? 0 : count - 1) : (index + step + count) % count,
    );
  }

  private commit(): void {
    const option = this.expanded() ? this.options()[this.activeIndex()] : undefined;
    if (option !== undefined) {
      this.choose(option);
      return;
    }
    this.submitted.emit(this.query());
  }
}
