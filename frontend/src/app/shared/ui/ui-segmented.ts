import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
} from '@angular/core';

export interface UiSegmentOption {
  value: string;
  label: string;
}

@Component({
  selector: 'ui-segmented',
  template: `
    <div
      role="radiogroup"
      [attr.aria-label]="ariaLabel()"
      class="relative grid w-full auto-cols-fr grid-flow-col gap-1 rounded-capsule p-1"
      [class]="onGlass() ? 'glass-fill' : 'bg-muted dark:bg-grouped'"
      [style.--segment-count]="options().length"
      [style.--segment-index]="selectedIndex()"
    >
      @if (selectedIndex() >= 0) {
        <span
          aria-hidden="true"
          data-testid="segmented-indicator"
          class="segment-indicator pointer-events-none absolute inset-y-1 start-1 rounded-capsule shadow-sm ring-1 ring-segment-indicator-edge ring-inset transition-transform duration-[350ms] ease-spring"
          [class]="onGlass() ? 'bg-segment-indicator-on-glass' : 'bg-segment-indicator'"
        ></span>
      }
      @for (option of options(); track option.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="option.value === value()"
          [tabIndex]="option.value === value() ? 0 : -1"
          class="relative min-h-11 min-w-0 truncate rounded-capsule px-3 text-sm transition-colors duration-150"
          [class]="
            option.value === value()
              ? 'font-semibold text-foreground'
              : 'font-medium text-muted-foreground hover:text-foreground'
          "
          (click)="value.set(option.value)"
          (keydown)="onKeydown($event)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSegmented {
  readonly options = input.required<readonly UiSegmentOption[]>();
  readonly value = model.required<string>();
  readonly ariaLabel = input<string>();
  readonly onGlass = input(false, { transform: booleanAttribute });

  protected readonly selectedIndex = computed(() =>
    this.options().findIndex((option) => option.value === this.value()),
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected onKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const options = this.options();
    const current = options.findIndex((option) => option.value === this.value());
    const next = (current + step + options.length) % options.length;
    const target = options[next];
    if (target === undefined) {
      return;
    }
    this.value.set(target.value);
    this.host.nativeElement.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  }
}
