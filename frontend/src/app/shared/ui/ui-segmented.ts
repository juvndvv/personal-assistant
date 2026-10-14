import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
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
      class="inline-flex w-full gap-1 rounded-xl bg-muted p-1"
    >
      @for (option of options(); track option.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="option.value === value()"
          [tabIndex]="option.value === value() ? 0 : -1"
          class="min-h-11 flex-1 rounded-lg px-3 text-sm font-medium transition-colors"
          [class]="
            option.value === value()
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
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
